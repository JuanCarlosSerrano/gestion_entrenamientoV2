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
IN_SQL="$BACKUP_DIR/gestion_entrenamiento_v2.sql"

if [ ! -f "$IN_SQL" ]; then
  echo "ERROR: no existe $IN_SQL"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "ERROR: contenedor $CONTAINER_NAME no está en ejecución"
  exit 1
fi

echo "Importando $IN_SQL en BD $DB_NAME..."
docker exec \
  -e DB_NAME="$DB_NAME" \
  "$CONTAINER_NAME" sh -lc \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS $DB_NAME; CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"'

cat "$IN_SQL" | docker exec -i \
  -e DB_USER="$DB_USER" \
  -e DB_PASSWORD="$DB_PASSWORD" \
  -e DB_NAME="$DB_NAME" \
  "$CONTAINER_NAME" sh -lc \
  'mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"'

echo "OK: import completado"
