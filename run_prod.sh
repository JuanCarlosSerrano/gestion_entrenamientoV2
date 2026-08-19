#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

if [ -f "$BACKEND_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND_DIR/.env"
  set +a
fi
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

if [ -d "$BACKEND_DIR/.venv" ]; then
  # shellcheck disable=SC1091
  source "$BACKEND_DIR/.venv/bin/activate"
fi

cd "$BACKEND_DIR"

# Un solo worker por defecto: el hilo de publicaciones programadas y el
# limitador de intentos de login en memoria son locales al proceso, así
# que varios workers los duplicarían (publicaciones, sin riesgo real
# porque el "reclamado" en BD es atómico) o los fragmentarían (login,
# debilitando la protección contra fuerza bruta). Los hilos sí dan
# concurrencia para peticiones de E/S (BD, WhatsApp) sin ese problema.
# Si en el futuro hace falta escalar a varios workers, hay que mover
# antes el limitador de intentos a algo compartido (p.ej. Redis).
exec gunicorn \
  --bind "0.0.0.0:${PORT:-5000}" \
  --workers "${GUNICORN_WORKERS:-1}" \
  --threads "${GUNICORN_THREADS:-4}" \
  --timeout "${GUNICORN_TIMEOUT:-60}" \
  --access-logfile - \
  --error-logfile - \
  app:app
