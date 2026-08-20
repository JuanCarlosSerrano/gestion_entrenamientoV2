# MindPace v2

Repositorio de evolución de la aplicación, aislado de v1.

## Roadmap tecnico
- Roadmap vivo del proyecto: `docs/ROADMAP_TECNICO_V2.md`
- Kanban de ejecucion: `docs/KANBAN_V2.md`

## Reglas de trabajo (acordadas)
- v1 no se toca.
- En v2 se trabaja en un único entorno: `main`.
- Desarrollo alterno entre dos equipos: siempre hay que sincronizar código y base de datos.

## Estructura relevante
- Backend Flask: `backend/app.py`
- Config local: `backend/.env`
- Script de arranque único: `run_main.sh` (alias compatible: `run_prod.sh`)
- Backups de BD v2: `backups/gestion_entrenamiento_v2.sql`
- Scripts de sincronización BD:
  - `ops/db_export.sh`
  - `ops/db_import.sh`
  - `ops/smoke_check.sh`
- Backup nocturno automático de producción: `ops/nightly_backup.sh` (ver sección propia más abajo)

## Arranque único (v2)
```bash
./run_main.sh
```
Servidor v2 en:
- `http://127.0.0.1:5002`

## Smoke check rapido
```bash
./ops/smoke_check.sh
```
Con login:
```bash
SMOKE_EMAIL="tu_email" SMOKE_PASSWORD="tu_password" ./ops/smoke_check.sh
```

## Variables de entorno esperadas (`backend/.env`)
```env
FLASK_APP=app.py
DB_ENGINE=mariadb
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=usuario_app
DB_PASSWORD=TuPasswordSegura
DB_NAME=gestion_entrenamiento_v2
SECRET_KEY=dev
SESSION_COOKIE_NAME=my_session_v2
```

## Flujo entre dos equipos (código + datos)

> Nota (2026-08-20): además del entorno de desarrollo local ya existe producción (`gestion_entrenamiento_v2_prod`, puerto 5000, publicado en `https://mind-pace.net`), con su propia BD separada (`gestion_entrenamiento_v2_prod`). Este flujo de sincronización manual está pensado para mover un volcado de BD entre dos carpetas/equipos a mano; para el respaldo automático de producción ver "Backup nocturno (producción)" más abajo.

### En el equipo origen (antes de cambiar de equipo)
1. Exportar BD v2:
```bash
./ops/db_export.sh
```
2. Versionar y subir:
```bash
git add backups/gestion_entrenamiento_v2.sql backups/gestion_entrenamiento_v2.sql.gz
git commit -m "chore: sync db snapshot v2"
git push
```

### En el equipo destino
1. Traer cambios:
```bash
git pull
```
2. Importar BD:
```bash
./ops/db_import.sh
```
3. Arrancar:
```bash
./run_main.sh
```

## Producción

MindPace V2 está publicado en `https://mind-pace.net`. Es un clon
aparte de este repositorio (`gestion_entrenamiento_v2_prod`, misma
máquina, `git remote` compartido con este), con su propia base de
datos MariaDB separada de la de desarrollo — nunca se mezclan datos
reales con datos de prueba.

Cadena de publicación: Cloudflare (Named Tunnel, sin abrir puertos en
el router) → `127.0.0.1:5000` → gunicorn → Flask. Gunicorn corre con
**1 solo worker** a propósito: el hilo de publicaciones programadas y
el limitador de intentos de login son locales al proceso, así que
varios workers los duplicarían o fragmentarían (ver
`run_prod.sh` y `docs/11_INFORME_SEGURIDAD_TECNICO.md`).

Gestionado por `launchd` como `LaunchDaemon`
(`/Library/LaunchDaemons/net.mindpace.gunicorn.plist`, copiado desde
`ops/net.mindpace.gunicorn.plist` en el clon de producción): se
reinicia solo si el proceso muere o si el Mac reinicia.

Desplegar un cambio a producción:
```bash
# en el clon de desarrollo
git push origin main

# en el clon de producción
git pull origin main
# si cambió algún .py del backend, hace falta reiniciar gunicorn:
pkill -f "gestion_entrenamiento_v2_prod/backend/.venv/bin/gunicorn"
# launchd lo relanza solo en segundos (KeepAlive)
```
Los cambios de solo frontend (HTML/CSS/JS) no necesitan reinicio:
Flask los sirve directamente desde disco en cada petición.

## Backup nocturno (producción)

`ops/nightly_backup.sh` vuelca la BD de producción con `mysqldump` (vía
`docker exec` sobre el contenedor `mindpace-mariadb`), la comprime y la
guarda con marca de tiempo en `backups/nightly/` — nunca sobrescribe la
del día anterior. Borra automáticamente lo que tenga más de
`BACKUP_RETENTION_DAYS` días (14 por defecto; se puede fijar en
`backend/.env`). Cada ejecución queda registrada en `logs/backup.log`.

Programado como **LaunchAgent** de macOS (`~/Library/LaunchAgents/net.mindpace.backup.plist`,
copiado desde `ops/net.mindpace.backup.plist`) a las 03:00 cada noche. Es
LaunchAgent y no LaunchDaemon porque el script depende de que Docker
Desktop esté en marcha (su socket solo existe con una sesión de usuario
iniciada); un LaunchDaemon de sistema no tendría acceso a él. Se intentó
primero un `mysqldump` nativo por TCP (sin pasar por Docker, instalando
`mysql-client` con Homebrew) precisamente para poder usar un
LaunchDaemon y no depender de la sesión gráfica, pero el `brew install`
falló al compilar: macOS 13 ya no es una configuración "Tier 1" de
Homebrew. **Limitación conocida**: si el Mac reinicia y nadie inicia
sesión antes de las 03:00, esa noche no habrá backup — hay que
comprobar `logs/backup.log` de vez en cuando.

Comandos útiles:
```bash
# Ejecutar un backup manualmente
./ops/nightly_backup.sh

# Ver logs
tail -f logs/backup.log

# Instalar/reinstalar el LaunchAgent
cp ops/net.mindpace.backup.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/net.mindpace.backup.plist

# Desactivarlo
launchctl unload ~/Library/LaunchAgents/net.mindpace.backup.plist
```

## Nota sobre ramas
- La evolución funcional debe ir sobre `main`.
- `run_dev.sh` y `run_pre.sh` se eliminaron intencionalmente para evitar entornos duplicados.
