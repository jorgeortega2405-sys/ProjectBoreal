import datetime
import logging
import re
import requests
from typing import Dict, Any, Optional

logger = logging.getLogger("banxico_client")

class BanxicoClient:
    BASE_URL = "https://www.banxico.org.mx/cep/"
    VALIDA_URL = "https://www.banxico.org.mx/cep/valida.do"

    _session: Optional[requests.Session] = None
    _session_initialized_at: float = 0

    @classmethod
    def _get_session(cls) -> requests.Session:
        now = datetime.datetime.now().timestamp()
        # Renovar sesión cada 10 minutos para evitar cookies expiradas
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
        """
        Consulta oficial al portal de Banxico CEP (valida.do).
        - tracking_key: Clave de rastreo SPEI (hasta 30 caracteres alfanuméricos)
        - amount: Monto de la operación
        - date_str: Fecha en formato DD-MM-YYYY (por defecto hoy)
        - beneficiary_clabe: Cuenta destino (CLABE 18 dígitos o tarjeta 16 dígitos)
        - sender_bank_code: Código Banxico de 5 dígitos de la institución emisora
        - receiver_bank_code: Código Banxico de 5 dígitos de la institución receptora
        """
        clean_key = tracking_key.strip().upper() if tracking_key else ""
        if not clean_key or amount <= 0:
            return {
                "verified": False,
                "status": "rejected",
                "retryable": False,
                "message": "Clave de rastreo o monto inválidos para consultar Banxico CEP."
            }

        # Formatear fecha a DD-MM-YYYY
        if not date_str:
            date_str = datetime.date.today().strftime("%d-%m-%Y")
        else:
            # Normalizar si viene en YYYY-MM-DD
            if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
                parts = date_str.split('-')
                date_str = f"{parts[2]}-{parts[1]}-{parts[0]}"

        # Si emisor y receptor son idénticos, es transferencia intrabancaria (mismo banco)
        if sender_bank_code and receiver_bank_code and sender_bank_code == receiver_bank_code:
            return {
                "verified": True,
                "is_intrabank": True,
                "status": "intrabank",
                "retryable": False,
                "message": f"Operación interna entre cuentas del mismo banco ({sender_bank_code}). No cursa por Banxico SPEI."
            }

        emisor = sender_bank_code or "90646" # Default fallback
        receptor = receiver_bank_code or "40012" # Default fallback
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

        try:
            session = cls._get_session()
            resp = session.post(cls.VALIDA_URL, data=payload, timeout=12)

            if resp.status_code != 200:
                return {
                    "verified": False,
                    "status": "offline",
                    "retryable": True,
                    "message": f"Servicio Banxico respondió con código HTTP {resp.status_code}."
                }

            html = resp.text

            # 1. Detección de error por bancos iguales
            if "Las instituciones financieras emisora y receptora" in html and "son iguales" in html:
                return {
                    "verified": True,
                    "is_intrabank": True,
                    "status": "intrabank",
                    "retryable": False,
                    "message": "Transferencia entre cuentas del mismo banco confirmada (operación intrabancaria)."
                }

            # 2. Detección de Liquidación Exitosa
            upper_html = html.upper()
            has_liquidated = "LIQUIDADO" in upper_html or "ESTADO DEL PAGO: LIQUIDADO" in upper_html
            has_comprobante = "COMPROBANTE ELECTRÓNICO DE PAGO" in upper_html or "COMPROBANTE ELECTRONICO DE PAGO" in upper_html or "SELLO DIGITAL" in upper_html

            if has_liquidated or has_comprobante:
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

            # 3. Detección de Operación en Tránsito o no encontrada
            if "no ha recibido una orden de pago" in html or "Operación no encontrada" in html or "no se encontró" in html.lower():
                return {
                    "verified": False,
                    "status": "pending",
                    "retryable": True,
                    "message": "Operación aún no registrada en Banxico CEP (en tránsito SPEI o pendiente de liquidación)."
                }

            # 4. Error de datos de entrada en formulario
            if "meta:stats=ERR" in html or "No se ingresó correctamente la información" in html:
                return {
                    "verified": False,
                    "status": "pending",
                    "retryable": True,
                    "message": "Banxico CEP reportó inconsistencia de parámetros (se programará reintento con ajuste de emisor)."
                }

            return {
                "verified": False,
                "status": "pending",
                "retryable": True,
                "message": "Respuesta no concluyente de Banxico CEP; reintentando en siguiente ciclo."
            }

        except requests.exceptions.Timeout:
            return {
                "verified": False,
                "status": "unreachable",
                "retryable": True,
                "message": "Tiempo de espera agotado al consultar Banxico CEP (timeout)."
            }
        except requests.exceptions.RequestException as req_err:
            cls._session = None # Forzar recreación de sesión en siguiente ciclo
            return {
                "verified": False,
                "status": "unreachable",
                "retryable": True,
                "message": f"Fallo de conexión con Banxico CEP ({type(req_err).__name__})."
            }
        except Exception as e:
            return {
                "verified": False,
                "status": "error",
                "retryable": True,
                "message": f"Error inesperado al consultar Banxico CEP: {str(e)}"
            }
