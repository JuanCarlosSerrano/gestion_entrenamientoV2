# Informe técnico de seguridad — MindPace V2

Fecha: 20-08-2026 (revisión del informe del 19-08-2026)
Alcance: backend Flask, autenticación, autorización, gestión de usuarios, sesiones, CSRF, CORS, cabeceras HTTP/CSP, subida de ficheros, publicación WhatsApp (envío y webhook de estado), archivado de atletas, esquema de base de datos, configuración de producción y tests.

Método de esta revisión: no se ha dado por buena la versión anterior del informe. Cada control declarado se ha vuelto a verificar contra el código actual en `main` (`f908487`) y se ha vuelto a ejecutar la suite completa de tests.

Contexto de producto: el desarrollo sigue centrado en tres pilares (crear entrenamiento, planificar, gestionar atletas); el módulo de análisis y estadística sigue en pausa. Desde el informe anterior, **MindPace V2 pasó de "solo desarrollo" a publicado de verdad** en `https://mind-pace.net`, con un entrenador y un atleta reales usándolo — varios de los hallazgos de esta revisión (los dos incidentes de datos y la fuga de propiedad en `responder_feedback`) se descubrieron precisamente por ese uso real, no por auditoría preventiva.

## Resumen ejecutivo técnico

Desde el informe del 19/08 se cerró producción de verdad (antes era una recomendación pendiente, "P2 — Flask development server") y, con uso real, aparecieron y se corrigieron una fuga de seguridad explotable y dos incidentes de integridad de datos. Motivado por eso, se hizo además una auditoría sistemática de las dos clases de fallo que los causaron, en vez de asumir que eran casos aislados — encontrando y cerrando más instancias del mismo patrón.

Estado verificado hoy:

