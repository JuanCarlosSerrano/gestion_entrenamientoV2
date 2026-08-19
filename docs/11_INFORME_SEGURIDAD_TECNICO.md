# Informe tecnico de seguridad - MindPace V2

Fecha: 19-08-2026 (revision del informe del 18-08-2026)
Alcance: backend Flask, autenticacion, autorizacion, gestion de usuarios, sesiones, CSRF, CORS, subida de ficheros, publicacion WhatsApp, archivado de atletas, configuracion y tests.

Metodo de esta revision: no se ha dado por buena la version anterior del informe. Cada control declarado se ha vuelto a verificar contra el codigo actual en `main` (`6faf09f`) y se ha vuelto a ejecutar la suite completa de tests, incluyendo el subconjunto especifico de seguridad.

Contexto de producto: el desarrollo se centra ahora en tres pilares (crear entrenamiento, planificar, gestionar atletas); el modulo de analisis y estadistica queda en pausa hasta que esos tres esten probados. Esta revision de seguridad cubre igualmente toda la superficie ya construida, incluida la que queda en pausa funcional, porque el codigo sigue desplegado y accesible.

## Resumen ejecutivo tecnico

Los controles del sprint de hardening anterior se mantienen en pie: no se ha detectado ninguna regresion. Ademas, la cobertura de tests de permisos ha crecido de forma notable desde el informe anterior, porque las funcionalidades construidas despues (planificacion individual por atleta, publicacion/WhatsApp, feedback) incorporaron sus propias comprobaciones de "atleta ajeno".

Estado verificado hoy:

- Registro publico sigue deshabilitado (`/register` devuelve 403 fijo, incluso para admin/entrenador autenticados).
- Login sigue sin loguear credenciales; `session.clear()` antes de autenticar.
- `SECRET_KEY` sigue siendo obligatoria fuera de SQLite/tests (`RuntimeError` si falta).
- Contrasenas temporales generadas por servidor (`secrets`), guardadas solo como hash.
- Cambio obligatorio de contrasena temporal sigue bloqueando el resto de la app (`force_password_change_gate`).
- CSRF sigue activo para escrituras.
- CORS sigue con lista explicita de origenes, sin `*` con credenciales.
- Subidas siguen restringidas por extension y MIME (`backend/security/uploads.py`).
- FIT sigue guardandose con nombre generado por servidor, fuera de rutas estaticas.
- Atletas con historico se siguen archivando (`activo = 0`), no se borran.
- El hallazgo P1 del informe anterior (archivos de runtime versionados en Git) **ya no existe**: verificado con `git ls-files`, ninguno de los ficheros senalados esta trackeado y el `.gitignore` los cubre.
- Suite de tests: **85 passed** en total (antes 46); el subconjunto especifico de seguridad (`test_security.py`, `test_permissions.py`, `test_upload_security.py`, `test_auth_routes.py`, `test_auth_service.py`) sigue en **46 passed**, el resto son tests funcionales anadidos despues (configuracion, admin_users, publicacion, FIT, db helpers).

## Verificacion punto por punto

### Autenticacion y sesiones

- `backend/routes/auth.py`: `/login` limpia la sesion, guarda solo `user_id`/`user_rol`/`user_email`, nunca la contrasena. Confirmado por lectura directa del codigo.
- `SECRET_KEY` (`backend/app.py:87-93`): si no hay variable de entorno y el motor no es SQLite ni estamos en tests, el arranque falla con `RuntimeError`. Sigue sin fallback conocido en produccion.
- `SESSION_COOKIE_HTTPONLY = True`, `SESSION_COOKIE_SAMESITE = "Lax"` fijos en codigo; `SESSION_COOKIE_SECURE` sigue siendo variable de entorno (`backend/app.py:98`), por defecto `false` en `.env.example` — sigue pendiente activarla explicitamente en el entorno de produccion cuando exista.
- Rate limiting de login (`login_rate_limited`, `backend/app.py:529`) sigue activo y sigue siendo en memoria del proceso (ver P2 mas abajo, sin cambios).

