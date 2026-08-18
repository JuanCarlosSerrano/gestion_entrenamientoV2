# Informe tecnico de seguridad - MindPace V2

Fecha: 18-08-2026  
Alcance: backend Flask, autenticacion, autorizacion, gestion de usuarios, sesiones, CSRF, CORS, subida de ficheros, publicacion WhatsApp, archivado de atletas, configuracion y tests.

## Resumen ejecutivo tecnico

Se ha realizado un sprint de hardening centrado en vulnerabilidades reales antes de una futura exposicion publica. El trabajo ha reducido riesgos criticos en registro publico, credenciales, control de sesion, contrasenas temporales, subida de archivos y borrado destructivo.

Estado tras el sprint:

- Registro publico deshabilitado.
- Login sin logs de credenciales.
- `SECRET_KEY` obligatoria fuera de tests.
- Contraseñas temporales generadas por servidor y almacenadas solo como hash.
- Cambio obligatorio de contraseña temporal antes de usar funciones normales.
- CSRF activo para escrituras.
- CORS con origenes explicitos.
- Subidas restringidas por extension y MIME.
- FIT guardado con nombre generado por servidor.
- Atletas con historico archivados en vez de eliminados.
- Suite backend completa en verde: `46 passed`.

## Cambios implementados

### Autenticacion y sesiones

- `/login` limpia la sesion con `session.clear()` antes de establecer datos del usuario.
- Se eliminan logs de `password`, payload completo de login y usuario completo con `password_hash`.
- Login registra solo eventos seguros: login correcto/fallido con email o user_id y rol.
- Se anade rate limiting basico por IP para `/login`.
- `SECRET_KEY` deja de tener fallback conocido fuera de tests.
- `SESSION_COOKIE_HTTPONLY = True`.
- `SESSION_COOKIE_SAMESITE = "Lax"`.
- `SESSION_COOKIE_SECURE` queda configurable para produccion HTTPS.

### Alta y reset de usuarios

- `/register` ya no permite alta publica.
- Admin puede crear usuarios desde endpoint protegido.
- Entrenador no puede crear admin ni entrenador.
- Entrenador crea solo atletas propios.
- Las contraseñas temporales se generan con `secrets.token_urlsafe`.
- No se acepta contraseña inicial controlada por cliente.
- El hash se guarda en `password_hash`.
- `force_password_change = 1` se establece tras alta o reset.
- La contraseña temporal se devuelve una sola vez en la respuesta.
- Se mantiene `password_temporal` por compatibilidad y se anade `temporary_password`.

### Cambio obligatorio de contraseña

- Si `force_password_change = 1`, el usuario no puede usar funciones normales.
- Se permiten solo endpoints estrictamente necesarios: login, CSRF, cambio de contraseña y estaticos.
- Nueva pantalla comun: `frontend/static/cambiar_password.html`.
- Tras cambiar la contraseña, `force_password_change = 0`.

### CSRF y CORS

- CSRF protege `POST`, `PUT` y `DELETE`.
- Login queda exento por diseno.
- `/register` ya no queda exento innecesariamente.
- CORS no usa `*` con credenciales.
- `CORS_ORIGINS` queda documentado en `.env.example`.

### Subida de archivos

- Foto de perfil:
  - Solo `.jpg`, `.jpeg`, `.png`, `.webp`.
  - MIME compatible obligatorio.
  - Uso de `secure_filename`.
  - Limite global con `MAX_CONTENT_LENGTH`, por defecto 5 MB.

- FIT:
  - Solo `.fit`.
  - MIME permitido: vacio, `application/octet-stream` o `application/vnd.ant.fit`.
  - Nombre final generado por servidor con token aleatorio.
  - Validacion de pertenencia atleta-entrenamiento antes de guardar.
  - Almacenamiento en `backend/uploads/fit`, fuera de rutas estaticas publicas.

### Archivado de atletas

- Si un atleta tiene historico, no se elimina fisicamente.
- Se establece `activo = 0`.
- Se conserva historico: entrenamientos asignados, feedbacks, sesiones, zonas, envios y alertas.
- Borrado fisico queda reservado para atletas sin historico.

### WhatsApp

- El token se lee desde entorno.
- No se devuelve al frontend.
- No se loguean tokens ni cabeceras `Authorization`.
- `wamid` puede persistirse como identificador de proveedor.
- La publicacion mantiene idempotencia para no duplicar avisos.

## Matriz de riesgos

