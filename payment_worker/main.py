import concurrent.futures
import datetime
import json
import logging
import os
import signal
import sys
import time
from typing import Dict, Any, List, Optional
import uuid
import dotenv
import pymysql
import redis

from ocr_engine import OCREngine
from receipt_parser import ReceiptParser
from banxico_client import BanxicoClient
from bank_catalog import BANCO_CODES, get_bank_code_by_clabe
from image_processor import ImageProcessor
from s3_client import download_s3_object

dotenv.load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

LOG_DIR = os.getenv("LOG_DIR", os.path.join(os.path.dirname(__file__), "..", "logs", "worker"))
os.makedirs(LOG_DIR, exist_ok=True)
log_file = os.path.join(LOG_DIR, f"{time.strftime('%Y-%m-%d')}.log")

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [PAYMENT-WORKER] %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("payment_worker")

STORAGE_RECEIPTS_DIR = os.getenv(
    "STORAGE_RECEIPTS_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "storage", "receipts"))
)
os.makedirs(STORAGE_RECEIPTS_DIR, exist_ok=True)

MAX_WORKERS = int(os.getenv("PAYMENT_WORKER_CONCURRENCY", "5"))
BATCH_SIZE = int(os.getenv("PAYMENT_WORKER_BATCH_SIZE", "5"))
CYCLE_SLEEP_SECONDS = float(os.getenv("PAYMENT_WORKER_SLEEP", "2.0"))
LOCK_TTL_SECONDS = 180
BACKOFF_INTERVALS = [30, 90, 180, 300, 600, 900]

def get_db_connection(max_retries: int = 3, retry_delay: float = 1.0):
    primary_host = os.getenv("DB_LOTTERY_HOST") or os.getenv("DB_HOST", "127.0.0.1")
    hosts_to_try = [primary_host]
    if primary_host == "mysql" and "127.0.0.1" not in hosts_to_try:
        hosts_to_try.append("127.0.0.1")
    elif primary_host in ("127.0.0.1", "localhost") and "mysql" not in hosts_to_try:
        hosts_to_try.append("mysql")

    port = int(os.getenv("DB_LOTTERY_PORT") or os.getenv("DB_PORT", 3306))
    user = os.getenv("DB_LOTTERY_USER") or os.getenv("DB_USER", "")
    password = os.getenv("DB_LOTTERY_PASSWORD") or os.getenv("DB_PASSWORD", "")
    database = os.getenv("DB_LOTTERY_NAME") or os.getenv("DB_NAME", "db_lottery")

    last_err = None
    for attempt in range(max_retries):
        for host in hosts_to_try:
            try:
                return pymysql.connect(
                    host=host,
                    port=port,
                    user=user,
                    password=password,
                    database=database,
                    cursorclass=pymysql.cursors.DictCursor,
                    autocommit=False,
                    connect_timeout=5,
                    read_timeout=15,
                    write_timeout=15
                )
            except pymysql.err.OperationalError as e:
                last_err = e
        if attempt < max_retries - 1:
            time.sleep(retry_delay)

    raise last_err or pymysql.err.OperationalError(2003, f"No se pudo conectar a MySQL en los hosts: {hosts_to_try}")

def get_redis_client():
    pwd = os.getenv("REDIS_PASSWORD", "")
    primary_host = os.getenv("REDIS_HOST", "127.0.0.1")
    hosts_to_try = [primary_host]
    if primary_host == "redis" and "127.0.0.1" not in hosts_to_try:
        hosts_to_try.append("127.0.0.1")
    elif primary_host in ("127.0.0.1", "localhost") and "redis" not in hosts_to_try:
        hosts_to_try.append("redis")

    port = int(os.getenv("REDIS_PORT", 6379))
    for host in hosts_to_try:
        try:
            client = redis.Redis(
                host=host,
                port=port,
                password=pwd if pwd else None,
                decode_responses=True,
                socket_timeout=5,
                socket_connect_timeout=5
            )
            client.ping()
            return client
        except Exception:
            continue

    return redis.Redis(
        host=primary_host,
        port=port,
        password=pwd if pwd else None,
        decode_responses=True
    )

