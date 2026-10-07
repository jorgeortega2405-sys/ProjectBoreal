import re
from typing import Dict, Optional, Tuple

# Catálogo oficial de códigos Banxico CEP (5 dígitos)
BANCO_CODES: Dict[str, str] = {
    # Principales bancos comerciales
    "BBVA": "40012",
    "SANTANDER": "40014",
    "BANAMEX": "40002",
    "CITIBANAMEX": "40002",
    "BANORTE": "40072",
    "HSBC": "40021",
    "SCOTIABANK": "40044",
    "INBURSA": "40036",
    "BANCO AZTECA": "40127",
    "BANREGIO": "40058",
    "HEY BANCO": "40058",
    "BANCOPPEL": "40137",
    "AFIRME": "40062",
    "BANBAJIO": "40030",
    "BAJIO": "40030",
    "INTERCAM": "40136",
    "ACTINVER": "40133",
    "COMPARTAMOS": "40130",
    "MIFEL": "40042",
    "BANSEFI": "40166",
    "BIENESTAR": "40166",
    # Instituciones de Fondos de Pago Electrónico (IFPE) y Fintechs en SPEI
    "STP": "90646",
    "SISTEMA DE TRANSFERENCIAS Y PAGOS": "90646",
    "MERCADO PAGO": "90646",
    "MERCADOPAGO": "90646",
    "NU": "90698",
    "NU MEXICO": "90698",
    "SPIN": "90721",
    "SPIN BY OXXO": "90721",
    "ALBO": "90721",
    "KLAR": "90684",
    "STORI": "90728",
    "UNODOS": "90703",
    "DIDI": "90733",
    "FONDEADORA": "90720",
    "PAGATODO": "90656",
    "NVIO": "90659",
    "CUENCA": "90695",
}

# Mapeo de prefijos CLABE (primeros 3 dígitos) a código Banxico CEP (5 dígitos)
CLABE_PREFIX_TO_BANXICO: Dict[str, str] = {
    "002": "40002",  # Citibanamex
    "012": "40012",  # BBVA
    "014": "40014",  # Santander
    "021": "40021",  # HSBC
    "030": "40030",  # BanBajío
    "036": "40036",  # Inbursa
    "042": "40042",  # Mifel
    "044": "40044",  # Scotiabank
    "058": "40058",  # Banregio / Hey Banco
    "062": "40062",  # Afirme
    "072": "40072",  # Banorte
    "127": "40127",  # Banco Azteca
    "130": "40130",  # Compartamos
    "133": "40133",  # Actinver
    "136": "40136",  # Intercam
    "137": "40137",  # Bancoppel
    "138": "40138",  # Banregio
    "166": "40166",  # Banco del Bienestar
    "646": "90646",  # STP (Sistema de Transferencias y Pagos)
    "722": "90646",  # Mercado Pago / STP
    "698": "90698",  # Nu México
    "721": "90721",  # Spin / albo
    "684": "90684",  # Klar
    "728": "90728",  # Stori
    "656": "90656",  # Pagatodo
    "659": "90659",  # NVIO
}

# Prefijos de claves de rastreo asignados habitualmente por bancos emisores
TRACKING_KEY_PREFIX_MAP: Dict[str, str] = {
    "MBAN": "40012",  # BBVA Móvil
    "BNET": "40012",  # BBVA Net
    "STP": "90646",   # STP / Mercado Pago
    "BNTE": "40072",  # Banorte
    "SANT": "40014",  # Santander
    "HSBC": "40021",  # HSBC
    "AZTE": "40127",  # Banco Azteca
    "COPP": "40137",  # Bancoppel
    "NU": "90698",    # Nu México
    "CITI": "40002",  # Citibanamex
}

def get_bank_code_by_clabe(clabe: str) -> Optional[str]:
    """Obtiene el código de 5 dígitos de Banxico CEP a partir de los 18 dígitos de la CLABE."""
    if not clabe:
        return None
    clean = re.sub(r'\D', '', str(clabe).strip())
    if len(clean) >= 3:
        prefix = clean[:3]
        return CLABE_PREFIX_TO_BANXICO.get(prefix)
    return None

def detect_issuing_bank(text: str, tracking_key: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    if tracking_key:
        clean_key = tracking_key.strip().upper()
        for prefix, code in TRACKING_KEY_PREFIX_MAP.items():
            if clean_key.startswith(prefix):
                for name, bcode in BANCO_CODES.items():
                    if bcode == code:
                        return name, code
                return prefix, code

    if not text:
        return None, None

    text_upper = text.upper()

    priority_order = [
        "MERCADO PAGO", "MERCADOPAGO", "SPIN BY OXXO", "NU MEXICO", "HEY BANCO",
        "BANCO AZTECA", "CITIBANAMEX", "SCOTIABANK", "BANCOPPEL",
        "BBVA", "SANTANDER", "BANORTE", "BANAMEX", "HSBC", "INBURSA",
        "BANREGIO", "AFIRME", "BANBAJIO", "STP", "NU", "ALBO", "KLAR"
    ]

    origin_patterns = [
        r'(?:DESDE|ORIGEN|BANCO\s+EMISOR|INSTITUCI[OÓ]N\s+EMISORA|ORDENANTE|CUENTA\s+DE\s+RETIRO|TRANSFERIDO\s+DESDE|BANCO\s+ORIGEN)[\s\:\-]+([^\n\r\.\,]+)',
        r'(?:DE\s+MI\s+CUENTA)[\s\:\-]+([^\n\r\.\,]+)'
    ]

    for op in origin_patterns:
        m = re.search(op, text_upper)
        if m:
            origin_snippet = m.group(1)
            for bank_name in priority_order:
                pat = r'(?:\b|[\s\.\,\:\-])' + re.escape(bank_name) + r'(?:\b|[\s\.\,\:\-])'
                if re.search(pat, origin_snippet):
                    code = BANCO_CODES.get(bank_name)
                    if code:
                        return bank_name, code

    # Si no hay bloque explícito de origen, buscar nombres de banco evitando el contexto de destino
    dest_pattern = r'(?:DESTINO|HACIA|BENEFICIARIO|CUENTA\s+RECEPTORA|INSTITUCI[OÓ]N\s+RECEPTORA|BANCO\s+DESTINO|PARA|RECIBE)[\s\:\-]*([^\n\r]+)'
    dest_matches = re.findall(dest_pattern, text_upper)
    dest_combined = " ".join(dest_matches)

    for bank_name in priority_order:
        pat = r'(?:\b|[\s\.\,\:\-])' + re.escape(bank_name) + r'(?:\b|[\s\.\,\:\-])'
        match_in_dest = bool(re.search(pat, dest_combined))
        match_in_text = bool(re.search(pat, text_upper))

        if match_in_text and not match_in_dest:
            code = BANCO_CODES.get(bank_name)
            if code:
                return bank_name, code

    return None, None

