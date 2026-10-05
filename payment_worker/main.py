import json
import logging
import os
import sys
import time
from typing import Dict, Any, Optional
import dotenv
import pymysql
import redis

from ocr_engine import OCREngine
from receipt_parser import ReceiptParser
from banxico_client import BanxicoClient

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

def get_db_connection():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER", "sprite_user"),
        password=os.getenv("DB_PASSWORD", "sprite_password"),
        database=os.getenv("DB_NAME", "db_lottery"),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False
    )

def get_redis_client():
    pwd = os.getenv("REDIS_PASSWORD", "boreal_redis_auth_key_2026!")
    return redis.Redis(
        host=os.getenv("REDIS_HOST", "127.0.0.1"),
        port=int(os.getenv("REDIS_PORT", 6379)),
        password=pwd if pwd else None,
        decode_responses=True
    )

class ReceiptWorker:
    def __init__(self):
        self.ocr = OCREngine(lang="es-MX")
        self.redis = get_redis_client()
        logger.info("Worker Python inicializado exitosamente.")

    def process_order(self, order: Dict[str, Any], conn) -> bool:
        order_uuid = order["uuid"]
        receipt_filename = order.get("receipt_filename")
        if not receipt_filename:
            return False

        file_path = os.path.join(STORAGE_RECEIPTS_DIR, receipt_filename)
        if not os.path.exists(file_path):
            logger.warning(f"Archivo de comprobante no existe: {file_path}")
            return False

        logger.info(f"Procesando orden {order_uuid} - Archivo: {receipt_filename}")

        # 1. Obtener cuenta bancaria del sorteo
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ba.id, ba.bank_name, ba.account_holder, ba.clabe, ba.account_number, ba.card_number
                FROM giveaway_bank_accounts gba
                INNER JOIN bank_accounts ba ON gba.bank_account_id = ba.id
                WHERE gba.giveaway_id = %s AND gba.is_active = 1 AND ba.is_active = 1
                LIMIT 1
            """, (order["giveaway_id"],))
            bank_account = cur.fetchone()

        if not bank_account:
            logger.error(f"No se encontró cuenta bancaria activa para el sorteo {order['giveaway_id']}")
            return False

        # 2. Extracción OCR
        try:
            raw_text = self.ocr.extract_text(file_path)
            parsed = ReceiptParser.parse(raw_text)
        except Exception as e:
            logger.error(f"Fallo al ejecutar OCR en {file_path}: {e}")
            return False

        # 3. Validación de Reglas Financieras
        validation = ReceiptParser.validate_against_order(parsed, order, bank_account)
        tracking_key = validation.get("tracking_key") or order.get("tracking_key")

        # 4. Chequeo Anti-Replay si se detectó clave de rastreo
        if tracking_key:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id FROM orders
                    WHERE tracking_key = %s AND id != %s AND status = 'completed'
                    LIMIT 1
                """, (tracking_key, order["id"]))
                duplicate = cur.fetchone()
                if duplicate:
                    validation["valid"] = False
                    validation["errors"].append(f"Clave de rastreo {tracking_key} ya fue liquidada en otra orden (Replay Attack prevenido).")

        # 5. Consulta a Banxico CEP
        banxico_res = None
        if tracking_key:
            try:
                banxico_res = BanxicoClient.query_cep(
                    tracking_key=tracking_key,
                    amount=float(order["total_amount"]),
                    beneficiary_clabe=bank_account.get("clabe")
                )
            except Exception as b_err:
                banxico_res = {"verified": False, "status": "error", "message": str(b_err)}

        # 6. Decisión de Liquidación
        with conn.cursor() as cur:
            if validation["valid"]:
                logger.info(f"Comprobante VÁLIDO para orden {order_uuid}. Clave: {tracking_key}. Aprobando...")
                cur.execute("""
                    UPDATE orders
                    SET status = 'completed', tracking_key = %s
                    WHERE id = %s
                """, (tracking_key, order["id"]))

                tickets = json.loads(order["ticket_numbers"]) if isinstance(order["ticket_numbers"], str) else order["ticket_numbers"]
                if tickets:
                    format_strings = ','.join(['%s'] * len(tickets))
                    cur.execute(f"""
                        UPDATE giveaway_tickets
                        SET status = 'paid', reserved_until = NULL
                        WHERE order_id = %s AND ticket_number IN ({format_strings})
                    """, [order["id"]] + tickets)

                cur.execute("""
                    UPDATE spei_validation_queue
                    SET status = 'matched', last_checked_at = NOW(),
                        banxico_response = %s
                    WHERE order_id = %s
                """, (json.dumps({
                    "ocr_parsed": parsed,
                    "validation": validation,
                    "banxico": banxico_res
                }), order["id"]))

                conn.commit()

                # Limpieza de caché e invalidación en Redis
                try:
                    self.redis.delete("giveaways:active")
                    keys = self.redis.keys("giveaway:*")
                    if keys:
                        self.redis.delete(*keys)
                    self.redis.publish("boreal:giveaways", json.dumps({
                        "type": "TICKETS_PAID",
                        "giveaway_id": order["giveaway_id"],
                        "ticket_count": order["ticket_count"],
                        "ticket_numbers": tickets
                    }))
                except Exception as r_err:
                    logger.warning(f"Error al notificar a Redis: {r_err}")

                logger.info(f"Orden {order_uuid} LIQUIDADA Y PAGADA con éxito.")
                return True
            else:
                logger.warning(f"Comprobante RECHAZADO o pendiente de revisión para orden {order_uuid}: {validation['errors']}")
                cur.execute("""
                    UPDATE spei_validation_queue
                    SET status = 'failed', last_checked_at = NOW(),
                        banxico_response = %s
                    WHERE order_id = %s
                """, (json.dumps({
                    "ocr_parsed": parsed,
                    "validation": validation,
                    "banxico": banxico_res
                }), order["id"]))
                conn.commit()
                return False

    def run_cycle(self):
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT o.id, o.uuid, o.giveaway_id, o.customer_name, o.customer_phone, o.customer_state,
                           o.ticket_count, o.ticket_numbers, CAST(o.total_amount AS DOUBLE) as total_amount,
                           o.currency, o.concept_reference, o.status, o.receipt_url, o.receipt_filename, o.tracking_key,
                           g.uuid AS giveaway_uuid
                    FROM orders o
                    INNER JOIN giveaways g ON o.giveaway_id = g.id
                    LEFT JOIN spei_validation_queue q ON q.order_id = o.id
                    WHERE o.status = 'in_review' AND o.receipt_filename IS NOT NULL
                      AND (q.status IS NULL OR q.status IN ('pending', 'verifying'))
                    ORDER BY o.created_at ASC
                    LIMIT 10
                """)
                pending_orders = cur.fetchall()

            for order in pending_orders:
                try:
                    self.process_order(order, conn)
                except Exception as e:
                    conn.rollback()
                    logger.error(f"Error procesando orden {order.get('uuid')}: {e}", exc_info=True)
        finally:
            conn.close()

    def run_forever(self):
        logger.info("Worker en ejecución. Esperando comprobantes...")
        while True:
            try:
                self.run_cycle()
            except Exception as e:
                logger.error(f"Error inesperado en ciclo del worker: {e}", exc_info=True)
            time.sleep(3)

if __name__ == "__main__":
    worker = ReceiptWorker()
    worker.run_forever()