### Alta y reset de usuarios

- `/register` (`backend/routes/auth.py:17`) exige rol `admin` o `entrenador` y aun asi devuelve siempre 403: el alta publica esta deshabilitada por diseno, no solo protegida por rol.
- Alta y reset de atleta viven en `backend/routes/configuracion.py` (blueprint extraido despues del informe anterior): `configuracion_crear_atleta`, `configuracion_reset_password_atleta`. Generan contrasena con `secrets`, fuerzan `force_password_change = 1`.
- Test nuevo desde el informe anterior: `test_entrenador_no_puede_editar_atleta_ajeno`, `test_reset_password_respeta_permisos_y_genera_temporal_distinta` — cubren el blueprint nuevo, no solo el `app.py` original.

### Cambio obligatorio de contrasena

- `force_password_change_gate` (`backend/app.py:570`) sigue bloqueando el resto de la app mientras el flag este activo. Sin cambios respecto al informe anterior.

### CSRF y CORS

- CSRF sigue protegiendo escrituras; test `test_csrf_bloquea_feedback_sin_header` confirma que tambien cubre el modulo de feedback (construido despues del informe original).
- CORS (`backend/app.py:73-82`) sigue usando lista explicita desde `CORS_ORIGINS`, por defecto solo `localhost`/`127.0.0.1`. Sigue pendiente fijar el dominio real cuando exista despliegue publico.

### Subida de archivos

- `backend/security/uploads.py` confirma extension + MIME para imagen (`.jpg/.jpeg/.png/.webp`) y FIT (`.fit`, MIME vacio/octet-stream/vnd.ant.fit), sin cambios respecto al informe anterior.
- `MAX_CONTENT_LENGTH` sigue en 5 MB por defecto (`backend/app.py:98`), configurable por entorno.

### Archivado de atletas

- `configuracion_estado_atleta` sigue desactivando (`activo = 0`) en vez de borrar cuando hay historico. Sin cambios.

### WhatsApp

- `backend/services/whatsapp_service.py` sigue leyendo el token desde entorno y sin exponerlo al frontend. `test_publicacion_de_atleta_ajeno_se_rechaza` y `test_entrenador_no_puede_publicar_atleta_ajeno` (nuevos desde el informe anterior) confirman que la publicacion respeta la propiedad entrenador-atleta.

## Matriz de riesgos (actualizada)

| Riesgo | Severidad inicial | Estado hoy | Verificacion |
| --- | --- | --- | --- |
| Registro publico con rol elegido por cliente | P0 | Corregido, sin regresion | Lectura de `auth.py` + test |
| Login exponiendo password en logs | P0 | Corregido, sin regresion | Lectura de `auth.py` + `test_login_no_imprime_password_en_stdout` |
| `SECRET_KEY` conocida por defecto | P0 | Corregido, sin regresion | Lectura de `app.py:87-93` |
| Contrasena fija `cambiame` | P0 | Corregido, sin regresion | `test_password_temporal_no_es_fija_y_tiene_longitud_razonable` |
| Cliente define contrasena temporal | P1 | Corregido, sin regresion | `test_entrenador_crea_atleta_propio_sin_aceptar_password_cliente` |
| Usuario con password temporal usa app normal | P1 | Corregido, sin regresion | `test_force_password_change_bloquea_funciones_hasta_cambiar_password` |
| Session fixation | P1 | Mitigado, sin regresion | Lectura de `auth.py` (`session.clear()`) |
| Fuerza bruta en login | P1 | Mitigado, sin regresion | Rate limit en memoria (sigue siendo P2 para produccion, ver abajo) |
| Subida de imagen arbitraria | P1 | Corregido, sin regresion | `test_upload_foto_rechaza_extension_no_permitida` |
| Subida FIT con nombre usuario | P1 | Corregido, sin regresion | Lectura de `fit_service.py` |
| Borrado destructivo de atleta con historico | P1 | Corregido, sin regresion | Lectura de `configuracion.py` |
| Runtime artifacts versionados | P1 | **Resuelto desde el informe anterior** | `git ls-files` no devuelve ninguno de los ficheros senalados |
| Atleta ajeno accesible via planificacion individual, publicacion o feedback (superficie nueva desde el informe anterior) | P1 | Cubierto | 8 tests dedicados (`*_atleta_ajeno`, `*_ajena`) en `test_permissions.py` y `test_security.py` |