class ReceiptWorker:
    def __init__(self):
        self.ocr = OCREngine(lang="es-MX")
        self.redis = get_redis_client()
        self.worker_id = f"worker-{os.getpid()}-{int(time.time())}"
        self.running = True
        self.last_sweep_time = 0
        self.executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=MAX_WORKERS,
            thread_name_prefix="PaymentWorkerThread"
        )
        logger.info(f"Payment Worker de Producción inicializado. ID: {self.worker_id}. Concurrencia: {MAX_WORKERS} hilos.")

    def handle_shutdown(self, signum, frame):
        logger.info(f"Señal de terminación recibida ({signum}). Apagando worker de forma segura...")
        self.running = False

    def emit_heartbeat(self):
        payload = json.dumps({
            "timestamp": time.time(),
            "worker_id": self.worker_id,
            "pid": os.getpid(),
            "status": "running",
            "circuit_breaker": BanxicoClient.get_circuit_status()
        })
        try:
            self.redis.set("boreal:worker:heartbeat", payload, ex=35)
        except Exception:
            try:
                self.redis = get_redis_client()
                self.redis.set("boreal:worker:heartbeat", payload, ex=35)
            except Exception as e:
                logger.warning(f"No se pudo emitir heartbeat a Redis: {e}")

    def fetch_and_reserve_batch(self) -> List[Dict[str, Any]]:
        queued_uuid = None
        try:
            queued_uuid = self.redis.rpop("boreal:queue:receipts")
        except Exception as q_err:
            logger.debug(f"Aviso al consultar cola Redis: {q_err}")

        conn = get_db_connection()
        reserved_orders: List[Dict[str, Any]] = []
        try:
            with conn.cursor() as cur:
                if queued_uuid:
                    cur.execute("""
                        SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone, o.customer_state,
                               o.ticket_count, o.ticket_numbers, CAST(o.total_amount AS DOUBLE) as total_amount,
                               o.currency, o.concept_reference, o.status, o.receipt_url, o.receipt_filename, o.tracking_key,
                               o.created_at,
                               g.uuid AS giveaway_uuid,
                               COALESCE(q.attempts, 0) AS queue_attempts,
                               COALESCE(q.max_attempts, 6) AS queue_max_attempts
                        FROM orders o
                        INNER JOIN giveaways g ON o.giveaway_id = g.id
                        LEFT JOIN spei_validation_queue q ON q.order_id = o.id
                        WHERE o.uuid = %s
                          AND o.status = 'in_review'
                          AND o.receipt_filename IS NOT NULL
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    """, (queued_uuid,))
                    candidates = cur.fetchall()
                else:
                    cur.execute("""
                        SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone, o.customer_state,
                               o.ticket_count, o.ticket_numbers, CAST(o.total_amount AS DOUBLE) as total_amount,
                               o.currency, o.concept_reference, o.status, o.receipt_url, o.receipt_filename, o.tracking_key,
                               o.created_at,
                               g.uuid AS giveaway_uuid,
                               COALESCE(q.attempts, 0) AS queue_attempts,
                               COALESCE(q.max_attempts, 6) AS queue_max_attempts
                        FROM orders o
                        INNER JOIN giveaways g ON o.giveaway_id = g.id
                        LEFT JOIN spei_validation_queue q ON q.order_id = o.id
                        WHERE o.status = 'in_review'
                          AND o.receipt_filename IS NOT NULL
                          AND (q.status IS NULL OR q.status IN ('pending', 'verifying'))
                          AND (q.next_retry_at IS NULL OR q.next_retry_at <= NOW())
                        ORDER BY o.created_at ASC
                        LIMIT %s
                        FOR UPDATE SKIP LOCKED
                    """, (BATCH_SIZE,))
                    candidates = cur.fetchall()

                if not candidates:
                    conn.rollback()
                    return []

                for order in candidates:
                    cur.execute("""
                        INSERT INTO spei_validation_queue (
                            order_id, tracking_key, expected_amount, attempts, max_attempts, next_retry_at, status
                        ) VALUES (%s, %s, %s, %s, %s, DATE_ADD(NOW(), INTERVAL 2 MINUTE), 'verifying')
                        ON DUPLICATE KEY UPDATE
                            status = 'verifying',
                            next_retry_at = DATE_ADD(NOW(), INTERVAL 2 MINUTE),
                            last_checked_at = NOW()
                    """, (
                        order["id"],
                        order.get("tracking_key") or "PENDING_OCR",
                        order["total_amount"],
                        order.get("queue_attempts", 0),
                        order.get("queue_max_attempts", 6)
                    ))

                conn.commit()

            for order in candidates:
                lock_key = f"boreal:lock:order:{order['id']}"
                acquired = self.redis.set(lock_key, self.worker_id, nx=True, ex=LOCK_TTL_SECONDS)
                if acquired:
                    reserved_orders.append(order)
                else:
                    logger.warning(f"Orden {order['uuid']} ya tiene lock activo en Redis. Omitiendo.")

            return reserved_orders
        except Exception as e:
            conn.rollback()
            logger.error(f"Error al reservar lote con FOR UPDATE SKIP LOCKED: {e}", exc_info=True)
            return []
        finally:
            conn.close()

    def process_order(self, order: Dict[str, Any]) -> bool:
        order_uuid = order["uuid"]
        order_id = order["id"]
        receipt_filename = order.get("receipt_filename")
        lock_key = f"boreal:lock:order:{order_id}"

        conn = get_db_connection()
        try:
            if not receipt_filename:
                logger.warning(f"Orden {order_uuid} no tiene comprobante adjunto. Cancelando...")
                self._cancel_and_release_order(order, conn, ["Comprobante ausente o nulo"])
                return False

            file_path = os.path.join(STORAGE_RECEIPTS_DIR, receipt_filename)
            if not os.path.exists(file_path):
                downloaded = download_s3_object(f"receipts/{receipt_filename}", file_path)
                if not downloaded or not os.path.exists(file_path):
                    logger.warning(f"Archivo de comprobante no encontrado en S3 ni en disco: {file_path}")
                    self._cancel_and_release_order(order, conn, [f"Archivo físico {receipt_filename} no encontrado en S3"])
                    return False

            logger.info(f"[{order_uuid}] Procesando comprobante: {receipt_filename}")

            with conn.cursor() as cur:
                cur.execute("""
                    SELECT ba.id, ba.bank_name, ba.account_holder, ba.clabe, ba.account_number, ba.card_number
                    FROM giveaway_bank_accounts gba
                    INNER JOIN bank_accounts ba ON gba.bank_account_id = ba.id
                    WHERE gba.giveaway_id = %s AND gba.is_active = 1 AND ba.is_active = 1
                """, (order["giveaway_id"],))
                bank_accounts = cur.fetchall()

            if not bank_accounts:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT id, bank_name, account_holder, clabe, account_number, card_number
                        FROM bank_accounts
                        WHERE is_active = 1
                    """)
                    bank_accounts = cur.fetchall()

            if not bank_accounts:
                logger.error(f"[{order_uuid}] No se encontró cuenta bancaria activa para sorteo {order['giveaway_id']}")
                self._schedule_retry(order, conn, {"error": "Cuenta bancaria no configurada"}, is_transient=True)
                return False

            try:
                raw_text, dhash_str = self.ocr.extract_text_and_hash(file_path)
                parsed = ReceiptParser.parse(raw_text)
            except Exception as ocr_err:
                logger.error(f"[{order_uuid}] Error en motor OCR ({file_path}): {ocr_err}")
                self._schedule_retry(order, conn, {"error": f"Fallo motor OCR: {str(ocr_err)}"}, is_transient=True)
                return False

            dhash_dup_order = ImageProcessor.check_and_register_dhash(self.redis, dhash_str, order_uuid)
            if dhash_dup_order:
                logger.warning(f"[{order_uuid}] Replay attack detectado por dHash visual idéntico a orden {dhash_dup_order}")
                self._cancel_and_release_order(
                    order, conn,
                    [f"Comprobante visualmente idéntico a comprobante registrado previamente en orden {dhash_dup_order}."],
                    parsed=parsed
                )
                return False

            validation = ReceiptParser.validate_against_order(parsed, order, bank_accounts)
            raw_tracking_key = validation.get("tracking_key") or order.get("tracking_key")
            tracking_key = raw_tracking_key.strip().upper() if (raw_tracking_key and isinstance(raw_tracking_key, str)) else None

            # Detección de replay attack si hay clave de rastreo
            if tracking_key:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT id, uuid FROM orders
                        WHERE tracking_key = %s AND id != %s AND status IN ('completed', 'in_review')
                        LIMIT 1
                    """, (tracking_key, order_id))
                    duplicate = cur.fetchone()
                    if duplicate:
                        validation["valid"] = False
                        validation["fatal_error"] = True
                        validation["errors"].append(
                            f"Clave de rastreo {tracking_key} ya fue registrada o liquidada en la orden {duplicate['uuid']} (Replay Attack prevenido)."
                        )

            # Si hay rechazo fatal (monto incorrecto, replay attack, comprobante fallido):
            if validation.get("fatal_error"):
                logger.warning(f"[{order_uuid}] RECHAZO FATAL: {validation['errors']}")
                self._cancel_and_release_order(order, conn, validation["errors"], parsed=parsed)
                return False

            # Caso 1: Transferencia Intrabancaria (Mismo Banco)
            is_intrabank = validation.get("is_intrabank", False)
            dest_verified = validation.get("destination_verified", False)
            if is_intrabank:
                if not dest_verified:
                    logger.warning(f"[{order_uuid}] RECHAZO FATAL: Transferencia intrabancaria hacia cuenta no autorizada.")
                    self._cancel_and_release_order(
                        order, conn,
                        ["Transferencia entre cuentas del mismo banco rechazada: la cuenta, tarjeta o titular receptor no corresponde a las cuentas oficiales del organizador."],
                        parsed=parsed
                    )
                    return False
                else:
                    logger.info(f"[{order_uuid}] Transferencia intrabancaria detectada ({validation.get('matched_account', {}).get('bank_name')}). No certificable en Banxico CEP. Enviando a revisión manual.")
                    with conn.cursor() as cur:
                        cur.execute("""
                            UPDATE spei_validation_queue
                            SET status = 'manual_review', last_checked_at = NOW(),
                                banxico_response = %s
                            WHERE order_id = %s
                        """, (json.dumps({
                            "ocr_parsed": parsed,
                            "validation": validation,
                            "notice": "Transferencia intrabancaria requiere validación manual por el organizador."
                        }), order_id))
                    conn.commit()
                    return False

            # Caso 2: Transferencia Interbancaria SPEI
            if not tracking_key:
                validation["valid"] = False
                validation["errors"].append(
                    "Clave de rastreo SPEI no detectada en comprobante ni proporcionada en la orden. Reintentando análisis."
                )

            banxico_res = None
            if tracking_key:
                try:
                    banxico_res = BanxicoClient.query_cep(
                        tracking_key=tracking_key,
                        amount=float(order["total_amount"]),
                        date_str=validation.get("date"),
                        beneficiary_clabe=validation.get("receiver_clabe"),
                        sender_bank_code=validation.get("sender_bank_code"),
                        receiver_bank_code=validation.get("receiver_bank_code")
                    )
                except Exception as b_err:
                    banxico_res = {
                        "verified": False,
                        "status": "unreachable",
                        "retryable": True,
                        "message": str(b_err)
                    }

            is_liquidated_by_banxico = bool(
                banxico_res
                and banxico_res.get("verified") is True
                and banxico_res.get("status") == "liquidated"
            )

            if validation["valid"] and tracking_key and is_liquidated_by_banxico:
                self._approve_and_liquidate_order(order, conn, tracking_key, parsed, validation, banxico_res)
                return True
            elif validation["valid"] and tracking_key and banxico_res and banxico_res.get("status") in ("pending", "offline", "unreachable", "circuit_open"):
                is_ext_down = banxico_res.get("status") in ("offline", "unreachable", "circuit_open")
                logger.info(f"[{order_uuid}] Comprobante válido pero Banxico en tránsito/degradado ({banxico_res.get('status')}). Programando reintento...")
                self._schedule_retry(order, conn, {"ocr_parsed": parsed, "validation": validation, "banxico": banxico_res}, is_transient=is_ext_down)
                return False
            else:
                is_ext_down = bool(banxico_res and banxico_res.get("status") in ("offline", "unreachable", "circuit_open"))
                if is_ext_down:
                    logger.info(f"[{order_uuid}] Servicio Banxico degradado ({banxico_res.get('status')}). Reintentando sin penalizar orden...")
                    self._schedule_retry(order, conn, {"ocr_parsed": parsed, "validation": validation, "banxico": banxico_res}, is_transient=True)
                    return False

                current_attempts = order.get("queue_attempts", 0) + 1
                max_attempts = order.get("queue_max_attempts", 6)

                err_list = list(validation.get("errors", []))
                if banxico_res and not is_liquidated_by_banxico and banxico_res.get("message"):
                    err_list.append(f"Banxico CEP: {banxico_res.get('message')}")
                elif not tracking_key:
                    if not any("clave de rastreo" in e.lower() for e in err_list):
                        err_list.append("Sin clave de rastreo SPEI válida.")

                if current_attempts >= max_attempts:
                    if not tracking_key:
                        logger.warning(f"[{order_uuid}] Superó intentos máximos sin detección de clave de rastreo por OCR. Enviando a revisión manual.")
                        with conn.cursor() as cur:
                            cur.execute("""
                                UPDATE spei_validation_queue
                                SET status = 'manual_review', last_checked_at = NOW(),
                                    banxico_response = %s
                                WHERE order_id = %s
                            """, (json.dumps({
                                "ocr_parsed": parsed,
                                "validation": validation,
                                "notice": "Clave de rastreo no detectada por OCR. Requiere inspección manual del comprobante."
                            }), order_id))
                        conn.commit()
                        return False
                    else:
                        logger.warning(f"[{order_uuid}] Superó intentos máximos ({current_attempts}/{max_attempts}) sin confirmación de liquidación Banxico. Cancelando y liberando boletos.")
                        self._cancel_and_release_order(order, conn, err_list, parsed=parsed, banxico_res=banxico_res)
                        return False
                else:
                    logger.info(f"[{order_uuid}] Liquidación no confirmada por Banxico CEP (Intento {current_attempts}/{max_attempts}). Programando reintento...")
                    self._schedule_retry(order, conn, {"ocr_parsed": parsed, "validation": validation, "banxico": banxico_res})
                    return False

        except Exception as e:
            conn.rollback()
            logger.error(f"[{order_uuid}] Error no controlado al procesar orden: {e}", exc_info=True)
            return False
        finally:
            conn.close()
            try:
                self.redis.delete(lock_key)
            except Exception:
                pass

    def _approve_and_liquidate_order(self, order: Dict[str, Any], conn, tracking_key: Optional[str], parsed: Any, validation: Any, banxico_res: Any):
        order_uuid = order["uuid"]
        order_id = order["id"]

        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, status, total_tickets, min_threshold_pct, countdown_hours, threshold_reached_at, uuid
                FROM giveaways
                WHERE id = %s
                FOR UPDATE
            """, (order["giveaway_id"],))
            g_row = cur.fetchone()

            if not g_row or g_row["status"] != "active":
                logger.error(f"[{order_uuid}] Intento de liquidar orden para sorteo inactivo o finalizado ({g_row['status'] if g_row else 'NO ENCONTRADO'}). Cancelando para reembolso.")
                cur.execute("""
                    UPDATE orders
                    SET status = 'cancelled', tracking_key = %s, updated_at = NOW()
                    WHERE id = %s
                """, (tracking_key, order_id))
                cur.execute("""
                    UPDATE giveaway_tickets
                    SET status = 'available', order_id = NULL, reserved_until = NULL, updated_at = NOW()
                    WHERE order_id = %s AND status = 'reserved'
                """, (order_id,))
                cur.execute("""
                    UPDATE spei_validation_queue
                    SET status = 'failed', last_checked_at = NOW(),
                        banxico_response = %s
                    WHERE order_id = %s
                """, (json.dumps({
                    "error": "Sorteo finalizado o no activo. Pago retenido para reembolso administrativo.",
                    "banxico": banxico_res
                }), order_id))
                conn.commit()
                return False

            cur.execute("""
                UPDATE orders
                SET status = 'completed', tracking_key = %s, updated_at = NOW()
                WHERE id = %s
            """, (tracking_key, order_id))

            tickets = json.loads(order["ticket_numbers"]) if isinstance(order["ticket_numbers"], str) else order["ticket_numbers"]
            if tickets:
                format_strings = ','.join(['%s'] * len(tickets))
                cur.execute(f"""
                    UPDATE giveaway_tickets
                    SET status = 'paid', reserved_until = NULL, updated_at = NOW()
                    WHERE order_id = %s AND ticket_number IN ({format_strings})
                """, [order_id] + tickets)
                if cur.rowcount < len(tickets):
                    cur.execute(f"""
                        UPDATE giveaway_tickets
                        SET status = 'paid', order_id = %s, reserved_until = NULL, updated_at = NOW()
                        WHERE giveaway_id = %s AND ticket_number IN ({format_strings}) AND status = 'available'
                    """, [order_id, order["giveaway_id"]] + tickets)

            cur.execute("""
                UPDATE spei_validation_queue
                SET status = 'matched', tracking_key = %s, last_checked_at = NOW(),
                    banxico_response = %s
                WHERE order_id = %s
            """, (tracking_key, json.dumps({
                "ocr_parsed": parsed,
                "validation": validation,
                "banxico": banxico_res
            }), order_id))

            threshold_event_payload = None
            if g_row and g_row["min_threshold_pct"] > 0 and not g_row["threshold_reached_at"]:
                cur.execute("""
                    SELECT COUNT(*) AS paid_count
                    FROM giveaway_tickets
                    WHERE giveaway_id = %s AND status = 'paid'
                """, (order["giveaway_id"],))
                cnt = cur.fetchone()
                paid_cnt = cnt["paid_count"] if cnt else 0
                total_tkts = g_row["total_tickets"] or 100
                pct_sold = (paid_cnt / total_tkts) * 100

                if pct_sold >= g_row["min_threshold_pct"]:
                    cd_hours = g_row["countdown_hours"] or 72
                    cur.execute("""
                        UPDATE giveaways
                        SET threshold_reached_at = NOW(),
                            end_date = DATE_ADD(NOW(), INTERVAL %s HOUR)
                        WHERE id = %s AND threshold_reached_at IS NULL
                    """, (cd_hours, order["giveaway_id"]))

                    if cur.rowcount > 0:
                        cur.execute("SELECT end_date, threshold_reached_at FROM giveaways WHERE id = %s", (order["giveaway_id"],))
                        updated_g = cur.fetchone()
                        threshold_event_payload = {
                            "type": "GIVEAWAY_THRESHOLD_REACHED",
                            "giveaway_uuid": g_row["uuid"],
                            "threshold_reached_at": updated_g["threshold_reached_at"].isoformat() if hasattr(updated_g["threshold_reached_at"], "isoformat") else str(updated_g["threshold_reached_at"]),
                            "end_date": updated_g["end_date"].isoformat() if hasattr(updated_g["end_date"], "isoformat") else str(updated_g["end_date"]),
                            "countdown_hours": cd_hours
                        }
                        logger.info(f"[{order_uuid}] Umbral alcanzado para sorteo {g_row['uuid']} ({pct_sold:.1f}% >= {g_row['min_threshold_pct']}%). Cronómetro de {cd_hours}h activado.")

            conn.commit()

        try:
            g_uuid = order.get("giveaway_uuid")
            to_delete = [
                "boreal:cache:giveaways:active",
                "boreal:cache:giveaways:winners",
                "boreal:cache:giveaway:daily:current",
                "giveaways:active",
                "giveaways:winners",
            ]
            if g_uuid:
                to_delete.extend([
                    f"boreal:cache:giveaway:{g_uuid}",
                    f"boreal:cache:giveaway:{g_uuid}:tickets",
                    f"giveaway:{g_uuid}",
                    f"giveaway:{g_uuid}:tickets",
                ])
            self.redis.delete(*to_delete)

            self.redis.publish("boreal:giveaways", json.dumps({
                "type": "TICKETS_PAID",
                "giveaway_id": order["giveaway_id"],
                "giveaway_uuid": order.get("giveaway_uuid"),
                "ticket_count": order["ticket_count"],
                "ticket_numbers": tickets
            }))

            if threshold_event_payload:
                self.redis.publish("boreal:giveaways", json.dumps(threshold_event_payload))

            self.redis.publish("boreal:orders", json.dumps({
                "type": "ORDER_APPROVED",
                "order_uuid": order_uuid,
                "order_id": order_id,
                "ticket_count": order["ticket_count"],
                "ticket_numbers": tickets
            }))
        except Exception as r_err:
            logger.warning(f"[{order_uuid}] Error al notificar a Redis: {r_err}")

        logger.info(f"[{order_uuid}] Orden LIQUIDADA Y PAGADA exitosamente. Boletos marcados como pagados.")

    def _cancel_and_release_order(self, order: Dict[str, Any], conn, errors: List[str], parsed: Any = None, banxico_res: Any = None):
        order_uuid = order["uuid"]
        order_id = order["id"]

        with conn.cursor() as cur:
            cur.execute("""
                UPDATE orders
                SET status = 'cancelled', updated_at = NOW()
                WHERE id = %s AND status = 'in_review'
            """, (order_id,))

            tickets = json.loads(order["ticket_numbers"]) if isinstance(order["ticket_numbers"], str) else order.get("ticket_numbers", [])
            if tickets:
                format_strings = ','.join(['%s'] * len(tickets))
                cur.execute(f"""
                    UPDATE giveaway_tickets
                    SET status = 'available', order_id = NULL, reserved_until = NULL, updated_at = NOW()
                    WHERE (order_id = %s OR (giveaway_id = %s AND ticket_number IN ({format_strings})))
                      AND status = 'reserved'
                """, [order_id, order["giveaway_id"]] + tickets)
            else:
                cur.execute("""
                    UPDATE giveaway_tickets
                    SET status = 'available', order_id = NULL, reserved_until = NULL, updated_at = NOW()
                    WHERE order_id = %s AND status = 'reserved'
                """, (order_id,))

            cur.execute("""
                UPDATE giveaways
                SET available_tickets = LEAST(total_tickets, available_tickets + %s)
                WHERE id = %s
            """, (order["ticket_count"], order["giveaway_id"]))

            cur.execute("""
                UPDATE spei_validation_queue
                SET status = 'failed', last_checked_at = NOW(),
                    banxico_response = %s
                WHERE order_id = %s
            """, (json.dumps({
                "errors": errors,
                "ocr_parsed": parsed,
                "banxico": banxico_res
            }), order_id))

            conn.commit()

        try:
            g_uuid = order.get("giveaway_uuid")
            to_delete = [
                "boreal:cache:giveaways:active",
                "boreal:cache:giveaways:winners",
                "boreal:cache:giveaway:daily:current",
                "giveaways:active",
                "giveaways:winners",
            ]
            if g_uuid:
                to_delete.extend([
                    f"boreal:cache:giveaway:{g_uuid}",
                    f"boreal:cache:giveaway:{g_uuid}:tickets",
                    f"giveaway:{g_uuid}",
                    f"giveaway:{g_uuid}:tickets",
                ])
            self.redis.delete(*to_delete)

            self.redis.publish("boreal:giveaways", json.dumps({
                "type": "TICKETS_RELEASED",
                "giveaway_id": order["giveaway_id"],
                "giveaway_uuid": order.get("giveaway_uuid"),
                "ticket_count": order["ticket_count"],
                "ticket_numbers": tickets,
                "released_count": len(tickets)
            }))

            self.redis.publish("boreal:orders", json.dumps({
                "type": "ORDER_REJECTED",
                "order_uuid": order_uuid,
                "order_id": order_id,
                "errors": errors
            }))
        except Exception as r_err:
            logger.warning(f"[{order_uuid}] Error al notificar cancelación en Redis: {r_err}")

        logger.info(f"[{order_uuid}] Orden CANCELADA y boletos LIBERADOS. Motivo: {errors}")

    def _schedule_retry(self, order: Dict[str, Any], conn, response_payload: Dict[str, Any], is_transient: bool = False):
        order_uuid = order["uuid"]
        order_id = order["id"]
        if is_transient:
            current_attempts = order.get("queue_attempts", 0)
        else:
            current_attempts = order.get("queue_attempts", 0) + 1
        max_attempts = order.get("queue_max_attempts", 6)

        idx = min(max(0, current_attempts - 1), len(BACKOFF_INTERVALS) - 1)
        delay_seconds = BACKOFF_INTERVALS[idx]
        if is_transient:
            delay_seconds = max(delay_seconds, 60)

        with conn.cursor() as cur:
            cur.execute(f"""
                UPDATE spei_validation_queue
                SET attempts = %s,
                    status = 'verifying',
                    last_checked_at = NOW(),
                    next_retry_at = DATE_ADD(NOW(), INTERVAL {delay_seconds} SECOND),
                    banxico_response = %s
                WHERE order_id = %s
            """, (current_attempts, json.dumps(response_payload), order_id))

            extension_minutes = 30 if is_transient else 15
            cur.execute(f"""
                UPDATE giveaway_tickets
                SET reserved_until = DATE_ADD(NOW(), INTERVAL {extension_minutes} MINUTE)
                WHERE order_id = %s AND status = 'reserved'
            """, (order_id,))

            conn.commit()

        logger.info(f"[{order_uuid}] Reintento programado en {delay_seconds}s (Intentos: {current_attempts}/{max_attempts}, Transitorio: {is_transient}).")

    def sweep_expired_orders(self):
        now = time.time()
        if now - self.last_sweep_time < 30:
            return
        self.last_sweep_time = now

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT o.id, o.uuid, o.giveaway_id, o.ticket_count, o.ticket_numbers, o.status AS current_status, g.uuid AS giveaway_uuid
                    FROM orders o
                    INNER JOIN giveaways g ON o.giveaway_id = g.id
                    LEFT JOIN spei_validation_queue q ON q.order_id = o.id
                    WHERE (o.status = 'pending_payment' AND o.expires_at < NOW())
                       OR (o.status = 'in_review' AND (
                            (q.status = 'failed' AND o.updated_at < NOW() - INTERVAL 30 MINUTE)
                            OR (o.created_at < NOW() - INTERVAL 48 HOUR)
                          ))
                    ORDER BY o.expires_at ASC
                    LIMIT 20
                    FOR UPDATE SKIP LOCKED
                """)
                expired_orders = cur.fetchall()

                for exp_order in expired_orders:
                    order_id = exp_order["id"]
                    order_uuid = exp_order["uuid"]
                    new_status = "expired" if exp_order.get("current_status") == "pending_payment" else "cancelled"

                    cur.execute("""
                        UPDATE orders
                        SET status = %s, updated_at = NOW()
                        WHERE id = %s
                    """, (new_status, order_id))

                    tickets = json.loads(exp_order["ticket_numbers"]) if isinstance(exp_order["ticket_numbers"], str) else exp_order.get("ticket_numbers", [])
                    if tickets:
                        format_strings = ','.join(['%s'] * len(tickets))
                        cur.execute(f"""
                            UPDATE giveaway_tickets
                            SET status = 'available', order_id = NULL, reserved_until = NULL, updated_at = NOW()
                            WHERE (order_id = %s OR (giveaway_id = %s AND ticket_number IN ({format_strings})))
                              AND status = 'reserved'
                        """, [order_id, exp_order["giveaway_id"]] + tickets)
                    else:
                        cur.execute("""
                            UPDATE giveaway_tickets
                            SET status = 'available', order_id = NULL, reserved_until = NULL, updated_at = NOW()
                            WHERE order_id = %s AND status = 'reserved'
                        """, (order_id,))

                    cur.execute("""
                        UPDATE giveaways
                        SET available_tickets = LEAST(total_tickets, available_tickets + %s)
                        WHERE id = %s
                    """, (exp_order["ticket_count"], exp_order["giveaway_id"]))

                    conn.commit()

                    try:
                        g_uuid = exp_order.get("giveaway_uuid")
                        to_delete = [
                            "boreal:cache:giveaways:active",
                            "boreal:cache:giveaway:daily:current",
                            "giveaways:active",
                        ]
                        if g_uuid:
                            to_delete.extend([
                                f"boreal:cache:giveaway:{g_uuid}",
                                f"boreal:cache:giveaway:{g_uuid}:tickets",
                                f"giveaway:{g_uuid}",
                                f"giveaway:{g_uuid}:tickets",
                            ])
                        self.redis.delete(*to_delete)

                        self.redis.publish("boreal:giveaways", json.dumps({
                            "type": "TICKETS_RELEASED",
                            "giveaway_id": exp_order["giveaway_id"],
                            "giveaway_uuid": g_uuid,
                            "ticket_count": exp_order["ticket_count"],
                            "ticket_numbers": tickets,
                            "released_count": len(tickets)
                        }))
                    except Exception:
                        pass

                    logger.info(f"[SWEEP] Orden expirada {order_uuid} cancelada. Boletos liberados a disponible.")

        except Exception as e:
            conn.rollback()
            logger.error(f"[SWEEP] Error al barrer órdenes expiradas: {e}")
        finally:
            conn.close()

    def run_cycle(self):
        try:
            batch = self.fetch_and_reserve_batch()
        except pymysql.err.OperationalError as db_err:
            logger.warning(f"Aviso de conexión BD al obtener lote: {db_err}")
            return

        if not batch:
            return

        logger.info(f"Lote reservado de {len(batch)} órdenes. Distribuyendo a {MAX_WORKERS} hilos...")

        futures = {self.executor.submit(self.process_order, order): order["uuid"] for order in batch}
        for future in concurrent.futures.as_completed(futures):
            order_uuid = futures[future]
            try:
                result = future.result()
                logger.info(f"Hilo finalizó orden {order_uuid} con estado: {'EXITOSO' if result else 'NO_LIQUIDADO'}")
            except Exception as thread_err:
                logger.error(f"Excepción no controlada en hilo para orden {order_uuid}: {thread_err}", exc_info=True)

    def run_forever(self):
        signal.signal(signal.SIGINT, self.handle_shutdown)
        signal.signal(signal.SIGTERM, self.handle_shutdown)

        logger.info("Worker Python en ejecución multi-hilo. Escuchando cola de comprobantes...")
        consecutive_db_errors = 0
        while self.running:
            self.emit_heartbeat()
            try:
                self.run_cycle()
                consecutive_db_errors = 0
            except pymysql.err.OperationalError as db_err:
                consecutive_db_errors += 1
                if consecutive_db_errors % 5 == 1:
                    logger.warning(f"Esperando conexión a base de datos MySQL ({db_err}). Reintentando en breve...")
                time.sleep(min(CYCLE_SLEEP_SECONDS * 2, 8.0))
                continue
            except Exception as e:
                logger.error(f"Error inesperado en ciclo principal del worker: {e}", exc_info=True)
            time.sleep(CYCLE_SLEEP_SECONDS)

        logger.info("Apagando ThreadPoolExecutor...")
        self.executor.shutdown(wait=True, cancel_futures=False)
        logger.info("Worker terminado limpiamente.")

if __name__ == "__main__":
    worker = ReceiptWorker()
    worker.run_forever()
