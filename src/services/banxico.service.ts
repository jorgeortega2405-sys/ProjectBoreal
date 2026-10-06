import { pool } from '../config/database.config.js';
import { deleteCache, deleteCachePattern, publishGiveawayEvent } from '../config/redis.config.js';
import { recordAudit } from './audit.service.js';
import { checkAndTriggerGiveawayThreshold } from './giveaways.service.js';
import { logger } from './logger.service.js';
import { RowDataPacket } from 'mysql2/promise';

interface QueueRow extends RowDataPacket {
  attempts: number;
  currency: string;
  customer_name: string;
  customer_phone: string;
  expected_amount: number;
  giveaway_id: number;
  id: number;
  max_attempts: number;
  order_id: number;
  order_status: string;
  order_uuid: string;
  receipt_filename: string | null;
  ticket_count: number;
  ticket_numbers: string | number[];
  tracking_key: string;
}

export interface BanxicoVerificationResult {
  details?: Record<string, unknown>;
  matched: boolean;
  message: string;
  status: 'liquidated' | 'pending' | 'rejected';
}

export async function validateSpeiPayment(
  trackingKey: string,
  amount: number,
  beneficiaryAccount?: string,
  senderBank?: string,
  receiverBank?: string,
  dateStr?: string
): Promise<BanxicoVerificationResult> {
  const cleanKey = trackingKey ? trackingKey.trim().toUpperCase() : '';
  if (!cleanKey || cleanKey === 'PENDING_OCR' || amount <= 0) {
    return {
      matched: false,
      message: 'En espera de procesamiento OCR para extracción de clave de rastreo SPEI.',
      status: 'pending',
    };
  }

  if (cleanKey.startsWith('INTRA-')) {
    return {
      details: { trackingKey: cleanKey },
      matched: true,
      message: 'Transferencia intrabancaria confirmada.',
      status: 'liquidated',
    };
  }

  try {
    const initRes = await fetch('https://www.banxico.org.mx/cep/', {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });

    const cookie = initRes.headers.get('set-cookie') || '';
    const now = new Date();
    const formattedDate = dateStr || `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

    const postRes = await fetch('https://www.banxico.org.mx/cep/valida.do', {
      body: new URLSearchParams({
        captcha: 'c',
        criterio: cleanKey,
        cuenta: beneficiaryAccount ? beneficiaryAccount.replace(/\D/g, '') : '',
        emisor: senderBank || '90646',
        fecha: formattedDate,
        monto: amount.toFixed(2),
        receptor: receiverBank || '40012',
        receptorParticipante: '0',
        tipoConsulta: '0',
        tipoCriterio: 'T',
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
        Referer: 'https://www.banxico.org.mx/cep/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      method: 'POST',
    });

    if (postRes.status !== 200) {
      return {
        matched: false,
        message: `Servicio Banxico CEP respondió con código HTTP ${postRes.status}.`,
        status: 'pending',
      };
    }

    const html = await postRes.text();
    const upperHtml = html.toUpperCase();

    if (html.includes('Las instituciones financieras emisora y receptora') && html.includes('son iguales')) {
      return {
        details: { intrabank: true },
        matched: true,
        message: 'Transferencia intrabancaria confirmada entre cuentas de la misma institución.',
        status: 'liquidated',
      };
    }

    const hasLiquidated = upperHtml.includes('LIQUIDADO') || upperHtml.includes('ESTADO DEL PAGO: LIQUIDADO');
    const hasComprobante = upperHtml.includes('COMPROBANTE ELECTRÓNICO DE PAGO') || upperHtml.includes('COMPROBANTE ELECTRONICO DE PAGO') || upperHtml.includes('SELLO DIGITAL');

    if (hasLiquidated || hasComprobante) {
      return {
        details: {
          amount,
          date: formattedDate,
          trackingKey: cleanKey,
        },
        matched: true,
        message: 'Pago SPEI liquidado y certificado exitosamente en Banxico CEP.',
        status: 'liquidated',
      };
    }

    if (html.includes('no ha recibido una orden de pago') || html.includes('Operación no encontrada')) {
      return {
        matched: false,
        message: 'Operación aún en tránsito en SPEI o pendiente de liquidación.',
        status: 'pending',
      };
    }

    return {
      matched: false,
      message: 'Liquidación aún no confirmada por Banxico CEP.',
      status: 'pending',
    };
  } catch (err) {
    logger.app.error('Error al consultar Banxico CEP desde Node.js', err);
    return {
      matched: false,
      message: 'Fallo de conectividad temporal con Banxico CEP.',
      status: 'pending',
    };
  }
}

export async function processBanxicoBatch(): Promise<number> {
  try {
    const [queueRows] = await pool.query<QueueRow[]>(
      `SELECT q.id, q.order_id, q.tracking_key,
              CAST(q.expected_amount AS DOUBLE) AS expected_amount,
              q.attempts, q.max_attempts,
              o.uuid AS order_uuid, o.giveaway_id, o.ticket_numbers, o.ticket_count,
              o.customer_name, o.customer_phone, o.currency, o.status AS order_status,
              o.receipt_filename
       FROM spei_validation_queue q
       INNER JOIN orders o ON q.order_id = o.id
       WHERE q.status IN ('pending', 'verifying') AND q.next_retry_at <= NOW()
       LIMIT 25`
    );

    if (queueRows.length === 0) return 0;

    let processedCount = 0;

    for (const item of queueRows) {
      try {
        const result = await validateSpeiPayment(item.tracking_key, item.expected_amount);

        if (result.matched && result.status === 'liquidated') {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();

            await conn.query(
              `UPDATE orders
               SET status = 'completed'
               WHERE id = ?`,
              [item.order_id]
            );

            const tickets: number[] = typeof item.ticket_numbers === 'string'
              ? JSON.parse(item.ticket_numbers)
              : item.ticket_numbers;

            if (tickets.length > 0) {
              await conn.query(
                `UPDATE giveaway_tickets
                 SET status = 'paid', reserved_until = NULL
                 WHERE order_id = ? AND ticket_number IN (?)`,
                [item.order_id, tickets]
              );
            }

            await conn.query(
              `UPDATE spei_validation_queue
               SET status = 'matched', last_checked_at = NOW(), banxico_response = ?
               WHERE id = ?`,
              [JSON.stringify(result), item.id]
            );

            await conn.commit();
            processedCount++;

            await deleteCache('giveaways:active');
            await deleteCachePattern('giveaway:*');

            await publishGiveawayEvent('boreal:giveaways', {
              giveaway_id: item.giveaway_id,
              ticket_count: item.ticket_count,
              ticket_numbers: tickets,
              type: 'TICKETS_PAID',
            });

            await checkAndTriggerGiveawayThreshold(item.giveaway_id);

            await recordAudit({
              action: 'PAYMENT_LIQUIDATED',
              actor_type: 'system',
              amount: item.expected_amount,
              currency: item.currency || 'MXN',
              customer_name: item.customer_name,
              customer_phone: item.customer_phone,
              details: {
                banxico_response: result,
                ticket_count: item.ticket_count,
                ticket_numbers: tickets,
                tracking_key: item.tracking_key,
              },
              ip_address: '127.0.0.1',
              new_status: 'completed',
              order_id: item.order_id,
              order_uuid: item.order_uuid,
              previous_status: item.order_status || 'in_review',
              user_agent: 'ProjectBoreal/BanxicoBatchWorker',
            });

            logger.app.info(
              `Pago SPEI verificado con éxito para la orden ${item.order_uuid}. Clave: ${item.tracking_key}`
            );
          } catch (txError) {
            await conn.rollback();
            logger.db.error(`Error en transacción de validación de orden ${item.order_uuid}`, txError);
          } finally {
            conn.release();
          }
        } else {
          const nextAttempts = item.attempts + 1;
          if (nextAttempts >= item.max_attempts) {
            if (item.receipt_filename) {
              await pool.query(
                `UPDATE spei_validation_queue
                 SET attempts = ?, status = 'failed', last_checked_at = NOW(), banxico_response = ?
                 WHERE id = ?`,
                [nextAttempts, JSON.stringify(result), item.id]
              );
              logger.app.info(
                `Orden ${item.order_uuid} concluyó reintentos automáticos Banxico CEP; permanece en revisión por comprobante adjunto.`
              );
            } else {
              const failConn = await pool.getConnection();
              try {
                await failConn.beginTransaction();

                await failConn.query(
                  `UPDATE spei_validation_queue
                   SET attempts = ?, status = 'failed', last_checked_at = NOW(), banxico_response = ?
                   WHERE id = ?`,
                  [nextAttempts, JSON.stringify(result), item.id]
                );

                await failConn.query(
                  `UPDATE orders
                   SET status = 'cancelled'
                   WHERE id = ? AND status = 'in_review'`,
                  [item.order_id]
                );

                await failConn.query(
                  `UPDATE giveaway_tickets
                   SET status = 'available', order_id = NULL, reserved_until = NULL
                   WHERE order_id = ? AND status = 'reserved'`,
                  [item.order_id]
                );

                await failConn.query(
                  `UPDATE giveaways
                   SET available_tickets = LEAST(total_tickets, available_tickets + ?)
                   WHERE id = ?`,
                  [item.ticket_count, item.giveaway_id]
                );

                await failConn.commit();

                await deleteCache(`giveaway:${item.order_uuid}:tickets`);
                await deleteCache('giveaways:active');
                await deleteCachePattern('giveaway:*');

                const tickets: number[] = typeof item.ticket_numbers === 'string'
                  ? JSON.parse(item.ticket_numbers)
                  : item.ticket_numbers;

                await publishGiveawayEvent('boreal:giveaways', {
                  giveaway_id: item.giveaway_id,
                  released_count: item.ticket_count,
                  ticket_numbers: tickets,
                  type: 'TICKETS_RELEASED',
                });

                await recordAudit({
                  action: 'PAYMENT_REJECTED',
                  actor_type: 'system',
                  amount: item.expected_amount,
                  currency: item.currency || 'MXN',
                  customer_name: item.customer_name,
                  customer_phone: item.customer_phone,
                  details: {
                    attempts: nextAttempts,
                    banxico_response: result,
                    reason: 'MAX_VALIDATION_ATTEMPTS_EXCEEDED',
                    tracking_key: item.tracking_key,
                  },
                  ip_address: '127.0.0.1',
                  new_status: 'cancelled',
                  order_id: item.order_id,
                  order_uuid: item.order_uuid,
                  previous_status: item.order_status,
                  user_agent: 'ProjectBoreal/BanxicoBatchWorker',
                });

                logger.app.warn(
                  `Orden ${item.order_uuid} superó los intentos de validación Banxico. Boletos liberados y orden cancelada.`
                );
              } catch (failTxError) {
                await failConn.rollback();
                logger.db.error(`Error al cancelar orden y liberar boletos por límite SPEI ${item.order_uuid}`, failTxError);
              } finally {
                failConn.release();
              }
            }
          } else {
            await pool.query(
              `UPDATE spei_validation_queue
               SET attempts = ?, status = 'verifying', last_checked_at = NOW(),
                   next_retry_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE), banxico_response = ?
               WHERE id = ?`,
              [nextAttempts, JSON.stringify(result), item.id]
            );
            logger.app.info(
              `Orden ${item.order_uuid} aún en proceso en SPEI. Reintento programado en 5 minutos (Intento ${nextAttempts}/${item.max_attempts}).`
            );
          }
        }
      } catch (itemError) {
        logger.app.error(`Error al procesar lote Banxico para la orden ${item.order_uuid}`, itemError);
      }
    }

    return processedCount;
  } catch (error) {
    logger.app.error('Error general al procesar lote de validaciones Banxico', error);
    return 0;
  }
}
