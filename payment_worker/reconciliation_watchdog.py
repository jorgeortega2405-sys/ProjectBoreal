import json
import logging
import os
import sys
import time
from typing import Dict, Any
import dotenv
import pymysql
import redis

from banxico_client import BanxicoClient

dotenv.load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

LOG_DIR = os.getenv("LOG_DIR", os.path.join(os.path.dirname(__file__), "..", "logs", "worker"))
os.makedirs(LOG_DIR, exist_ok=True)
log_file = os.path.join(LOG_DIR, f"reconciliation-{time.strftime('%Y-%m-%d')}.log")

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [RECONCILIATION-WATCHDOG] %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("reconciliation_watchdog")

def get_db_connection():
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
        except Exception:
            continue
    raise pymysql.err.OperationalError(2003, f"No se pudo conectar a MySQL desde Watchdog en: {hosts_to_try}")

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
                socket_timeout=5
            )
            client.ping()
            return client
        except Exception:
            continue

    return redis.Redis(host=primary_host, port=port, password=pwd if pwd else None, decode_responses=True)

class ReconciliationWatchdog:
    def __init__(self):
        self.redis = get_redis_client()

    def reconcile_stuck_verifications(self) -> int:
        conn = get_db_connection()
        repaired = 0
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE spei_validation_queue
                    SET status = 'pending', next_retry_at = NOW()
                    WHERE status = 'verifying'
                      AND last_checked_at < DATE_SUB(NOW(), INTERVAL 8 MINUTE)
                """)
                repaired = cur.rowcount
                if repaired > 0:
                    conn.commit()
                    logger.info(f"Se repararon {repaired} órdenes atascadas en estado 'verifying'.")
        except Exception as e:
            conn.rollback()
            logger.error(f"Error al reparar órdenes atascadas: {e}")
        finally:
            conn.close()
        return repaired

    def protect_in_review_reservations(self) -> int:
        conn = get_db_connection()
        protected = 0
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE giveaway_tickets t
                    INNER JOIN orders o ON t.order_id = o.id
                    SET t.reserved_until = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
                    WHERE o.status = 'in_review'
                      AND t.status = 'reserved'
                      AND (t.reserved_until IS NULL OR t.reserved_until < DATE_ADD(NOW(), INTERVAL 10 MINUTE))
                """)
                protected = cur.rowcount
                if protected > 0:
                    conn.commit()
                    logger.info(f"Protegidas {protected} reservas de boletos para órdenes en revisión activa.")
        except Exception as e:
            conn.rollback()
            logger.error(f"Error al proteger reservas de boletos: {e}")
        finally:
            conn.close()
        return protected

    def publish_metrics(self):
        conn = get_db_connection()
        metrics: Dict[str, Any] = {
            "timestamp": time.time(),
            "circuit_breaker": BanxicoClient.get_circuit_status(),
        }
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT status, COUNT(*) as cnt
                    FROM spei_validation_queue
                    GROUP BY status
                """)
                rows = cur.fetchall()
                status_counts = {r["status"]: r["cnt"] for r in rows}
                metrics["queue_counts"] = status_counts

                cur.execute("""
                    SELECT COUNT(*) as in_review_count
                    FROM orders
                    WHERE status = 'in_review'
                """)
                row = cur.fetchone()
                metrics["orders_in_review"] = row["in_review_count"] if row else 0

            queue_len = self.redis.llen("boreal:queue:receipts")
            metrics["redis_queue_length"] = queue_len

            self.redis.set("boreal:payment:metrics", json.dumps(metrics), ex=120)
        except Exception as e:
            logger.warning(f"Error al recopilar métricas: {e}")
        finally:
            conn.close()

    def run_once(self):
        self.reconcile_stuck_verifications()
        self.protect_in_review_reservations()
        self.publish_metrics()

if __name__ == "__main__":
    watchdog = ReconciliationWatchdog()
    watchdog.run_once()
    logger.info("Ciclo de conciliación y protección ejecutado exitosamente.")
