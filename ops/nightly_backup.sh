#!/bin/bash
# Backup nocturno automático de la base de datos de producción.
#
# Usa `docker exec` + mysqldump dentro del contenedor de MariaDB, igual
# que ops/db_export.sh (que está pensado para exportar/importar a mano
# entre entornos, con un nombre de fichero fijo). Este script en cambio
# es para ejecución desatendida: genera un fichero comprimido por noche
# con marca de tiempo (nunca sobrescribe el anterior) y borra los
# backups más antiguos que BACKUP_RETENTION_DAYS.
#
# Nota sobre el mecanismo: se intentó primero un mysqldump nativo por
# TCP (sin pasar por Docker) instalando `mysql-client` con Homebrew,
# para poder ejecutar esto como LaunchDaemon del sistema sin depender
# de que Docker Desktop esté abierto. Ese `brew install` falló al
# compilar porque macOS 13 ya no es una configuración "Tier 1" de
# Homebrew (no hay binario precompilado y la compilación desde fuente
# no funciona en esta versión de macOS). Por eso este script vuelve a
# `docker exec`, con la limitación conocida de que solo funciona si
# Docker Desktop está en marcha -- ver net.mindpace.backup.plist,
# registrado como LaunchAgent (sesión de usuario), no LaunchDaemon.
set -euo pipefail

# launchd ejecuta con un PATH mínimo que no incluye /usr/local/bin,
# donde vive el CLI de Docker Desktop -- sin esto, `docker` no se
# encuentra al correr como LaunchAgent (sí funciona en una shell normal,
# que es por lo que una prueba manual en terminal lo esconde).
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"

if [ ! -f "$BACKEND_ENV" ]; then
  echo "ERROR: falta $BACKEND_ENV" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$BACKEND_ENV"
set +a

CONTAINER_NAME="${DB_CONTAINER_NAME:-mindpace-mariadb}"
BACKUP_DIR="$ROOT_DIR/backups/nightly"
LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/backup.log"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_GZ="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >>"$LOG_FILE"
}

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  log "ERROR: contenedor $CONTAINER_NAME no está en ejecución (¿Docker Desktop abierto?), backup abortado"
  exit 1
fi

if docker exec \
  -e DB_USER="$DB_USER" \
  -e DB_PASSWORD="$DB_PASSWORD" \
  -e DB_NAME="$DB_NAME" \
  "$CONTAINER_NAME" sh -lc \
  'mysqldump -u"$DB_USER" -p"$DB_PASSWORD" --single-transaction --routines --triggers "$DB_NAME"' \
  | gzip >"$OUT_GZ"; then
  SIZE="$(du -h "$OUT_GZ" | cut -f1)"
  log "OK: backup creado $OUT_GZ ($SIZE)"
else
  log "ERROR: fallo el backup de $DB_NAME, se borra el fichero incompleto"
  rm -f "$OUT_GZ"
  exit 1
fi

DELETED=0
while IFS= read -r -d '' old; do
  rm -f "$old"
  DELETED=$((DELETED + 1))
done < <(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime "+${RETENTION_DAYS}" -print0)

if [ "$DELETED" -gt 0 ]; then
  log "Limpieza: $DELETED backup(s) antiguos borrados (más de ${RETENTION_DAYS} días)"
fi
