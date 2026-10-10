import datetime
import logging
import re
import threading
import time
from typing import Dict, Any, Optional
import requests

logger = logging.getLogger("banxico_client")

class BanxicoClient:
    BASE_URL = "https://www.banxico.org.mx/cep/"
    VALIDA_URL = "https://www.banxico.org.mx/cep/valida.do"

    _session: Optional[requests.Session] = None
    _session_initialized_at: float = 0
    _lock = threading.Lock()

    # Rate Limiter
    _last_request_time: float = 0.0
    _min_request_interval: float = 0.35

    # Circuit Breaker
    _consecutive_failures: int = 0
    _circuit_open_until: float = 0.0
    _trip_threshold: int = 5
    _cooldown_seconds: float = 60.0

    @classmethod
    def is_circuit_open(cls) -> bool:
        now = time.time()
        return now < cls._circuit_open_until

    @classmethod
    def get_circuit_status(cls) -> Dict[str, Any]:
        now = time.time()
        is_open = now < cls._circuit_open_until
        remaining = max(0.0, cls._circuit_open_until - now) if is_open else 0.0
        return {
            "is_open": is_open,
            "consecutive_failures": cls._consecutive_failures,
            "cooldown_remaining_seconds": round(remaining, 1)
        }

    @classmethod
    def record_success(cls):
        with cls._lock:
            cls._consecutive_failures = 0
            cls._circuit_open_until = 0.0

    @classmethod
    def record_failure(cls):
        with cls._lock:
            cls._consecutive_failures += 1
            if cls._consecutive_failures >= cls._trip_threshold:
                cls._circuit_open_until = time.time() + cls._cooldown_seconds
                logger.warning(
                    f"[CIRCUIT BREAKER ACTIVADO] Banxico CEP acumuló {cls._consecutive_failures} fallas consecutivas. "
                    f"Circuito abierto por {cls._cooldown_seconds}s para proteger peticiones."
                )

    @classmethod
    def _enforce_rate_limit(cls):
        with cls._lock:
            now = time.time()
            elapsed = now - cls._last_request_time
            if elapsed < cls._min_request_interval:
                time.sleep(cls._min_request_interval - elapsed)
            cls._last_request_time = time.time()

    @classmethod
    def _get_session(cls) -> requests.Session:
        now = time.time()
        if cls._session is None or (now - cls._session_initialized_at) > 600:
            cls._session = requests.Session()
            cls._session.headers.update({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "es-MX,es-419;q=0.9,es;q=0.8,en;q=0.7",
                "Referer": cls.BASE_URL,
                "Origin": "https://www.banxico.org.mx",
                "Connection": "keep-alive"
            })
            try:
                cls._session.get(cls.BASE_URL, timeout=10)
                cls._session_initialized_at = now
            except Exception as e:
                logger.warning(f"No se pudo inicializar cookies de sesión en Banxico CEP: {e}")
        return cls._session

    @classmethod
    def query_cep(
        cls,
        tracking_key: str,
        amount: float,
        date_str: Optional[str] = None,
        beneficiary_clabe: Optional[str] = None,
        sender_bank_code: Optional[str] = None,
        receiver_bank_code: Optional[str] = None
    ) -> Dict[str, Any]:
        clean_key = tracking_key.strip().upper() if tracking_key else ""
        if re.match(r'^MBAN[O]([0-9A-Z]+)$', clean_key):
            clean_key = "MBAN0" + clean_key[5:]

        if not clean_key or amount <= 0:
            return {
                "verified": False,
                "status": "rejected",
                "retryable": False,
                "message": "Clave de rastreo o monto inválidos para consultar Banxico CEP."
            }

        if cls.is_circuit_open():
            logger.info(f"Consulta omitida para clave {clean_key}: Circuit Breaker activo.")
            return {
                "verified": False,
                "status": "circuit_open",
                "retryable": True,
                "message": "Circuit Breaker activo: Banxico CEP degradado temporalmente. Reintento en pausa para proteger servicio."
            }

        if not date_str:
            date_str = datetime.date.today().strftime("%d-%m-%Y")
        else:
            if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
                parts = date_str.split('-')
                date_str = f"{parts[2]}-{parts[1]}-{parts[0]}"

        if sender_bank_code and receiver_bank_code and sender_bank_code == receiver_bank_code:
            return {
                "verified": False,
                "is_intrabank": True,
                "status": "intrabank",
                "retryable": False,
                "message": f"Operación interna entre cuentas del mismo banco ({sender_bank_code}). No cursa por Banxico SPEI."
            }

        emisor = sender_bank_code or "90646"
        receptor = receiver_bank_code or "40012"
        cuenta = re.sub(r'\D', '', str(beneficiary_clabe or "").strip())

        payload = {
            "tipoConsulta": "0",
            "tipoCriterio": "T",
            "criterio": clean_key,
            "fecha": date_str,
            "emisor": emisor,
            "receptor": receptor,
            "cuenta": cuenta,
            "monto": f"{amount:.2f}",
            "receptorParticipante": "0",
            "captcha": "c"
        }

        cls._enforce_rate_limit()

        try:
            session = cls._get_session()
            resp = session.post(cls.VALIDA_URL, data=payload, timeout=12)

            if resp.status_code != 200:
                cls.record_failure()
                return {
                    "verified": False,
                    "status": "offline",
                    "retryable": True,
                    "message": f"Servicio Banxico respondió con código HTTP {resp.status_code}."
                }

            html = resp.text

            if "Las instituciones financieras emisora y receptora" in html and "son iguales" in html:
                cls.record_success()
                return {
                    "verified": False,
                    "is_intrabank": True,
                    "status": "rejected",
                    "retryable": False,
                    "message": "Operación rechazada por Banxico CEP: emisor y receptor son la misma institución."
                }

            upper_html = html.upper()
            has_liquidated = "ESTADO DEL PAGO: LIQUIDADO" in upper_html or bool(re.search(r'ESTADO\s+DEL\s+PAGO[\s\:\<\>\/a-zA-Z0-9\=]*LIQUIDADO', upper_html))
            has_comprobante = ("COMPROBANTE ELECTRÓNICO DE PAGO" in upper_html or "COMPROBANTE ELECTRONICO DE PAGO" in upper_html) and "SELLO DIGITAL" in upper_html

            if has_liquidated or has_comprobante:
                cls.record_success()
                return {
                    "verified": True,
                    "is_intrabank": False,
                    "status": "liquidated",
                    "retryable": False,
                    "message": "Comprobante validado y liquidado exitosamente ante Banxico CEP.",
                    "details": {
                        "tracking_key": clean_key,
                        "amount": amount,
                        "date": date_str,
                        "emisor": emisor,
                        "receptor": receptor
                    }
                }

            if "no ha recibido una orden de pago" in html or "Operación no encontrada" in html or "no se encontró" in html.lower():
                cls.record_success()
                return {
                    "verified": False,
                    "status": "pending",
                    "retryable": True,
                    "message": "Operación aún no registrada en Banxico CEP (en tránsito SPEI o pendiente de liquidación)."
                }

            if "meta:stats=ERR" in html or "No se ingresó correctamente la información" in html:
                cls.record_success()
                return {
                    "verified": False,
                    "status": "pending",
                    "retryable": True,
                    "message": "Banxico CEP reportó inconsistencia de parámetros de búsqueda."
                }

            cls.record_success()
            return {
                "verified": False,
                "status": "pending",
                "retryable": True,
                "message": "Respuesta no concluyente de Banxico CEP; reintentando en siguiente ciclo."
            }

        except requests.exceptions.Timeout:
            cls.record_failure()
            return {
                "verified": False,
                "status": "unreachable",
                "retryable": True,
                "message": "Tiempo de espera agotado al consultar Banxico CEP (timeout)."
            }
        except requests.exceptions.RequestException as req_err:
            cls.record_failure()
            cls._session = None
            return {
                "verified": False,
                "status": "unreachable",
                "retryable": True,
                "message": f"Fallo de conexión con Banxico CEP ({type(req_err).__name__})."
            }
        except Exception as e:
            cls.record_failure()
            return {
                "verified": False,
                "status": "error",
                "retryable": True,
                "message": f"Error inesperado al consultar Banxico CEP: {str(e)}"
            }
