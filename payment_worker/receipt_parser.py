import datetime
import re
from typing import Dict, Any, Optional, List
from bank_catalog import (
    detect_issuing_bank,
    get_bank_code_by_clabe,
    BANCO_CODES
)

SPANISH_MONTHS = {
    "ene": "01", "enero": "01",
    "feb": "02", "febrero": "02",
    "mar": "03", "marzo": "03",
    "abr": "04", "abril": "04",
    "may": "05", "mayo": "05",
    "jun": "06", "junio": "06",
    "jul": "07", "julio": "07",
    "ago": "08", "agosto": "08",
    "sep": "09", "sept": "09", "septiembre": "09",
    "oct": "10", "octubre": "10",
    "nov": "11", "noviembre": "11",
    "dic": "12", "diciembre": "12"
}

class ReceiptParser:
    @staticmethod
    def clean_text(text: str) -> str:
        return " ".join(text.split())

    @classmethod
    def parse(cls, raw_text: str) -> Dict[str, Any]:
        text = cls.clean_text(raw_text)
        lower_text = text.lower()

        # 1. Detección de Estado del Comprobante
        is_failed = any(w in lower_text for w in ["cancelad", "rechazad", "fallid", "devuelt", "error en la transferencia"])
        is_success = any(w in lower_text for w in ["exitosa", "comprobante", "transferencia", "enviada", "liquidada", "traspaso exitoso", "abono"])

        # 2. Extracción de Clave de Rastreo
        tracking_key: Optional[str] = None
        # Patrón explícito "Clave de rastreo ..." o "Rastreo: ..."
        m_key = re.search(r'(?:Clave\s+de\s+rastreo|Rastreo)\s*[:\s]*([A-Za-z0-9\s]{10,40}?)(?=\s*(?:Verifica|www|Consulta|Recibir|Comprobante|Fecha|Folio|\$|\n|$))', text, re.I)
        if m_key:
            candidate = re.sub(r'\s+', '', m_key.group(1)).upper()
            if len(candidate) >= 10:
                tracking_key = candidate

        # Patrones directos de bancos comunes
        if not tracking_key:
            m_bank = re.search(r'\b(MBAN[0-9A-Za-z]{14,24}|BNET[0-9A-Za-z]{12,24}|STP[0-9A-Za-z]{10,24}|BNTE[0-9A-Za-z]{10,24})\b', text, re.I)
            if m_bank:
                tracking_key = m_bank.group(1).upper()

        if not tracking_key:
            # Buscar bloque alfanumérico largo típico de SPEI (16 a 30 caracteres)
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

        # 4. Extracción de Fecha de Operación (formato destino DD-MM-YYYY)
        operation_date: Optional[str] = None
        # Formato numérico DD/MM/YYYY o DD-MM-YYYY
        m_date_num = re.search(r'\b([0-3]?[0-9])[\/\-]([0-1]?[0-9])[\/\-](202[0-9])\b', text)
        if m_date_num:
            day = m_date_num.group(1).zfill(2)
            month = m_date_num.group(2).zfill(2)
            year = m_date_num.group(3)
            operation_date = f"{day}-{month}-{year}"

        # Formato textual: "05 de octubre de 2026" o "05 oct 2026"
        if not operation_date:
            m_date_text = re.search(r'\b([0-3]?[0-9])\s*(?:de\s*)?([a-zA-Z]{3,10})\s*(?:de\s*)?(202[0-9])\b', text)
            if m_date_text:
                day = m_date_text.group(1).zfill(2)
                raw_m = m_date_text.group(2).lower()
                year = m_date_text.group(3)
                m_num = SPANISH_MONTHS.get(raw_m) or SPANISH_MONTHS.get(raw_m[:3])
                if m_num:
                    operation_date = f"{day}-{m_num}-{year}"

        # 5. Detección de Banco Emisor
        bank_name, sender_code = detect_issuing_bank(text, tracking_key)

        # 6. Extracción de Concepto
        concepto: Optional[str] = None
        m_con = re.search(r'(?:Concepto|Motivo)\s*[:\s]*([a-zA-Z0-9\s]{3,60}?)(?=\s*(?:Referencia|Folio|Tipo|Fecha|Clave|Comisi|Destino|\$|\n|$))', text, re.I)
        if m_con:
            concepto = m_con.group(1).strip()

        # 7. Extracción de Folio / Referencia
        folio: Optional[str] = None
        m_fol = re.search(r'(?:Folio\s*(?:de\s*operaci[oó]n)?|Referencia(?:\s*num[eé]rica)?)\s*[:\s]*([0-9A-Za-z]{5,25})', text, re.I)
        if m_fol:
            folio = m_fol.group(1).strip()

        # 8. Datos de Destino
        destino_text: Optional[str] = None
        m_dest = re.search(r'(?:Destino|Cuenta\s*receptora|Beneficiario)\s*[:\s]*([^\n\r]+?)(?=\s*(?:El nombre|Comisi|Concepto|Referencia|Folio|\$|$))', text, re.I)
        if m_dest:
            destino_text = m_dest.group(1).strip()

        return {
            "is_success": is_success and not is_failed,
            "is_failed": is_failed,
            "tracking_key": tracking_key,
            "amount": monto,
            "date": operation_date or datetime.date.today().strftime("%d-%m-%Y"),
            "sender_bank": bank_name,
            "sender_bank_code": sender_code,
            "concept": concepto,
            "folio": folio,
            "destination": destino_text,
            "full_text": text
        }

    @classmethod
    def validate_against_order(cls, parsed: Dict[str, Any], order: Dict[str, Any], bank_account_or_list: Any) -> Dict[str, Any]:
        errors: List[str] = []
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

        # 2. Identificar Cuenta y Banco Receptor Autorizado
        bank_accounts = bank_account_or_list if isinstance(bank_account_or_list, list) else [bank_account_or_list]
        full_text_lower = parsed.get("full_text", "").lower()
        dest_text_lower = str(parsed.get("destination") or "").lower()

        matched_account = None
        for acc in bank_accounts:
            if not acc:
                continue
            clabe = str(acc.get("clabe") or "")
            card = str(acc.get("card_number") or "")
            clabe_last4 = clabe[-4:] if len(clabe) >= 4 else ""
            card_last4 = card[-4:] if len(card) >= 4 else ""
            bank_name_lower = str(acc.get("bank_name") or "").lower()

            has_clabe_digits = (clabe_last4 in dest_text_lower or clabe_last4 in full_text_lower) if clabe_last4 else False
            has_card_digits = (card_last4 in dest_text_lower or card_last4 in full_text_lower) if card_last4 else False
            has_bank_name = any(part in full_text_lower for part in bank_name_lower.split() if len(part) > 3)

            if has_clabe_digits or has_card_digits or has_bank_name:
                matched_account = acc
                break

        if not matched_account and bank_accounts:
            # Si solo hay una cuenta configurada o no se especifica, usar la primera por defecto
            matched_account = bank_accounts[0]

        receiver_clabe = str(matched_account.get("clabe") or "") if matched_account else ""
        receiver_bank_code = get_bank_code_by_clabe(receiver_clabe)
        if not receiver_bank_code and matched_account:
            bname = str(matched_account.get("bank_name") or "").upper()
            receiver_bank_code = BANCO_CODES.get(bname)

        sender_code = parsed.get("sender_bank_code")
        is_intrabank = bool(sender_code and receiver_bank_code and sender_code == receiver_bank_code)

        return {
            "valid": len(errors) == 0,
            "fatal_error": fatal_error,
            "errors": errors,
            "tracking_key": parsed.get("tracking_key"),
            "date": parsed.get("date"),
            "amount": extracted_amount,
            "sender_bank": parsed.get("sender_bank"),
            "sender_bank_code": sender_code,
            "receiver_bank_code": receiver_bank_code,
            "receiver_clabe": receiver_clabe,
            "is_intrabank": is_intrabank,
            "matched_account": matched_account
        }
