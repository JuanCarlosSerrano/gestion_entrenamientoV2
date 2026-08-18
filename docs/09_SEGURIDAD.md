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
