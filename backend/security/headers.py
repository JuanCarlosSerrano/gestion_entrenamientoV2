"""Cabeceras HTTP de seguridad aplicadas a toda respuesta de MindPace V2.

La CSP está diseñada a partir de un inventario real de lo que carga el
frontend (ver docs/09_SEGURIDAD.md para el detalle):

- Bootstrap, Bootstrap Icons y Chart.js se sirven desde cdn.jsdelivr.net.
- DataTables (CSS y JS) se sirve desde cdn.datatables.net.
- jQuery se sirve desde code.jquery.com.
- No hay imágenes ni fuentes en data:, ni fetch/XHR a dominios externos,
  ni iframes: la app no necesita img-src/connect-src/frame-src más allá
  de 'self'.

`style-src` incluye 'unsafe-inline' porque varias páginas usan todavía
el atributo style="" directamente en el HTML (admin/usuarios.html,
atleta/perfil.html, atleta/utilidades.html,
entrenador/analisis_atleta.html, entrenador/calendario.html,
entrenador/perfil_atleta.html). Quitarlo exige mover esos estilos a
clases CSS, un refactor de frontend fuera del alcance de este cambio;
queda documentado como limitación temporal en docs/09_SEGURIDAD.md.

`script-src` NO necesita 'unsafe-inline': los dos únicos <script> con
código embebido que había en el proyecto (cambiar_password.html y
entrenador/grupo_entrenamiento.html) se movieron a ficheros .js
externos como parte de este mismo cambio, precisamente para poder
evitarlo.
"""

CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self' https://cdn.jsdelivr.net https://cdn.datatables.net https://code.jquery.com; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.datatables.net; "
    "font-src 'self' https://cdn.jsdelivr.net; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'none'"
)


def apply_security_headers(response):
    """Añade las cabeceras de hardening HTTP a una respuesta Flask y la devuelve."""
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
    return response