| Riesgo | Severidad inicial | Estado | Control aplicado |
| --- | --- | --- | --- |
| Registro publico con rol elegido por cliente | P0 | Corregido | `/register` protegido/deshabilitado funcionalmente |
| Login exponiendo password en logs | P0 | Corregido | Logs saneados |
| `SECRET_KEY` conocida por defecto | P0 | Corregido | Obligatoria fuera de tests; clave local rotada |
| Contraseña fija `cambiame` | P0 | Corregido | Generacion con `secrets` |
| Cliente define contraseña temporal | P1 | Corregido | Servidor ignora password inicial y genera temporal |
| Usuario con password temporal usa app normal | P1 | Corregido | Gate por `force_password_change` |
| Session fixation | P1 | Mitigado | `session.clear()` antes de login |
| Fuerza bruta en login | P1 | Mitigado | Rate limit basico por IP |
| Subida de imagen arbitraria | P1 | Corregido | Extension + MIME + limite tamano |
| Subida FIT con nombre usuario | P1 | Corregido | Nombre generado por servidor |
| Borrado destructivo de atleta con historico | P1 | Corregido | Archivado |
| Runtime artifacts versionados | P1 | Pendiente decision | Reportado; requiere `git rm --cached` y posible limpieza de historia |

## Hallazgos pendientes

### P1 - Archivos sensibles ya versionados

Se han detectado archivos de runtime ya trackeados por Git:

- `backend/atletas.db-shm`
- `backend/atletas.db-wal`
- `backend/atletas_normalizado.db`
- `backend/database.db`
- `backend/flask_session/*`
- `flask_session/*`
- `backups/gestion_entrenamiento_v2.sql`

No se han eliminado automaticamente porque puede afectar al repositorio y al historico Git.

Propuesta:

```bash
git rm --cached backend/atletas.db-shm backend/atletas.db-wal backend/atletas_normalizado.db backend/database.db
git rm --cached -r backend/flask_session flask_session backups
git commit -m "chore: remove sensitive runtime artifacts from git tracking"
```

Si contienen datos reales, tambien se recomienda:

- rotar credenciales;
- invalidar sesiones;
- limpiar historico Git antes de publicar;
- revisar si el repositorio fue compartido externamente.

### P2 - Rate limiting en memoria

El rate limit actual es local al proceso Flask. Es suficiente como control basico de desarrollo, pero en produccion con multiples workers conviene moverlo a Redis o una solucion centralizada.

### P2 - Flask development server

El servidor actual es de desarrollo. Para produccion debe usarse WSGI/ASGI detras de HTTPS, por ejemplo Gunicorn/uWSGI mas proxy inverso.

### P2 - Gestion de sesiones filesystem

Flask-Session filesystem funciona en desarrollo, pero en produccion conviene migrar sesiones a Redis o almacenamiento gestionado con expiracion, rotacion y limpieza.

## Evidencias de prueba

Comandos ejecutados:

```bash
python3 -m py_compile backend/app.py
python3 -m pytest backend/tests
git diff --check -- backend/app.py backend/.env.example frontend/static/js/script.js frontend/static/cambiar_password.html frontend/static/entrenador/utilidades.html backend/tests/test_security.py docs/03_CAPACIDADES_DEL_SISTEMA.md docs/04_ARQUITECTURA_FUNCIONAL.md docs/05_MODELO_DEL_DOMINIO.md docs/08_FLUJOS_FUNCIONALES.md docs/09_SEGURIDAD.md
```

Resultado:

```text
46 passed, 88 warnings
```

Las advertencias corresponden a deprecaciones de Flask-Session filesystem.

## Tests de seguridad cubiertos

- Registro anonimo no crea admin, entrenador ni atleta.
- Entrenador no crea admin ni entrenador.
- Admin crea entrenador con contraseña temporal.
- Contraseña inicial no es fija.
- Contraseña inicial no se guarda en texto plano.
- Alta de atleta por entrenador asigna `entrenador_id` del usuario actual.
- Alta establece `force_password_change = 1`.
- Reset respeta permisos entrenador-atleta.
- Reset genera contraseña distinta.
- Reset establece `force_password_change = 1`.
- Atleta no puede resetear contraseñas.
- Cambio obligatorio bloquea funciones normales.
- Login no imprime password en stdout.
- Foto rechaza extension no permitida.
- FIT rechaza extension no FIT.
- CSRF bloquea escrituras sin token.
- Entrenador no accede ni publica atleta ajeno.
- WhatsApp no duplica envios.

## Recomendaciones antes de produccion

1. Limpiar runtime artifacts del indice Git y, si hay datos reales, limpiar historico.
2. Rotar credenciales si algun dump o base versionada contiene secretos o datos personales.
3. Configurar `SESSION_COOKIE_SECURE=true` bajo HTTPS.
4. Definir `CORS_ORIGINS` solo con dominio real de MindPace.
5. Sustituir rate limit en memoria por Redis o proveedor equivalente.
6. Migrar sesiones filesystem a backend robusto.
7. Revisar backups y politica de retencion.
8. Ejecutar un pentest externo antes de publicar internet-facing.
