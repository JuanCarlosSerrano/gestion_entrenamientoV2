#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"

if [ ! -f "$BACKEND_ENV" ]; then
  echo "ERROR: falta $BACKEND_ENV"
  exit 1
fi

set -a
source "$BACKEND_ENV"
set +a

CONTAINER_NAME="${DB_CONTAINER_NAME:-mindpace-mariadb}"
BACKUP_DIR="$ROOT_DIR/backups"
OUT_SQL="$BACKUP_DIR/gestion_entrenamiento_v2.sql"
OUT_GZ="$BACKUP_DIR/gestion_entrenamiento_v2.sql.gz"

mkdir -p "$BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "ERROR: contenedor $CONTAINER_NAME no está en ejecución"
  exit 1
fi

echo "Exportando BD $DB_NAME desde $CONTAINER_NAME..."
docker exec \
  -e DB_USER="$DB_USER" \
  -e DB_PASSWORD="$DB_PASSWORD" \
  -e DB_NAME="$DB_NAME" \
  "$CONTAINER_NAME" sh -lc \
  'mysqldump -u"$DB_USER" -p"$DB_PASSWORD" --single-transaction --routines --triggers "$DB_NAME"' \
  > "$OUT_SQL"

gzip -c "$OUT_SQL" > "$OUT_GZ"

echo "OK: $OUT_SQL"
echo "OK: $OUT_GZ"