## Hallazgos pendientes (sin cambios desde el informe anterior salvo lo indicado)

### P2 - Rate limiting en memoria

Sigue siendo local al proceso Flask. Adecuado para desarrollo con un solo worker; en produccion con multiples workers/replicas conviene moverlo a Redis o equivalente.

### P2 - Flask development server

`run_main.sh` sigue arrancando con `flask run` (servidor de desarrollo). Para produccion sigue pendiente Gunicorn/uWSGI detras de proxy inverso con HTTPS.

### P2 - Gestion de sesiones filesystem

`SESSION_TYPE = "filesystem"` sigue igual. Sigue pendiente migrar a Redis o backend gestionado antes de un despliegue con varios workers.

### P3 - `SESSION_COOKIE_SECURE` desactivada por defecto

Es correcto en desarrollo (sin HTTPS local), pero hay que recordar activarla explicitamente (`SESSION_COOKIE_SECURE=true`) en cuanto exista un entorno servido por HTTPS. No es un fallo de codigo, es una tarea de configuracion de despliegue pendiente.

## Evidencias de esta revision

```bash
git ls-files | grep -E "atletas\.db-shm|atletas\.db-wal|atletas_normalizado\.db|database\.db|flask_session/|backups/gestion_entrenamiento_v2\.sql"
# sin resultados

cd backend && source .venv/bin/activate && cd ..
python -m pytest -q backend/tests
# 85 passed

python -m pytest -q backend/tests/test_security.py backend/tests/test_permissions.py \
  backend/tests/test_upload_security.py backend/tests/test_auth_routes.py backend/tests/test_auth_service.py
# 46 passed
```

## Tests de seguridad cubiertos (lista ampliada respecto al informe anterior)

Los 18 del informe original siguen pasando, mas los siguientes anadidos por las funcionalidades construidas despues:

- Entrenador no puede editar atleta ajeno (configuracion).
- Entrenador no puede modificar zonas de atleta ajeno.
- Entrenador no puede consultar/modificar planificacion de atleta ajeno.
- Entrenador no puede modificar visibilidad de atleta ajeno.
- Entrenador no puede publicar entrenamiento de atleta ajeno.
- Entrenador no puede marcar feedback de atleta ajeno.
- Admin lista usuarios sin exponer `password_hash`.
- `obtener_atleta_autorizado` devuelve 403 para atleta ajeno; admin mantiene acceso.

## Recomendaciones antes de produccion (sin cambios de fondo)

1. ~~Limpiar runtime artifacts del indice Git~~ — ya resuelto, verificar que se mantenga en cada release.
2. Configurar `SESSION_COOKIE_SECURE=true` bajo HTTPS en cuanto exista ese entorno.
3. Definir `CORS_ORIGINS` solo con el dominio real de MindPace antes de exponerlo.
4. Sustituir rate limit en memoria por Redis o equivalente si se despliega con mas de un worker.
5. Migrar sesiones filesystem a backend robusto si se despliega con mas de un worker.
6. Revisar politica de retencion de backups (`backups/` esta gitignorado; confirmar donde se guardan y con que control de acceso una vez exista un entorno fuera de esta maquina).
7. Ejecutar un pentest externo antes de publicar internet-facing.

Nota sobre el punto 6: el README describe un flujo de sincronizacion de BD entre "dos equipos" via `git add backups/...sql`, pero `backups/` esta en `.gitignore` desde antes de este informe, por lo que ese flujo documentado no se ejecuta tal cual esta escrito hoy. No es un riesgo — de hecho evita subir datos reales al repositorio — pero conviene saber que el README describe un procedimiento que no aplica mientras exista un unico entorno de desarrollo (ver nota anadida en `README.md`).
