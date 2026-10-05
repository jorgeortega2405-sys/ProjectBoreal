import requests
from typing import Dict, Any, Optional

class BanxicoClient:
    BANXICO_URL = "https://www.banxico.org.mx/cep/valida"

    @classmethod
    def query_cep(cls, tracking_key: str, amount: float, date_str: Optional[str] = None, beneficiary_clabe: Optional[str] = None) -> Dict[str, Any]:
        """
        Consulta de validación a Banxico CEP.
        Retorna diccionario con estatus de la consulta.
        """
        payload = {
            "criterio": tracking_key.strip().upper(),
            "monto": f"{amount:.2f}",
            "tipoCriterio": "T"
        }
        if date_str:
            payload["fecha"] = date_str
        if beneficiary_clabe:
            payload["cuenta"] = beneficiary_clabe

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }

        try:
            resp = requests.post(cls.BANXICO_URL, data=payload, headers=headers, timeout=8)
            if resp.status_code == 200:
                text = resp.text
                if "Comprobante" in text or "sello" in text or "LIQUIDADO" in text.upper():
                    return {
                        "verified": True,
                        "status": "liquidated",
                        "retryable": False,
                        "message": "Comprobante validado exitosamente en Banxico CEP.",
                        "raw_snippet": text[:300]
                    }
                return {
                    "verified": False,
                    "status": "pending",
                    "retryable": True,
                    "message": "El comprobante no arrojó confirmación inmediata en Banxico CEP (puede estar en tránsito en SPEI).",
                    "raw_snippet": text[:300]
                }
            return {
                "verified": False,
                "status": "offline",
                "retryable": True,
                "message": f"Servicio Banxico respondió con código HTTP {resp.status_code}."
            }
        except Exception as e:
            return {
                "verified": False,
                "status": "unreachable",
                "retryable": True,
                "message": f"No se pudo contactar a Banxico CEP directamente ({type(e).__name__})."
            }
