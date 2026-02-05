#!/bin/bash
set -euo pipefail

APP_DIR="/Users/jcserrano/gestion_entrenamiento"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"

cd "$APP_DIR"

# PATH típico de brew en Intel Mac (tú usas /usr/local)
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Cargar variables de entorno del .env
set -a
source "$APP_DIR/.env"
set +a

echo "[$(date)] start_all.sh: iniciando..." >> "$LOG_DIR/start_all.log"

# 1) Esperar a que Docker esté listo (Docker Desktop tarda al arrancar)
echo "[$(date)] esperando a Docker..." >> "$LOG_DIR/start_all.log"
for i in {1..60}; do
  if docker info >/dev/null 2>&1; then
    echo "[$(date)] Docker OK" >> "$LOG_DIR/start_all.log"
    break
  fi
  sleep 2
done

# Si sigue sin estar, salimos para que launchd reintente
if ! docker info >/dev/null 2>&1; then
  echo "[$(date)] Docker NO disponible, saliendo para reintento" >> "$LOG_DIR/start_all.log"
  exit 1
fi

# 2) Levantar MariaDB (ajusta el nombre del contenedor si es distinto)
DB_CONTAINER="${DB_CONTAINER_NAME:-mindpace-mariadb}"

if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "[$(date)] MariaDB ya está corriendo ($DB_CONTAINER)" >> "$LOG_DIR/start_all.log"
else
  if docker ps -a --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    echo "[$(date)] arrancando contenedor existente $DB_CONTAINER" >> "$LOG_DIR/start_all.log"
    docker start "$DB_CONTAINER" >> "$LOG_DIR/start_all.log" 2>&1
  else
    echo "[$(date)] NO existe $DB_CONTAINER. Créalo primero (ver nota abajo)." >> "$LOG_DIR/start_all.log"
    exit 1
  fi
fi

# 3) (Opcional) esperar puerto 3306
echo "[$(date)] esperando MariaDB en 127.0.0.1:3306..." >> "$LOG_DIR/start_all.log"
for i in {1..60}; do
  if nc -z 127.0.0.1 3306 >/dev/null 2>&1; then
    echo "[$(date)] MariaDB OK" >> "$LOG_DIR/start_all.log"
    break
  fi
  sleep 1
done

# 4) Arrancar la app
# Si usas venv, descomenta y ajusta:
# source "$APP_DIR/venv/bin/activate"

# Evitar conflictos si hubiera un gunicorn anterior vivo
pkill -f "gunicorn.*app:app" >/dev/null 2>&1 || true

echo "[$(date)] arrancando Gunicorn en 127.0.0.1:5000..." >> "$LOG_DIR/start_all.log"
cd "$APP_DIR/backend"

# Gunicorn no lee .env por sí solo: pero ya lo cargamos arriba con `source "$APP_DIR/.env"`
exec gunicorn -w 2 -b 127.0.0.1:5000 app:app >> "$LOG_DIR/mindpace.out.log" 2>> "$LOG_DIR/mindpace.err.log"

