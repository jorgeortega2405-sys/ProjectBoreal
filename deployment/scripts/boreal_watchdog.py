#!/usr/bin/env python3
import datetime
import json
import logging
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.error

PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

env_file = os.path.join(PROJECT_DIR, ".env")
if os.path.isfile(env_file):
    try:
        import dotenv
        dotenv.load_dotenv(env_file)
    except ImportError:
        pass

LOG_DIR = os.path.join(PROJECT_DIR, "logs", "watchdog")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "watchdog.log")

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [WATCHDOG] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("boreal_watchdog")

CHECK_INTERVAL_SECONDS = int(os.getenv("WATCHDOG_INTERVAL", "15"))
NODE_HEALTH_URL = os.getenv("WATCHDOG_NODE_URL", "http://127.0.0.1:3000/api/health")
WS_HEALTH_URL = os.getenv("WATCHDOG_WS_URL", "http://127.0.0.1:3008/health")
REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
MAX_HEARTBEAT_AGE = int(os.getenv("WATCHDOG_WORKER_TIMEOUT", "60"))
DISK_MIN_FREE_PCT = float(os.getenv("WATCHDOG_DISK_MIN_FREE_PCT", "15.0"))

class ServiceWatchdog:
    def __init__(self):
        self.node_fail_count = 0
        self.ws_fail_count = 0
        self.worker_fail_count = 0
        self.redis_client = None
        self._init_redis()
        logger.info(f"Servicio de Levante y Vigilancia inicializado. Intervalo: {CHECK_INTERVAL_SECONDS}s.")

    def _init_redis(self):
        try:
            import redis
            hosts_to_try = [REDIS_HOST]
            if REDIS_HOST == "redis" and "127.0.0.1" not in hosts_to_try:
                hosts_to_try.append("127.0.0.1")
            elif REDIS_HOST in ("127.0.0.1", "localhost") and "redis" not in hosts_to_try:
                hosts_to_try.append("redis")

            for host in hosts_to_try:
                try:
                    client = redis.Redis(
                        host=host,
                        port=REDIS_PORT,
                        password=REDIS_PASSWORD,
                        decode_responses=True,
                        socket_timeout=3
                    )
                    client.ping()
                    self.redis_client = client
                    return
                except Exception:
                    continue
        except ImportError:
            logger.warning("Paquete redis no instalado; las sondas Redis se ejecutarán vía redis-cli.")

    def check_http_endpoint(self, url: str, timeout: int = 4) -> bool:
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "ProjectBoreal-Watchdog/1.0"}
            )
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.status in (200, 204)
        except Exception:
            return False

    def restart_container(self, container_name: str) -> bool:
        logger.warning(f"[LEVANTE] Reiniciando contenedor caído/degradado: '{container_name}'...")
        try:
            res = subprocess.run(
                ["docker", "restart", container_name],
                capture_output=True,
                text=True,
                timeout=30
            )
            if res.returncode == 0:
                logger.info(f"[LEVANTE] Contenedor '{container_name}' reiniciado exitosamente.")
                return True
            else:
                logger.error(f"[LEVANTE] Error al reiniciar contenedor '{container_name}': {res.stderr}")
                return False
        except Exception as e:
            logger.error(f"[LEVANTE] Excepción al ejecutar docker restart para '{container_name}': {e}")
            return False

    def restart_node_process(self):
        logger.warning("[LEVANTE] Intentando reactivar servicio Node.js...")
        try:
            systemctl_res = subprocess.run(
                ["systemctl", "restart", "boreal.service"],
                capture_output=True,
                text=True,
                timeout=15
            )
            if systemctl_res.returncode == 0:
                logger.info("[LEVANTE] boreal.service reiniciado exitosamente vía systemd.")
                return
        except Exception:
            pass

        try:
            pm2_res = subprocess.run(
                ["pm2", "restart", "boreal-node"],
                capture_output=True,
                text=True,
                timeout=15
            )
            if pm2_res.returncode == 0:
                logger.info("[LEVANTE] Proceso 'boreal-node' reiniciado exitosamente vía PM2.")
                return
        except Exception:
            pass

        self.restart_container("boreal-app")

    def check_payment_worker(self) -> bool:
        if self.redis_client is None:
            self._init_redis()

        if self.redis_client:
            try:
                raw_hb = self.redis_client.get("boreal:worker:heartbeat")
                if not raw_hb:
                    return False
                data = json.loads(raw_hb)
                ts = float(data.get("timestamp", 0))
                age = time.time() - ts
                return age <= MAX_HEARTBEAT_AGE
            except Exception:
                return False

        try:
            res = subprocess.run(
                ["docker", "exec", "boreal-redis", "redis-cli", "-a", REDIS_PASSWORD, "get", "boreal:worker:heartbeat"],
                capture_output=True,
                text=True,
                timeout=5
            )
            out = res.stdout.strip()
            if "timestamp" in out:
                idx = out.find("{")
                if idx != -1:
                    data = json.loads(out[idx:])
                    age = time.time() - float(data.get("timestamp", 0))
                    return age <= MAX_HEARTBEAT_AGE
            return False
        except Exception:
            return False

    def check_disk_space(self):
        try:
            usage = shutil.disk_usage(PROJECT_DIR)
            free_pct = (usage.free / usage.total) * 100
            if free_pct < DISK_MIN_FREE_PCT:
                logger.warning(f"[ALERTA DISCO] Espacio libre en disco bajo: {free_pct:.1f}% restante. Ejecutando mantenimiento de emergencia...")
                self.run_emergency_disk_cleanup()
        except Exception as e:
            logger.error(f"Error al verificar espacio en disco: {e}")

    def run_emergency_disk_cleanup(self):
        try:
            maint_script = os.path.join(os.path.dirname(__file__), "maintenance.py")
            if os.path.exists(maint_script):
                subprocess.run([sys.executable, maint_script, "--force"], timeout=60)
                logger.info("[LEVANTE] Limpieza de emergencia completada.")
        except Exception as e:
            logger.error(f"Error al ejecutar mantenimiento de emergencia: {e}")

    def clean_stale_redis_locks(self):
        if not self.redis_client:
            return
        try:
            pattern = "boreal:lock:*"
            for key in self.redis_client.scan_iter(match=pattern, count=100):
                ttl = self.redis_client.ttl(key)
                if ttl == -1:
                    logger.warning(f"[WATCHDOG] Clave de bloqueo sin TTL detectada ({key}). Liberando...")
                    self.redis_client.delete(key)
        except Exception as e:
            logger.debug(f"Error al inspeccionar bloqueos en Redis: {e}")

    def publish_status_to_redis(self, status_payload: dict):
        if self.redis_client:
            try:
                self.redis_client.set("boreal:watchdog:status", json.dumps(status_payload), ex=60)
            except Exception:
                pass

    def run_cycle(self):
        self.check_disk_space()
        self.clean_stale_redis_locks()

        node_ok = self.check_http_endpoint(NODE_HEALTH_URL)
        if node_ok:
            if self.node_fail_count > 0:
                logger.info("[RECUPERADO] Servidor Node.js responde correctamente.")
            self.node_fail_count = 0
        else:
            self.node_fail_count += 1
            logger.warning(f"[FALLO] Sonda Node.js falló ({self.node_fail_count}/3).")
            if self.node_fail_count >= 3:
                self.restart_node_process()
                self.node_fail_count = 0

        ws_ok = self.check_http_endpoint(WS_HEALTH_URL)
        if ws_ok:
            if self.ws_fail_count > 0:
                logger.info("[RECUPERADO] Microservicio WebSocket en Rust responde correctamente.")
            self.ws_fail_count = 0
        else:
            self.ws_fail_count += 1
            logger.warning(f"[FALLO] Sonda WebSocket Rust falló ({self.ws_fail_count}/3).")
            if self.ws_fail_count >= 3:
                self.restart_container("boreal-websocket")
                self.ws_fail_count = 0

        worker_ok = self.check_payment_worker()
        if worker_ok:
            if self.worker_fail_count > 0:
                logger.info("[RECUPERADO] Payment Worker emite pulso normal.")
            self.worker_fail_count = 0
        else:
            self.worker_fail_count += 1
            logger.warning(f"[FALLO] Pulso de Payment Worker ausente o expirado ({self.worker_fail_count}/3).")
            if self.worker_fail_count >= 3:
                self.restart_container("boreal-payment-worker")
                self.worker_fail_count = 0

        status_report = {
            "timestamp": time.time(),
            "iso": datetime.datetime.now().isoformat(),
            "node_api": "up" if node_ok else "down",
            "websocket": "up" if ws_ok else "down",
            "payment_worker": "up" if worker_ok else "down",
            "all_healthy": node_ok and ws_ok and worker_ok
        }
        self.publish_status_to_redis(status_report)

    def run_forever(self):
        logger.info("Iniciando bucle de supervisión continua...")
        while True:
            try:
                self.run_cycle()
            except Exception as e:
                logger.error(f"Error inesperado en ciclo de watchdog: {e}", exc_info=True)
            time.sleep(CHECK_INTERVAL_SECONDS)

if __name__ == "__main__":
    watchdog = ServiceWatchdog()
    watchdog.run_forever()
