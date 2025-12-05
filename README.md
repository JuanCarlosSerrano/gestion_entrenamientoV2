# MindPace

Primer borrador de la documentación para orientar la puesta en marcha local del proyecto y organizar el trabajo pendiente.

## 1. Visión general
- Aplicación interna para administrar atletas, entrenadores y planes de entrenamiento.
- Backend en Flask + MariaDB (con modo SQLite opcional para desarrollo) que expone API REST y sirve los archivos estáticos.
- Frontend en HTML/CSS/JS plano que consume la API (Bootstrap + FullCalendar).

## 2. Arquitectura rápida
| Capa | Ubicación | Descripción |
| --- | --- | --- |
| Backend | `backend/app.py` | Flask, sesiones en filesystem, protección CSRF y rutas para autenticación, gestión de atletas, plantillas y asignaciones. |
| Base de datos | MariaDB (por defecto) / SQLite (fallback) | `backend/app.py` se conecta a MariaDB usando variables de entorno (`DB_HOST`, `DB_USER`, etc.). Se mantiene soporte de desarrollo con SQLite (`backend/atletas.db`). |
| Frontend estático | `frontend/static` | Vistas por rol (`admin`, `entrenador`, `atleta`), recursos compartidos (`css`, `js`, `img`). |
| Dependencias JS | `frontend/package.json` | FullCalendar y plugins (`node_modules` incluido en el repo actualmente). |

## 3. Requisitos previos
- MariaDB 10.5+ con una base de datos creada (ej. `gestion_entrenamiento`) y usuario con permisos de escritura.
- Python 3.10+ y `pip` (instalar `mariadb` con `pip install mariadb`).
- Node.js 18+ y `npm` (solo si se necesitan reinstalar dependencias front).
- SQLite CLI solo si quieres seguir usando el modo local antiguo.
- Variables de entorno recomendadas:
  - `SECRET_KEY`: clave diferente a la de desarrollo.
  - `FLASK_ENV=development` para activar recarga automática.
  - `DB_ENGINE=mariadb` (por defecto), `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` para la conexión.

## 4. Estructura principal del repositorio
```
backend/
  app.py            # Servidor Flask y rutas
  schema.sql        # Definición de tablas SQLite (modo legacy/desarrollo)
  schema_mariadb.sql# Definición de tablas para MariaDB
  atletas.db        # BD SQLite generada (puede eliminarse y recrearse)
frontend/
  static/           # HTML/CSS/JS que se sirve desde Flask
  package*.json     # Dependencias JS (FullCalendar)
flask_session/      # Carpeta usada por Flask-Session en desarrollo
```

## 5. Configurar y ejecutar el backend
1. Crear y activar entorno virtual:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. Instalar dependencias base:
   ```bash
   pip install flask flask-cors flask-session mariadb
   ```
   - También se emplea `werkzeug` (instalado con Flask) y la biblioteca estándar `sqlite3`.
3. Definir variables (Unix):
   ```bash
   export FLASK_APP=backend.app
   export FLASK_ENV=development
   export SECRET_KEY="cambia-esto"
   # MariaDB (por defecto)
   export DB_ENGINE=mariadb
   export DB_HOST=localhost
   export DB_PORT=3306
   export DB_USER=tu_usuario
   export DB_PASSWORD=tu_password
   export DB_NAME=gestion_entrenamiento
   ```
4. Inicializar la base de datos (ver sección siguiente) y luego lanzar el servidor:
   ```bash
   flask run --debug --host 0.0.0.0 --port 5000
   ```
   Alternativa directa: `python backend/app.py` (usa `app.run(debug=True, host='0.0.0.0')`).
   - Si quieres seguir usando SQLite en local, exporta `DB_ENGINE=sqlite` y se usará `backend/atletas.db`.

## 6. Inicializar o resetear la base de datos
1. Crea la base en MariaDB si no existe:
   ```bash
   mysql -uTU_USUARIO -p -e "CREATE DATABASE IF NOT EXISTS gestion_entrenamiento CHARACTER SET utf8mb4;"
   ```
2. Activa el entorno virtual, exporta `FLASK_APP=backend.app` y comprueba las variables de conexión (`DB_*`).
3. Ejecuta el comando personalizado:
   ```bash
   flask initdb
   ```
   - Si `DB_ENGINE=mariadb`, se aplica `backend/schema_mariadb.sql` contra la base configurada.
   - Si `DB_ENGINE=sqlite`, se usa `backend/schema.sql` y se recrea `backend/atletas.db`.
4. Para reiniciar el estado en SQLite basta con borrar `backend/atletas.db` antes de repetir el comando.

## 7. Frontend estático
- Los HTML principales están en `frontend/static/login.html`, `register.html`, `admin/`, `entrenador/`, `atleta/`.
- Los scripts se encuentran en `frontend/static/js/...` (por ejemplo `entrenador/atletas.js` consume la API `http://127.0.0.1:5000` con `fetch` y maneja CSRF vía `localStorage`).
- Para reinstalar dependencias JS:
  ```bash
  cd frontend
  npm install
  ```
- Flask sirve esta carpeta como `static_folder`, por lo que no se necesita un servidor separado durante el desarrollo.

## 8. Flujo básico y roles
- **Registro/Login**: rutas `/register` y `/login` crean usuarios y almacenan sesiones de servidor en `flask_session/`.
- **Roles soportados**: `admin`, `entrenador`, `atleta`. El decorador `@requires_roles` aplica control de acceso.
- **Entrenadores**: pueden gestionar atletas (`/atletas`), asignar entrenamientos (`/entrenamientos`, `/entrenamientos_asignados`) y revisar feedback.
- **Atletas**: consumen los planes asignados y envían retroalimentación.

## 9. Próximos pasos para completar la documentación
1. **Detalles de la API**: describir cada endpoint (método, payload, respuesta, roles permitidos, errores comunes).
2. **Guías por rol**: capturas y pasos para admin/entrenador/atleta (HTML ya dividido por carpetas).
3. **Despliegue**: documentar cómo servir Flask detrás de Gunicorn/Nginx y cómo manejar archivos estáticos.
4. **Configuración avanzada**: HTTPS, políticas de cookies y CSRF en producción, almacenamiento seguro de sesiones.
5. **Datos de ejemplo**: scripts para crear usuarios iniciales (admin + entrenador) tras `flask initdb`.
6. **Testing**: definir pruebas manuales mínimas y, si aplica, pruebas automatizadas (pytest para backend, e2e para flujos críticos).

Con esta base se puede iterar sobre cada sección hasta completar la documentación formal.
