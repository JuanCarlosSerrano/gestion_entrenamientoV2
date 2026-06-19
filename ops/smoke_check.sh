#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"

if [ -f "$BACKEND_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND_ENV"
  set +a
fi

BASE_URL="${BASE_URL:-http://127.0.0.1:5002}"
EMAIL="${SMOKE_EMAIL:-${1:-}}"
PASSWORD="${SMOKE_PASSWORD:-${2:-}}"

TMP_DIR="$(mktemp -d)"
COOKIE_JAR="$TMP_DIR/cookies.txt"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

require_status() {
  local got="$1"
  local expected="$2"
  local label="$3"
  if [ "$got" != "$expected" ]; then
    echo "ERROR: $label -> HTTP $got (esperado $expected)"
    exit 1
  fi
}

echo "== Smoke check v2 =="
echo "BASE_URL: $BASE_URL"

csrf_body="$TMP_DIR/csrf.json"
csrf_code="$(
  curl -sS -o "$csrf_body" -w "%{http_code}" \
    -c "$COOKIE_JAR" \
    "$BASE_URL/csrf-token"
)"
require_status "$csrf_code" "200" "GET /csrf-token"

csrf_token="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("csrf_token",""))' "$csrf_body")"
if [ -z "$csrf_token" ]; then
  echo "ERROR: /csrf-token no devolvio csrf_token"
  exit 1
fi
echo "OK: /csrf-token"

login_html_code="$(
  curl -sS -o /dev/null -w "%{http_code}" \
    "$BASE_URL/static/login.html"
)"
require_status "$login_html_code" "200" "GET /static/login.html"
echo "OK: /static/login.html"

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "INFO: sin credenciales (SMOKE_EMAIL/SMOKE_PASSWORD o args), solo checks anonimos."
  echo "Smoke check completado."
  exit 0
fi

echo "Intentando login con: $EMAIL"
login_body="$TMP_DIR/login.json"
login_payload="$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASSWORD")"
login_code="$(
  curl -sS -o "$login_body" -w "%{http_code}" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -H "Content-Type: application/json" \
    -d "$login_payload" \
    "$BASE_URL/login"
)"
require_status "$login_code" "200" "POST /login"

role="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("rol",""))' "$login_body")"
user_id="$(python3 -c 'import json,sys;v=json.load(open(sys.argv[1])).get("user_id");print("" if v is None else v)' "$login_body")"
if [ -z "$role" ]; then
  echo "ERROR: /login no devolvio rol"
  exit 1
fi
echo "OK: /login (rol=$role, user_id=${user_id:-n/a})"

entrenamientos_code="$(
  curl -sS -o /dev/null -w "%{http_code}" \
    -b "$COOKIE_JAR" \
    "$BASE_URL/entrenamientos"
)"
require_status "$entrenamientos_code" "200" "GET /entrenamientos"
echo "OK: /entrenamientos"

if [ "$role" = "entrenador" ] || [ "$role" = "admin" ]; then
  atletas_code="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -b "$COOKIE_JAR" \
      "$BASE_URL/atletas"
  )"
  require_status "$atletas_code" "200" "GET /atletas"
  echo "OK: /atletas"
fi

if [ "$role" = "atleta" ] && [ -n "$user_id" ]; then
  asignados_code="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -b "$COOKIE_JAR" \
      "$BASE_URL/entrenamientos_asignados/$user_id"
  )"
  require_status "$asignados_code" "200" "GET /entrenamientos_asignados/$user_id"
  echo "OK: /entrenamientos_asignados/$user_id"
fi

echo "Smoke check completado."
