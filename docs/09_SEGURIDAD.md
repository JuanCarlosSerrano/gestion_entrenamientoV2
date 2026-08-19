# Seguridad

## Reglas aplicadas

- No hay registro público operativo.
- Las altas se realizan por rol: admin crea usuarios; entrenador crea solo atletas propios.
- Las contraseñas temporales se generan en servidor con `secrets`, se guardan solo como hash y fuerzan cambio.
- El reset administrativo devuelve la contraseña temporal una sola vez y establece `force_password_change = 1`.
- Mientras `force_password_change = 1`, el usuario no puede usar funciones normales.
- `/login` limpia la sesión antes de establecer datos del usuario y no registra credenciales.
- CSRF protege endpoints `POST`, `PUT` y `DELETE`, salvo login.
- CORS usa lista explícita de orígenes.
- `SECRET_KEY` es obligatoria fuera de tests.
- Las cookies son `HttpOnly`, `SameSite=Lax` y pueden ser `Secure` en producción HTTPS.
- Foto de perfil: solo JPG, PNG o WEBP con MIME compatible.
- FIT: solo `.fit`, nombre final generado por servidor y validación de pertenencia atleta-entrenamiento.
- Atleta con histórico se archiva (`activo = 0`) en vez de borrarse físicamente.

## Cabeceras HTTP de seguridad

Aplicadas a toda respuesta mediante `backend/security/headers.py` (función
`apply_security_headers`, registrada con `@app.after_request` en
`app.py`). Cubren tanto respuestas HTML como JSON, incluidas las de
error (4xx/404).

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — sin
  `preload`, a propósito: `preload` implica enviar el dominio a la lista
  de precarga de los navegadores, una decisión difícil de revertir que
  no se ha pedido. `includeSubDomains` se ha dado por apropiado porque
  todo el tráfico pasa por Cloudflare (que ya fuerza HTTPS en el
  dominio); si en el futuro se sirve algún subdominio de mind-pace.net
  por HTTP plano fuera de Cloudflare, revisar esta cabecera antes.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` — junto con `frame-ancestors 'none'` en la CSP
  (ambas cabeceras se dejan para cubrir navegadores que solo respeten
  una de las dos), impide que MindPace se cargue dentro de un `<iframe>`
  en un sitio externo.
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy`, construida a partir de un inventario real de
  lo que carga el frontend (no es una plantilla genérica):

  ```
  default-src 'self';
  script-src 'self' https://cdn.jsdelivr.net https://cdn.datatables.net https://code.jquery.com;
  style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.datatables.net;
  font-src 'self' https://cdn.jsdelivr.net;
  img-src 'self' data:;
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none'
  ```

  - Los tres orígenes externos (`cdn.jsdelivr.net`, `cdn.datatables.net`,
    `code.jquery.com`) son exactamente los CDN que usa el frontend hoy
    (Bootstrap, Bootstrap Icons, Chart.js, DataTables y jQuery). No se
    ha añadido ningún dominio "por si acaso".
  - `connect-src` se queda en `'self'`: no hay peticiones `fetch`/XHR a
    dominios externos en el frontend actual.
  - `img-src` incluye `data:` porque el CSS de Bootstrap (cargado desde
    `cdn.jsdelivr.net`, ya permitido) embebe iconos de formulario como
    `background-image: url("data:image/svg+xml,...")` (carets de
    `<select>`, checkboxes, etc.); sin `data:` esos iconos quedan
    bloqueados, como se detectó en `entrenador/alertas.html`. No hay
    imágenes `data:` propias del código de MindPace, solo las que trae
    Bootstrap.
  - **Limitación temporal conocida**: `style-src` incluye
    `'unsafe-inline'` porque 6 páginas usan todavía el atributo
    `style=""` directamente en el HTML (`admin/usuarios.html`,
    `atleta/perfil.html`, `atleta/utilidades.html`,
    `entrenador/analisis_atleta.html`, `entrenador/calendario.html`,
    `entrenador/perfil_atleta.html`; 22 apariciones en total). Quitarlo
    exige mover esos estilos a clases CSS, un refactor de frontend fuera
    del alcance del cambio que introdujo estas cabeceras. Siguiente
    mejora recomendada: migrar esos `style=""` a clases y retirar
    `'unsafe-inline'` de `style-src`.
  - `script-src` **no** necesita `'unsafe-inline'`: los dos únicos
    `<script>` con código embebido que había en el proyecto
    (`cambiar_password.html` y `entrenador/grupo_entrenamiento.html`) se
    movieron a ficheros `.js` externos (`js/cambiar_password.js` y
    `js/entrenador/grupo_entrenamiento_datatable.js`) precisamente para
    poder evitarlo.

## Variables relevantes

- `SECRET_KEY`: obligatoria en entorno real.
- `SESSION_COOKIE_SECURE=false`: desarrollo local.
- `SESSION_COOKIE_SECURE=true`: producción con HTTPS.
- `CORS_ORIGINS`: dominios permitidos separados por coma.
- `MAX_CONTENT_LENGTH`: límite global de subida, por defecto 5 MB.

## Archivos sensibles detectados ya versionados

Estos archivos coinciden con patrones sensibles y ya aparecen en Git. No se han eliminado ni se ha limpiado historial porque requiere decisión explícita:

- `backend/atletas.db-shm`
- `backend/atletas.db-wal`
- `backend/atletas_normalizado.db`
- `backend/database.db`
- `backend/flask_session/*`
- `flask_session/*`
- `backups/gestion_entrenamiento_v2.sql`

Propuesta de limpieza del índice, sin borrar archivos locales:

```bash
git rm --cached backend/atletas.db-shm backend/atletas.db-wal backend/atletas_normalizado.db backend/database.db
git rm --cached -r backend/flask_session flask_session backups
git commit -m "chore: remove sensitive runtime artifacts from git tracking"
```

Si esos archivos contienen datos reales o secretos, además habría que rotar credenciales y limpiar el histórico Git con una herramienta específica antes de publicar el repositorio.
