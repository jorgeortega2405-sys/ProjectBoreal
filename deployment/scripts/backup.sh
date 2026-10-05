#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script de Respaldo Automatizado y Recuperación de Desastres para Project Boreal
# Ejecutar periódicamente vía cron: 0 3 * * * /path/to/backup.sh
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_ROOT="${BACKUP_DIR:-/var/backups/boreal}"
BACKUP_DEST="${BACKUP_ROOT}/${TIMESTAMP}"

if [ -f "${PROJECT_DIR}/.env" ]; then
    # shellcheck disable=SC1091
    set -a
    source "${PROJECT_DIR}/.env"
    set +a
fi

DB_USER="${DB_USER:-sprite_user}"
DB_PASSWORD="${DB_PASSWORD:-sprite_password}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
REDIS_PASSWORD="${REDIS_PASSWORD:-boreal_redis_auth_key_2026!}"

mkdir -p "${BACKUP_DEST}"

echo "[${TIMESTAMP}] Iniciando respaldo de Project Boreal en: ${BACKUP_DEST}"

# 1. Respaldo de Bases de Datos MySQL
for DB_NAME in db_identity db_lottery; do
    echo "[INFO] Respaldando base de datos MySQL '${DB_NAME}'..."
    if command -v mysqldump &>/dev/null; then
        mysqldump -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASSWORD}" \
            --single-transaction --quick --routines --triggers "${DB_NAME}" | gzip -9 > "${BACKUP_DEST}/${DB_NAME}_${TIMESTAMP}.sql.gz"
    else
        docker exec boreal-mysql mysqldump -u "${DB_USER}" -p"${DB_PASSWORD}" \
            --single-transaction --quick --routines --triggers "${DB_NAME}" | gzip -9 > "${BACKUP_DEST}/${DB_NAME}_${TIMESTAMP}.sql.gz"
    fi
done

# 2. Respaldo de Snapshot Redis
echo "[INFO] Solicitando BGSAVE a Redis..."
if command -v redis-cli &>/dev/null; then
    redis-cli -h 127.0.0.1 -p 6379 -a "${REDIS_PASSWORD}" --no-auth-warning BGSAVE || true
else
    docker exec boreal-redis redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning BGSAVE || true
fi

# 3. Snapshot de Auditoría Apache Cassandra
echo "[INFO] Creando snapshot en Cassandra..."
docker exec boreal-cassandra nodetool snapshot boreal_audit -t "snap_${TIMESTAMP}" || true

# 4. Generación de Checksums SHA256 para verificación de integridad
echo "[INFO] Generando sumas de verificación SHA256..."
cd "${BACKUP_DEST}"
sha256sum ./*.gz > SHA256SUMS 2>/dev/null || true

# 5. Política de Retención (Eliminar respaldos con más de 7 días de antigüedad)
echo "[INFO] Aplicando política de retención (7 días)..."
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true

echo "[${TIMESTAMP}] Respaldo completado exitosamente en ${BACKUP_DEST}"