- Registro público sigue deshabilitado.
- CSRF sigue activo para escrituras; ruta del webhook de WhatsApp exenta a propósito (Meta no manda cookie de sesión) y protegida en su lugar por firma `X-Hub-Signature-256`.
- **Producción real**: gunicorn (no el servidor de desarrollo de Flask), `CORS_ORIGINS` fijado a `https://mind-pace.net` y `https://www.mind-pace.net` (ya no `localhost`), `SESSION_COOKIE_SECURE=true` bajo HTTPS real vía Cloudflare Tunnel. Las tres recomendaciones "antes de producción" del informe anterior sobre esto están hechas.
- **Cabeceras HTTP de seguridad y CSP**, ausentes en el informe anterior, añadidas: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy` restrictiva (sin `unsafe-inline` en `script-src`; sí en `style-src`, limitación documentada — ver `docs/09_SEGURIDAD.md`).
- **Corregido — fuga de propiedad real, explotada en el sentido de que el código lo permitía**: `POST /feedbacks/<id>/responder` no comprobaba que el feedback perteneciera a un atleta del entrenador que responde (su ruta hermana, `marcar_feedback_leido`, sí lo hacía). Cualquier entrenador autenticado podía responder al feedback de un atleta ajeno.
- **Corregido — misma clase de fallo, encontrada por auditoría posterior de las ~36 rutas de escritura**: 5 rutas que asignan/clonan una plantilla de entrenamiento a un atleta comprobaban que el atleta fuera del entrenador, pero nunca que la plantilla (`entrenamiento_id`) lo fuera. Un entrenador podía usar el id de la plantilla privada de otro entrenador con solo adivinarlo.
- **Corregido — dos incidentes de integridad de datos por divergencia entre el esquema de SQLite (tests) y MariaDB (real)**: una columna (`feedbacks.fatiga` / `sesiones_realizadas.fatiga`) tipada como entero cuando la aplicación siempre guarda texto, y una restricción `UNIQUE` ausente en `sesiones_realizadas.entrenamiento_asignado_id` de la que el código de "actualizar si existe" ya dependía. Ambos hicieron falta datos reales de producción para descubrirse: SQLite no los detecta por tipado débil. Auditados y corregidos también en `schema.sql`/`schema_mariadb.sql` de forma sistemática, no solo el caso puntual.
- Suite de tests: **126 passed** (antes 85; 41 tests nuevos desde el informe anterior, entre ellos los de regresión de los tres hallazgos de arriba).

## Verificación punto por punto

### Autenticación y sesiones

- Sin cambios respecto al informe anterior en lo ya verificado (login no expone contraseñas, `SECRET_KEY` obligatoria, `force_password_change_gate` sigue bloqueando el resto de la app).
- `SESSION_COOKIE_SECURE` **ya está activada en producción** (`backend/.env` real, `SESSION_COOKIE_SECURE=true`), verificado sirviendo tras HTTPS real. Deja de ser una recomendación pendiente.

### CSRF, CORS y cabeceras HTTP

- CSRF: lista de exención ahora incluye también `whatsapp_webhook_receive` — es la única ruta pública sin sesión que existe en la aplicación, y en su lugar se valida con la firma HMAC de Meta (`X-Hub-Signature-256` sobre `WHATSAPP_APP_SECRET`); si ese secreto no está configurado, la petición se deja pasar con aviso en el log en vez de bloquear el desarrollo — pendiente de fijarlo antes de dar de alta el webhook en Meta de verdad.
- CORS (`backend/app.py`): en producción, `CORS_ORIGINS=https://mind-pace.net,https://www.mind-pace.net` — ya no incluye `localhost`. Verificado con petición real: origen permitido recibe `Access-Control-Allow-Origin`, uno no permitido no.
- Cabeceras nuevas (`backend/security/headers.py`, `@app.after_request` en `app.py`), aplicadas a toda respuesta:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (sin `preload`, decisión deliberada).
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Content-Security-Policy` construida a partir de un inventario real del frontend (no plantilla genérica): `script-src` sin `unsafe-inline` (se extrajeron los 2 únicos `<script>` inline que había en toda la app); `style-src` sí lo necesita — 22 atributos `style=""` en 6 páginas, refactor pendiente documentado en `09_SEGURIDAD.md`; `img-src 'self' data:` (Bootstrap embebe iconos SVG en `data:`); dominios externos limitados a los 3 CDN que realmente usa la app.
  - 9 tests dedicados (`test_security_headers.py`) verifican presencia y valores exactos en respuestas HTML y JSON, y que CORS sigue funcionando con estas cabeceras activas.

### Esquema de base de datos (nuevo apartado)

- Auditoría campo a campo de `schema.sql` (SQLite) contra `schema_mariadb.sql` (el que se usa de verdad), motivada por los dos incidentes de datos de esta revisión. Resultado tras corregir: cero divergencias de tipo (numérico vs texto), cero de `UNIQUE`, cero columnas presentes en un motor y ausentes en el otro.
- De paso, encontrada y corregida una tercera: `entrenamientos_asignados` en `schema.sql` tenía una columna heredada de la v1 (`bloque_principal`) declarada `NOT NULL` sin valor por defecto y sin uso real en esa tabla — cualquier inserción real en una instalación SQLite desde ese esquema habría fallado. No afecta a la base de datos real (MariaDB, ya correcta), pero sí a una hipotética instalación nueva desde `schema.sql`.
- Corregido con `ALTER TABLE` directo en las bases de datos reales de desarrollo y producción (no solo en el fichero fuente), verificado con un reenvío real tras el arreglo.

### Auditoría de rutas de escritura (nuevo apartado)

- Revisadas las ~36 rutas de escritura (`POST`/`PUT`/`DELETE`) del backend buscando el mismo patrón que `responder_feedback` tenía: comprobación de propiedad ausente donde una ruta hermana sí la tiene. La inmensa mayoría ya estaba bien — la única clase de fallo encontrada y no cerrada previamente fue la de plantillas ajenas (ver resumen ejecutivo).
- Nuevo helper `entrenamientos_fuera_de_equipo()` (mismo patrón que el ya existente `atletas_fuera_de_equipo()`), aplicado en los 5 puntos de entrada que faltaban.

### Subida de archivos, archivado de atletas, WhatsApp (envío)

Sin cambios respecto al informe anterior; sigue verificado.

### WhatsApp — webhook de estado de entrega (nuevo desde el informe anterior)

- Antes, un mensaje aceptado por la API de Meta (HTTP 200 + `wamid`) pero fallido después de forma asíncrona (p. ej. error 131047, "han pasado más de 24h desde la última respuesta del contacto") quedaba invisible: la base de datos seguía marcándolo como "enviado". Ocurrió de verdad en producción.
- `GET/POST /webhooks/whatsapp`: verificación de suscripción por `hub.verify_token` y verificación de firma de cada evento (`WHATSAPP_APP_SECRET`, con aviso si no está configurado en vez de bloquear). Actualiza `entrenamientos_envios.estado`/`entrenamientos_asignados.estado_envio` a `error` con el detalle real de Meta cuando el estado es `failed`.
- Pendiente (no es un fallo de código, es una limitación de producto): la ventana de 24h de WhatsApp no tiene solución en código — requiere plantillas aprobadas por Meta, trabajo fuera de esta aplicación.

## Matriz de riesgos (actualizada)

| Riesgo | Severidad inicial | Estado hoy | Verificación |
| --- | --- | --- | --- |
| (Todo lo del informe anterior: registro público, password en logs, `SECRET_KEY`, contraseña fija, session fixation, subida de ficheros, borrado destructivo, runtime artifacts, atleta ajeno en planificación/publicación/feedback) | — | Sin regresión | Sin cambios, ver informe del 19/08 |
| `responder_feedback` sin comprobación de propiedad | P1 | **Corregido hoy** | `test_entrenador_no_puede_responder_feedback_de_atleta_ajeno` + positivo `test_entrenador_si_puede_responder_feedback_de_su_propio_atleta` |
| Asignar/clonar plantilla de otro entrenador (5 rutas) | P1 | **Corregido hoy** | 5 tests dedicados, uno por ruta, en `test_security.py` |
| `feedbacks.fatiga`/`sesiones_realizadas.fatiga` mal tipada en MariaDB | P1 (integridad de datos) | **Corregido hoy** | `test_feedback_acepta_fatiga_como_texto` + verificado en producción real |
| `sesiones_realizadas` sin `UNIQUE`, duplicaba entrenamientos en el registro del atleta | P1 (integridad de datos) | **Corregido hoy** | `test_resultados_no_duplica_sesion_realizada_al_reenviar` (confirmado que detecta la regresión: falla si se quita el `UNIQUE`) |
| Servidor de desarrollo de Flask en producción | P2 | **Corregido** | gunicorn real, verificado en `mind-pace.net` |
| `CORS_ORIGINS`/`SESSION_COOKIE_SECURE` sin fijar para producción | P3 | **Corregido** | `backend/.env` de producción real |
| Cabeceras de seguridad HTTP / CSP ausentes | P2 | **Corregido** | `test_security_headers.py`, 9 tests |
| Webhook de WhatsApp sin verificación de firma | — (funcionalidad nueva) | Mitigado con degradación explícita si falta el secreto | Lectura de código + test de firma inválida |

## Hallazgos pendientes

### P2 — Rate limiting y sesiones en memoria/filesystem, siguen sin cambios

Siguen siendo locales al proceso Flask. Mitigado en la práctica por una decisión deliberada: gunicorn en producción corre con **1 worker** (no varios), precisamente para no fragmentar el rate limit de login entre procesos ni duplicar el hilo de publicaciones programadas. Si en el futuro hace falta escalar a varios workers, esto hay que resolverlo antes (Redis o equivalente), no después.

### P2 — CSP con `style-src 'unsafe-inline'`

Documentado en `docs/09_SEGURIDAD.md` con la lista exacta de páginas afectadas (22 atributos `style=""` en 6 archivos). Requiere mover esos estilos a clases CSS; refactor de frontend fuera de alcance de la tarea que introdujo la CSP.

### P3 — Plantillas de WhatsApp

No es un hallazgo de seguridad sino un límite de producto: mensajes fuera de la ventana de 24h de WhatsApp no se pueden entregar sin plantillas aprobadas por Meta. El webhook nuevo hace visible el fallo; no lo evita.

## Evidencias de esta revisión

```bash
cd backend && source .venv/bin/activate && cd ..
python -m pytest -q backend/tests
# 126 passed
```

## Recomendaciones antes de escalar (ya no "antes de producción" — eso ya pasó)

1. Si se pasa a más de un worker de gunicorn: mover el rate limit de login y el hilo de publicaciones programadas a algo compartido entre procesos (Redis o equivalente) antes, no después.
2. Completar la migración de `style-src` para poder quitar `'unsafe-inline'` de la CSP.
3. Configurar `WHATSAPP_APP_SECRET` y dar de alta el webhook en el panel de Meta cuando se decida perseguir plantillas de WhatsApp (requiere trabajo en Meta Business Manager, no solo código).
4. Pentest externo si en algún momento se maneja un volumen de atletas/datos que lo justifique.
