#!/usr/bin/env python3
import argparse
import datetime
import gzip
import logging
import os
import shutil
import sys
import time

PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOGS_DIR = os.path.join(PROJECT_DIR, "logs")
RECEIPTS_DIR = os.path.join(PROJECT_DIR, "storage", "receipts")

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [MAINTENANCE] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("boreal_maintenance")

LOG_MAX_AGE_DAYS = int(os.getenv("LOG_RETENTION_DAYS", "30"))
LOG_COMPRESS_DAYS = int(os.getenv("LOG_COMPRESS_DAYS", "2"))
RECEIPT_TEMP_MAX_AGE_DAYS = int(os.getenv("RECEIPT_TEMP_MAX_DAYS", "14"))

def compress_old_logs():
    logger.info("Verificando archivos de registro para compresión...")
    now = time.time()
    compress_cutoff = now - (LOG_COMPRESS_DAYS * 86400)
    delete_cutoff = now - (LOG_MAX_AGE_DAYS * 86400)

    for root, _, files in os.walk(LOGS_DIR):
        for f in files:
            file_path = os.path.join(root, f)
            try:
                mtime = os.path.getmtime(file_path)
            except OSError:
                continue

            if f.endswith(".gz"):
                if mtime < delete_cutoff:
                    try:
                        os.remove(file_path)
                        logger.info(f"Log histórico purgado (> {LOG_MAX_AGE_DAYS} días): {file_path}")
                    except OSError as e:
                        logger.warning(f"No se pudo eliminar log antiguo {file_path}: {e}")
                continue

            if f.endswith(".log"):
                today_str = datetime.date.today().strftime("%Y-%m-%d")
                if today_str in f:
                    continue

                if mtime < compress_cutoff:
                    gz_path = f"{file_path}.gz"
                    try:
                        with open(file_path, "rb") as f_in:
                            with gzip.open(gz_path, "wb", compresslevel=9) as f_out:
                                shutil.copyfileobj(f_in, f_out)
                        os.remove(file_path)
                        logger.info(f"Log comprimido exitosamente: {gz_path}")
                    except Exception as e:
                        logger.error(f"Fallo al comprimir {file_path}: {e}")

def clean_orphaned_receipts():
    if not os.path.exists(RECEIPTS_DIR):
        return

    logger.info("Inspeccionando almacenamiento de comprobantes temporales y huérfanos...")
    now = time.time()
    cutoff = now - (RECEIPT_TEMP_MAX_AGE_DAYS * 86400)

    for f in os.listdir(RECEIPTS_DIR):
        file_path = os.path.join(RECEIPTS_DIR, f)
        if not os.path.isfile(file_path):
            continue

        try:
            mtime = os.path.getmtime(file_path)
            if f.startswith("tmp-") or f.endswith(".tmp"):
                if mtime < (now - 86400):
                    os.remove(file_path)
                    logger.info(f"Archivo temporal eliminado: {file_path}")
                continue

            if mtime < cutoff and f.startswith("receipt-"):
                pass
        except OSError:
            continue

def main():
    parser = argparse.ArgumentParser(description="Mantenimiento preventivo autónomo de Project Boreal")
    parser.add_argument("--force", action="store_true", help="Forzar mantenimiento inmediato")
    args = parser.parse_args()

    logger.info("Iniciando ciclo de mantenimiento preventivo...")
    compress_old_logs()
    clean_orphaned_receipts()
    logger.info("Ciclo de mantenimiento preventivo finalizado.")

if __name__ == "__main__":
    main()
