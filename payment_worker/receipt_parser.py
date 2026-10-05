import re
from typing import Dict, Any, Optional

class ReceiptParser:
    @staticmethod
    def clean_text(text: str) -> str:
        return " ".join(text.split())

    @classmethod
    def parse(cls, raw_text: str) -> Dict[str, Any]:
        text = cls.clean_text(raw_text)
        lower_text = text.lower()

        # 1. Detección de Estado
        is_failed = any(w in lower_text for w in ["cancelad", "rechazad", "fallid", "devuelt", "error"])
        is_success = any(w in lower_text for w in ["exitosa", "comprobante", "transferencia", "enviada", "liquidada"])

        # 2. Extracción de Clave de Rastreo
        tracking_key: Optional[str] = None
        # Patrón explícito "Clave de rastreo ..."
        m_key = re.search(r'Clave\s+de\s+rastreo\s*[:\s]*([A-Za-z0-9\s]{10,40}?)(?=\s*(?:Verifica|www|Consulta|Recibir|Comprobante|Fecha|Folio|\$|\n|$))', text, re.I)
        if m_key:
            candidate = re.sub(r'\s+', '', m_key.group(1)).upper()
            if len(candidate) >= 10:
                tracking_key = candidate

        # Patrones directos bancarios si no se encontró con etiqueta
        if not tracking_key:
            m_bank = re.search(r'\b(MBAN[0-9A-Za-z]{14,24}|STP[0-9A-Za-z]{10,24}|BNTE[0-9A-Za-z]{10,24})\b', text, re.I)
            if m_bank:
                tracking_key = m_bank.group(1).upper()

        if not tracking_key:
            # Buscar cualquier bloque alfanumérico largo típico de SPEI (18 a 30 caracteres)
            m_long = re.search(r'\b([A-Z0-9]{18,30})\b', text)
            if m_long and not m_long.group(1).isdigit():
                tracking_key = m_long.group(1).upper()

        # 3. Extracción de Monto
        monto: Optional[float] = None
        m_monto = re.search(r'(?:Monto\s*(?:transferido)?|Importe|Total)\s*[:\s]*\$\s*([0-9OIl\.\,]+)', text, re.I)
        if not m_monto:
            m_monto = re.search(r'\$\s*([0-9OIl\.\,]+)', text)
        if m_monto:
            raw_monto = m_monto.group(1)
            sanitized = raw_monto.replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1').replace(',', '')
            try:
                monto = float(sanitized)
            except ValueError:
                monto = None

        # 4. Extracción de Concepto
        concepto: Optional[str] = None
        m_con = re.search(r'Concepto\s*[:\s]*([a-zA-Z0-9\s]{3,60}?)(?=\s*(?:Referencia|Folio|Tipo|Fecha|Clave|Comisi|Destino|\$|\n|$))', text, re.I)
        if m_con:
            concepto = m_con.group(1).strip()

        # 5. Extracción de Folio / Referencia
        folio: Optional[str] = None
        m_fol = re.search(r'(?:Folio\s*(?:de\s*operaci[oó]n)?|Referencia)\s*[:\s]*([0-9A-Za-z]{5,25})', text, re.I)
        if m_fol:
            folio = m_fol.group(1).strip()

        # 6. Cuenta o Datos de Destino
        destino_text: Optional[str] = None
        m_dest = re.search(r'Destino\s*[:\s]*([^\n\r]+?)(?=\s*(?:El nombre|Comisi|Concepto|Referencia|Folio|\$|$))', text, re.I)
        if m_dest:
            destino_text = m_dest.group(1).strip()

        return {
            "is_success": is_success and not is_failed,
            "is_failed": is_failed,
            "tracking_key": tracking_key,
            "amount": monto,
            "concept": concepto,
            "folio": folio,
            "destination": destino_text,
            "full_text": text
        }

    @classmethod
    def validate_against_order(cls, parsed: Dict[str, Any], order: Dict[str, Any], bank_account: Dict[str, Any]) -> Dict[str, Any]:
        errors = []

        fatal_error = False

        if parsed.get("is_failed"):
            errors.append("El comprobante indica una transferencia fallida, cancelada o devuelta.")
            fatal_error = True

        # 1. Validar Monto
        extracted_amount = parsed.get("amount")
        expected_amount = float(order.get("total_amount") or 0.0)
        if extracted_amount is None:
            errors.append("No se pudo detectar el monto transferido en el comprobante.")
        elif abs(extracted_amount - expected_amount) > 0.01:
            errors.append(f"El monto en el comprobante (${extracted_amount:.2f}) no coincide con el total de la orden (${expected_amount:.2f}).")
            fatal_error = True

        # 2. Validar Concepto
        expected_concept = str(order.get("concept_reference") or "").strip().lower()
        extracted_concept = str(parsed.get("concept") or "").strip().lower()
        full_text_lower = parsed.get("full_text", "").lower()

        # Separar palabras clave del nombre (al menos nombres y apellidos)
        concept_words = [w for w in expected_concept.split() if len(w) > 2]
        matched_words = [w for w in concept_words if w in extracted_concept or w in full_text_lower]

        if len(concept_words) > 0 and len(matched_words) < max(2, len(concept_words) - 1):
            errors.append(f"El concepto de pago en el comprobante no coincide con el concepto requerido ('{order.get('concept_reference')}').")

        # 3. Validar Cuenta / CLABE Destino
        clabe = str(bank_account.get("clabe") or "")
        clabe_last4 = clabe[-4:] if len(clabe) >= 4 else ""
        bank_name_lower = str(bank_account.get("bank_name") or "").lower()

        dest_text_lower = str(parsed.get("destination") or "").lower()
        full_text_lower = parsed.get("full_text", "").lower()

        has_clabe_digits = clabe_last4 in dest_text_lower or clabe_last4 in full_text_lower if clabe_last4 else False
        has_bank_name = any(part in full_text_lower for part in bank_name_lower.split() if len(part) > 3)

        if not has_clabe_digits and not has_bank_name:
            errors.append(f"El destinatario no corresponde a la cuenta de depósito activa ({bank_account.get('bank_name')} CLABE ...{clabe_last4}).")
            if parsed.get("destination"):
                fatal_error = True

        return {
            "valid": len(errors) == 0,
            "fatal_error": fatal_error,
            "errors": errors,
            "tracking_key": parsed.get("tracking_key")
        }
