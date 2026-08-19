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

> Nota (2026-08-19): actualmente solo existe el entorno de desarrollo local (una máquina, una BD). Este flujo de sincronización queda documentado para cuando exista un segundo equipo/entorno real; hasta entonces no aplica.

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

## Nota sobre ramas
- La evolución funcional debe ir sobre `main`.
- `run_dev.sh` y `run_pre.sh` se eliminaron intencionalmente para evitar entornos duplicados.
