from flask import Flask, jsonify, request, session
from flask import redirect, url_for
from flask_cors import CORS
from flask_session import Session
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import os
from werkzeug.utils import secure_filename
import secrets
import sqlite3

try:
    import mariadb  # type: ignore
except ImportError:  # El paquete se instala sólo cuando se usa MariaDB
    mariadb = None

app = Flask(__name__, static_folder='../frontend/static')  # Configuración correcta de static_folder

# Config CORS con soporte de credenciales y orígenes configurables
_cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:8080,http://127.0.0.1:8080,http://12.0.1.8:8080",
)
_cors_origins_list = [o.strip() for o in _cors_origins.split(",") if o.strip()]
CORS(
    app,
    supports_credentials=True,
    resources={r"/*": {"origins": _cors_origins_list}},
)
app.config["SESSION_PERMANENT"] = False  # Las sesiones expiran cuando se cierra el navegador
app.config["SESSION_TYPE"] = "filesystem"  # Almacena las sesiones en el sistema de archivos (para desarrollo)
app.config["SESSION_FILE_DIR"] = "flask_session"  # Directorio para almacenar archivos de sesión
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "DEV_KEY_CAMBIALA")  # ¡Reemplaza con una clave segura!
app.config["SESSION_COOKIE_NAME"] = "my_session"  # Nombre de la cookie de sesión
app.config["SESSION_COOKIE_HTTPONLY"] = True  # Recomendado por seguridad
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"  # Recomendado por seguridad
app.config["SESSION_COOKIE_SECURE"] = True  # 1 hora de duración de la sesión
Session(app)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, 'atletas.db')
DB_ENGINE = os.getenv("DB_ENGINE", "mariadb").lower()  # mariadb | sqlite
MARIADB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "gestion_entrenamiento"),
}
DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError,)
if mariadb:
    DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError, mariadb.IntegrityError)


def ensure_meta_columns():
    """
    Asegura columnas de propietario (creador_id) y extras (force_password_change, url_datos).
    """
    tablas_owner = ("entrenamientos", "microciclos", "mesociclos", "macrociclos")
    if DB_ENGINE == "mariadb":
        conn = get_db()
        cur = conn.cursor()
        try:
            for tabla in tablas_owner:
                try:
                    cur.execute(f"ALTER TABLE {tabla} ADD COLUMN IF NOT EXISTS creador_id INT NULL")
                    cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{tabla}_creador ON {tabla}(creador_id)")
                except Exception:
                    pass
            try:
                cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS force_password_change TINYINT DEFAULT 0")
            except Exception:
                pass
            try:
                cur.execute("ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS url_datos TEXT")
            except Exception:
                pass
            conn.commit()
        finally:
            cur.close()
            conn.close()
    else:
        # SQLite no soporta IF NOT EXISTS en ALTER COLUMN, así que comprobamos con PRAGMA
        conn = get_db()
        cur = conn.cursor()

        def column_exists(table, column):
            cur.execute(f"PRAGMA table_info({table})")
            cols = {row[1] for row in cur.fetchall()}
            return column in cols

        try:
            for tabla in tablas_owner:
                if not column_exists(tabla, "creador_id"):
                    try:
                        cur.execute(f"ALTER TABLE {tabla} ADD COLUMN creador_id INTEGER")
                    except Exception:
                        pass
                try:
                    cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{tabla}_creador ON {tabla}(creador_id)")
                except Exception:
                    pass

            if not column_exists("usuarios", "force_password_change"):
                try:
                    cur.execute("ALTER TABLE usuarios ADD COLUMN force_password_change INTEGER DEFAULT 0")
                except Exception:
                    pass

            if not column_exists("feedbacks", "url_datos"):
                try:
                    cur.execute("ALTER TABLE feedbacks ADD COLUMN url_datos TEXT")
                except Exception:
                    pass

            conn.commit()
        finally:
            cur.close()
            conn.close()

def ensure_owner_columns():
    """
    Asegura columnas creador_id en tablas clave para limitar visibilidad por entrenador.
    """
    tablas = ("entrenamientos", "microciclos", "mesociclos", "macrociclos")
    if DB_ENGINE == "mariadb":
        conn = get_db()
        cur = conn.cursor()
        for tabla in tablas:
            try:
                cur.execute(f"ALTER TABLE {tabla} ADD COLUMN IF NOT EXISTS creador_id INT NULL")
                cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{tabla}_creador ON {tabla}(creador_id)")
            except Exception:
                pass
        conn.commit()
        cur.close()
        conn.close()
    else:
        conn = get_db()
        cur = conn.cursor()
        for tabla in tablas:
            try:
                cur.execute(f"PRAGMA table_info({tabla})")
                cols = [row[1] for row in cur.fetchall()]
                if "creador_id" not in cols:
                    cur.execute(f"ALTER TABLE {tabla} ADD COLUMN creador_id INTEGER")
            except Exception:
                pass
        conn.commit()
        cur.close()
        conn.close()


class MariaDBConnectionWrapper:
    """
    Envuelve la conexión de MariaDB para ofrecer cursores en modo diccionario
    y tolerar asignaciones a row_factory que hace el código legado.
    """
    def __init__(self, conn):
        object.__setattr__(self, "_conn", conn)
        object.__setattr__(self, "_row_factory", None)

    def cursor(self):
        return self._conn.cursor(dictionary=True)

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def __setattr__(self, name, value):
        if name in ("_conn", "_row_factory"):
            object.__setattr__(self, name, value)
        elif name == "row_factory":
            object.__setattr__(self, "_row_factory", value)
        else:
            setattr(self._conn, name, value)


def get_db():
    """
    Devuelve una conexión según el motor configurado (MariaDB por defecto).
    """
    if DB_ENGINE == "mariadb":
        if not mariadb:
            raise RuntimeError("DB_ENGINE=mariadb pero el paquete mariadb no está instalado")
        conn = mariadb.connect(**MARIADB_CONFIG)
        conn.autocommit = False
        return MariaDBConnectionWrapper(conn)

    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def query_db(query, args=(), one=False):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(query, args)
    rv = cur.fetchall()
    cur.close()
    conn.close()
    return (rv[0] if rv else None) if one else rv


def execute_db(query, args=()):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(query, args)
    conn.commit()
    last_id = cur.lastrowid
    cur.close()
    conn.close()
    return last_id


def upsert_km_realizados(cur, entrenamiento_asignado_id, km_planificados, km_realizados, fecha):
    """
    Inserta/actualiza la tabla de km realizados respetando el motor de BD.
    """
    if DB_ENGINE == "mariadb":
        cur.execute(
            """
            INSERT INTO km_realizados_entrenamientos (
                entrenamiento_asignado_id, km_planificados, km_realizados, fecha
            ) VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                km_planificados = VALUES(km_planificados),
                km_realizados = VALUES(km_realizados),
                fecha = VALUES(fecha)
            """,
            (entrenamiento_asignado_id, km_planificados, km_realizados, fecha),
        )
    else:
        cur.execute(
            """
            INSERT INTO km_realizados_entrenamientos (
                entrenamiento_asignado_id, km_planificados, km_realizados, fecha
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(entrenamiento_asignado_id)
            DO UPDATE SET km_planificados = excluded.km_planificados,
                          km_realizados = excluded.km_realizados,
                          fecha = excluded.fecha
            """,
            (entrenamiento_asignado_id, km_planificados, km_realizados, fecha),
        )


def init_db():
    schema_file = "schema_mariadb.sql" if DB_ENGINE == "mariadb" else "schema.sql"
    schema_path = os.path.join(BASE_DIR, schema_file)

    if not os.path.exists(schema_path):
        raise FileNotFoundError(f"No se encontró el esquema {schema_path}")

    with app.app_context():
        conn = get_db()
        with open(schema_path, "r") as f:
            script = f.read()

        if DB_ENGINE == "sqlite":
            conn.executescript(script)
        else:
            cur = conn.cursor()
            statements = [s.strip() for s in script.split(";") if s.strip()]
            for stmt in statements:
                cur.execute(stmt)
            cur.close()
        conn.commit()
        conn.close()


@app.cli.command('initdb')
def initdb_command():
    """Initializes the database."""
    init_db()
    print('Initialized the database.')

# Aseguramos columnas auxiliares en tablas clave
ensure_meta_columns()

# Función para verificar el rol del usuario (decorator)
def requires_roles(*roles):
    def wrapper(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if "user_id" not in session:
                print("requires_roles: sin user_id en sesión")
                return jsonify({'error': 'Autenticación requerida'}), 401

            user = query_db(
                'SELECT id, rol, email FROM usuarios WHERE id = ?',
                (session["user_id"],), one=True
            )

            if not user:
                print("requires_roles: usuario no encontrado en BD")
                return jsonify({'error': 'Usuario no encontrado'}), 403

            if user['rol'] not in roles:
                print(f"requires_roles: rol {user['rol']} no permitido para esta ruta")
                return jsonify({'error': 'Acceso no autorizado'}), 403

            print(f"requires_roles: OK user_id={user['id']} rol={user['rol']} en {request.path}")
            return f(user, *args, **kwargs)

        return decorated_function
    return wrapper


@app.route('/csrf-token', methods=['GET'])
def get_csrf_token():
    if 'csrf_token' not in session:
        session['csrf_token'] = secrets.token_urlsafe(32)
    return jsonify({'csrf_token': session['csrf_token']})


@app.before_request
def csrf_protect():
    # Sólo proteger métodos que modifican datos
    if request.method in ('POST', 'PUT', 'DELETE'):
        # Endpoints EXENTOS (nombres de las funciones Python)
        if request.endpoint in ('login_user', 'register_user'):
            return

        token_session = session.get('csrf_token')
        token_header = request.headers.get('X-CSRF-Token')

        if not token_session or not token_header or token_session != token_header:
            print(f"CSRF bloqueado en {request.path}: sesión={token_session}, header={token_header}")
            return jsonify({'error': 'CSRF token inválido'}), 403

# --- Rutas para Usuarios (Registro e Inicio de Sesión) ---
@app.route('/register', methods=['POST'])
def register_user():
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No se recibieron datos'}), 400

    nombre = data.get('nombre', '').strip()
    apellidos = data.get('apellidos', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password')
    rol = data.get('rol')

    fecha_nacimiento = data.get('fecha_nacimiento')
    telefono = data.get('telefono')
    entrenador_id = data.get('entrenador_id')  # desde select
    categoria = data.get('categoria')

    # Validación básica
    if not nombre or not apellidos or not email or not password or not rol:
        return jsonify({'error': 'Todos los campos son obligatorios'}), 400

    if rol not in ('admin', 'entrenador', 'atleta'):
        return jsonify({'error': 'Rol inválido'}), 400

    # Reglas específicas para atletas
    if rol == 'atleta':
        if not entrenador_id or entrenador_id == "":
            return jsonify({'error': 'Debes seleccionar un entrenador'}), 400
        if not categoria or categoria == "":
            return jsonify({'error': 'Debes seleccionar una categoría'}), 400

        # Convertir a int si viene como string
        try:
            entrenador_id = int(entrenador_id)
        except ValueError:
            return jsonify({'error': 'Entrenador seleccionado no es válido'}), 400
    else:
        # Otros roles no deben llevar estos campos
        fecha_nacimiento = None
        telefono = None
        entrenador_id = None
        categoria = None

    # Comprobar si el email ya existe
    existing_user = query_db(
        'SELECT id FROM usuarios WHERE email = ?',
        (email,),
        one=True
    )
    if existing_user:
        return jsonify({'error': 'El correo electrónico ya está registrado'}), 409

    password_hash = generate_password_hash(password)

    # Lógica de aprobado: ahora todos se marcan como aprobados al crearse.
    aprobado = 1

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            '''
            INSERT INTO usuarios (
                nombre, apellidos, email, password_hash, rol,
                fecha_nacimiento, telefono, entrenador_id, categoria,
                aprobado
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                nombre,
                apellidos,
                email,
                password_hash,
                rol,
                fecha_nacimiento if rol == 'atleta' else None,
                telefono if rol == 'atleta' else None,
                entrenador_id if rol == 'atleta' else None,
                categoria if rol == 'atleta' else None,
                aprobado
            )
        )

        conn.commit()

        mensaje = 'Usuario registrado correctamente'
        if rol == 'atleta':
            mensaje = ('Registro completado. Tu cuenta de atleta queda pendiente de '
                       'aprobación por tu entrenador.')

        return jsonify({'message': mensaje}), 201

    except DB_INTEGRITY_ERRORS as e:
        print("Error de integridad al registrar:", e)
        return jsonify({'error': 'Error al registrar el usuario (integridad de datos)'}), 500

    except Exception as e:
        print("Error general al registrar:", e)
        return jsonify({'error': 'Error interno del servidor al registrar el usuario'}), 500

@app.route('/login', methods=['POST'])
def login_user():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    print(f'Solicitud a /login: {data}')
    print(f'Email: {email}')
    print(f'Password: {password}')

    if not email or not password:
        print('Email o password faltantes')
        return jsonify({'error': 'Correo electrónico y contraseña son obligatorios'}), 400

    user = query_db('SELECT id, rol, email, password_hash, force_password_change FROM usuarios WHERE email = ?', (email,), one=True)
    print(f'Usuario recuperado: {user}')

    if user and check_password_hash(user['password_hash'], password):
        print(f'Inicio de sesión exitoso. Rol: {user["rol"]}')
        session["user_id"] = user["id"]
        session["user_rol"] = user["rol"]
        session["user_email"] = user["email"]

        try:
            force_change = user["force_password_change"]
        except Exception:
            force_change = None

        response = {
            'message': 'Inicio de sesión exitoso',
            'rol': user['rol'],
            'user_id': user['id'],
            'force_password_change': force_change
        }

        if user['rol'] == 'atleta':
            # Ya no hay tabla atletas, así que usamos el mismo id
            response['atleta_id'] = user['id']

        return jsonify(response), 200

    print("Credenciales inválidas")
    return jsonify({'error': 'Credenciales inválidas'}), 401

# --- Rutas para Usuarios (Gestión - Solo para Admin) ---

@app.route('/usuarios', methods=['GET'])
@requires_roles('admin')
def get_all_users(current_user):  # Recibimos el usuario actual
    users = query_db('SELECT id, nombre, apellidos, email, rol FROM usuarios')  # No devolvemos password_hash
    return jsonify([dict(user) for user in users])


@app.route('/usuarios/<int:id>', methods=['GET'])
@requires_roles('admin')
def get_user(current_user, id):
    user = query_db('SELECT id, nombre, apellidos, email, rol FROM usuarios WHERE id = ?', (id,), one=True)
    if not user:
        return jsonify({'error': 'Usuario no encontrado'}), 404
    return jsonify(dict(user))


@app.route('/usuarios', methods=['POST'])
@requires_roles('admin')
def create_user(current_user):
    data = request.get_json()
    nombre = data.get('nombre')
    apellidos = data.get('apellidos')
    email = data.get('email')
    password = data.get('password')
    rol = data.get('rol')

    if not nombre or not apellidos or not email or not password or not rol:
        return jsonify({'error': 'Todos los campos son obligatorios'}), 400

    if rol not in ('admin', 'entrenador', 'atleta'):
        return jsonify({'error': 'Rol inválido'}), 400

    existing_user = query_db('SELECT * FROM usuarios WHERE email = ?', (email,), one=True)
    if existing_user:
        return jsonify({'error': 'El correo electrónico ya está registrado'}), 409

    password_hash = generate_password_hash(password)

    try:
        execute_db(
            'INSERT INTO usuarios (nombre, apellidos, email, password_hash, rol, force_password_change) VALUES (?, ?, ?, ?, ?, 0)',
            (nombre, apellidos, email, password_hash, rol)
        )
        return jsonify({'message': 'Usuario creado exitosamente'}), 201
    except DB_INTEGRITY_ERRORS:
        return jsonify({'error': 'Error al crear el usuario'}), 500

@app.route('/atletas/<int:id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def update_atleta(current_user, id):
    data = request.get_json()

    nombre = data.get('nombre')
    apellidos = data.get('apellidos')
    email = data.get('email')
    telefono = data.get('telefono')
    fecha_nacimiento = data.get('fecha_nacimiento')
    categoria = data.get('categoria')
    grupo = data.get('grupo')
    subgrupo = data.get('subgrupo')

    if not nombre or not apellidos or not email:
        return jsonify({'error': 'Nombre, apellidos y email son obligatorios'}), 400

    # Verificar que el atleta existe y es atleta
    atleta = query_db(
        'SELECT * FROM usuarios WHERE id = ? AND rol = "atleta"',
        (id,),
        one=True
    )
    if not atleta:
        return jsonify({'error': 'Atleta no encontrado'}), 404

    # Si es entrenador, sólo puede tocar a sus atletas
    if current_user['rol'] == 'entrenador' and atleta['entrenador_id'] != current_user['id']:
        return jsonify({'error': 'No tienes permiso para editar este atleta'}), 403

    try:
        execute_db(
            '''
            UPDATE usuarios
            SET nombre = ?, apellidos = ?, email = ?, telefono = ?, 
                fecha_nacimiento = ?, categoria = ?, grupo = ?, subgrupo = ?
            WHERE id = ?
            ''',
            (
                nombre,
                apellidos,
                email,
                telefono,
                fecha_nacimiento,
                categoria,
                grupo,
                subgrupo,
                id
            )
        )
        return jsonify({'message': 'Atleta actualizado correctamente'}), 200
    except Exception as e:
        print("Error al actualizar atleta:", e)
        return jsonify({'error': 'Error al actualizar atleta'}), 500

from werkzeug.security import generate_password_hash

@app.route('/entrenadores/atletas', methods=['POST'])
@requires_roles('entrenador', 'admin')
def crear_atleta_desde_entrenador(current_user):
    """
    Alta de atleta desde el panel del entrenador.
    Crea un usuario con rol 'atleta' y contraseña temporal.
    """
    data = request.get_json() or {}

    nombre = (data.get('nombre') or '').strip()
    apellidos = (data.get('apellidos') or '').strip()
    email = (data.get('email') or '').strip().lower()
    telefono = (data.get('telefono') or '').strip()
    fecha_nacimiento = (data.get('fecha_nacimiento') or '').strip() or None
    categoria = (data.get('categoria') or '').strip() or None
    grupo = (data.get('grupo') or '').strip() or None
    subgrupo = (data.get('subgrupo') or '').strip() or None

    # Contraseña temporal fija
    password = "cambiame"

    # --- Validaciones básicas ---
    if not nombre or not apellidos or not email:
        return jsonify({'error': 'Nombre, apellidos y email son obligatorios'}), 400

    # ¿Ya existe ese email?
    existente = query_db(
        'SELECT id FROM usuarios WHERE email = ?',
        (email,),
        one=True
    )
    if existente:
        return jsonify({'error': 'Ya existe un usuario con ese email'}), 400

    # Hash de contraseña
    password_hash = generate_password_hash(password)

    try:
        # Por si tu tabla tiene más campos, ajusta la lista de columnas
        nuevo_id = execute_db(
            '''
            INSERT INTO usuarios (
                nombre, apellidos, email, password_hash,
                telefono, fecha_nacimiento,
                categoria, grupo, subgrupo,
                rol, entrenador_id, aprobado, force_password_change
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "atleta", ?, 1, 1)
            ''',
            (
                nombre,
                apellidos,
                email,
                password_hash,
                telefono,
                fecha_nacimiento,
                categoria,
                grupo,
                subgrupo,
                current_user['id']   # el entrenador que lo crea
            )
        )

        return jsonify({
            'message': 'Atleta creado correctamente',
            'atleta_id': nuevo_id
        }), 201

    except Exception as e:
        print("Error al crear atleta desde entrenador:", e)
        return jsonify({'error': 'Error al crear el atleta'}), 500

@app.route('/atletas/<int:id>', methods=['DELETE'])
@requires_roles('admin', 'entrenador')
def delete_atleta(current_user, id):
    # Verificar que el atleta existe y es atleta
    atleta = query_db(
        'SELECT * FROM usuarios WHERE id = ? AND rol = "atleta"',
        (id,),
        one=True
    )
    if not atleta:
        return jsonify({'error': 'Atleta no encontrado'}), 404

    # Si es entrenador, sólo puede borrar a sus atletas
    if current_user['rol'] == 'entrenador' and atleta['entrenador_id'] != current_user['id']:
        return jsonify({'error': 'No tienes permiso para eliminar este atleta'}), 403

    try:
        # Opcional: borrar también entrenamientos_asignados, feedbacks, etc. para ese atleta
        execute_db('DELETE FROM entrenamientos_asignados WHERE atleta_id = ?', (id,))
        execute_db('DELETE FROM feedbacks WHERE atleta_id = ?', (id,))

        execute_db('DELETE FROM usuarios WHERE id = ?', (id,))
        return jsonify({'message': 'Atleta eliminado correctamente'}), 200
    except Exception as e:
        print("Error al eliminar atleta:", e)
        return jsonify({'error': 'Error al eliminar atleta'}), 500

@app.route('/usuarios/<int:id>', methods=['PUT'])
@requires_roles('admin')
def update_user(current_user, id):
    data = request.get_json()
    nombre = data.get('nombre')
    apellidos = data.get('apellidos')
    email = data.get('email')
    rol = data.get('rol')
    password = data.get('password')

    if not nombre or not apellidos or not email or not rol:
        return jsonify({'error': 'Todos los campos son obligatorios'}), 400

    if rol not in ('admin', 'entrenador', 'atleta'):
        return jsonify({'error': 'Rol inválido'}), 400

    if password:
        password_hash = generate_password_hash(password)
        # Al cambiar contraseña desde admin forzamos que el usuario la renueve
        execute_db(
            '''
            UPDATE usuarios
            SET nombre = ?, apellidos = ?, email = ?, rol = ?, password_hash = ?, force_password_change = 1
            WHERE id = ?
            ''',
            (nombre, apellidos, email, rol, password_hash, id)
        )
    else:
        execute_db(
            'UPDATE usuarios SET nombre = ?, apellidos = ?, email = ?, rol = ? WHERE id = ?',
            (nombre, apellidos, email, rol, id)
        )
    return jsonify({'message': 'Usuario actualizado exitosamente'}), 200


@app.route('/usuarios/<int:id>', methods=['DELETE'])
@requires_roles('admin')
def delete_user(current_user, id):
    execute_db('DELETE FROM usuarios WHERE id = ?', (id,))
    return jsonify({'message': 'Usuario eliminado exitosamente'}), 200


@app.route('/usuarios/password', methods=['POST'])
@requires_roles('admin', 'entrenador', 'atleta')
def cambiar_password(current_user):
    data = request.get_json(silent=True) or {}
    password_actual = data.get('password_actual') or data.get('current_password')
    password_nueva = data.get('password_nueva') or data.get('new_password')

    if not password_nueva:
        return jsonify({'error': 'Falta la nueva contraseña'}), 400

    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute("SELECT password_hash, force_password_change FROM usuarios WHERE id = ?", (current_user['id'],))
        row = cur.fetchone()
        if not row:
            return jsonify({'error': 'Usuario no encontrado'}), 404

        stored_hash = row["password_hash"] if isinstance(row, dict) else row[0]
        force_flag = row["force_password_change"] if isinstance(row, dict) else row[1]

        # Si hay contraseña actual, validamos. Si no hay y hay flag de cambio forzado, permitimos.
        if password_actual:
            if not check_password_hash(stored_hash, password_actual):
                return jsonify({'error': 'Contraseña actual incorrecta'}), 400
        else:
            if not force_flag:
                return jsonify({'error': 'Debes indicar tu contraseña actual'}), 400

        new_hash = generate_password_hash(password_nueva)
        cur.execute(
            "UPDATE usuarios SET password_hash = ?, force_password_change = 0 WHERE id = ?",
            (new_hash, current_user['id'])
        )
        conn.commit()
        return jsonify({'message': 'Contraseña actualizada'}), 200
    except Exception as e:
        print("Error al cambiar contraseña:", e)
        conn.rollback()
        return jsonify({'error': 'No se pudo actualizar la contraseña'}), 500
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass


# --- Rutas para Atletas ---

@app.route('/atletas', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def get_atletas(current_user):
    if session.get("user_rol") == 'admin':
        atletas = query_db('SELECT * FROM usuarios WHERE rol = "atleta"')
    elif session.get("user_rol") == 'entrenador':
        # Obtener los IDs de los atletas que entrena el entrenador actual
        atletas_ids = [row['id'] for row in
                       query_db('SELECT id FROM usuarios WHERE rol = "atleta" AND entrenador_id = ?', (session.get("user_id"),))]
        if atletas_ids:
            atletas = query_db('SELECT * FROM usuarios WHERE id IN ({})'.format(','.join('?' * len(atletas_ids))),
                            atletas_ids)
        else:
            atletas = []  # No hay atletas, no hay entrenamientos
    else:  # 'atleta'
        atletas = query_db('SELECT * FROM usuarios WHERE id = ?', (session.get("user_id"),))
    return jsonify([dict(atleta) for atleta in atletas])


@app.route('/atletas/<int:id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def get_atleta(current_user, id):
    if session.get("user_rol") == 'admin' or session.get("user_rol") == 'entrenador':
        atleta = query_db('SELECT * FROM usuarios WHERE id = ?', (id,), one=True)
    else:  # 'atleta'
        if session.get("user_id") != id:
            return jsonify({'error': 'Acceso no autorizado'}), 403
        atleta = query_db('SELECT * FROM usuarios WHERE id = ?', (id,), one=True)
    if atleta is None:
        return jsonify({'error': 'Atleta no encontrado'}), 404
    return jsonify(dict(atleta))

@app.route('/perfil_atleta/<int:atleta_id>', methods=['GET'])
@requires_roles('atleta', 'entrenador')
def obtener_perfil_atleta(current_user, atleta_id):
    try:
        query = '''
            SELECT u.nombre, u.apellidos, u.email, u.foto_url, u.telefono,
            u.fecha_nacimiento, u.categoria,u.grupo, u.subgrupo
            FROM usuarios u
            WHERE u.id = ?
        '''
        resultado = query_db(query, (atleta_id,), one=True)
        if resultado:
            return jsonify(dict(resultado)), 200
        else:
            return jsonify({'error': 'Atleta no encontrado'}), 404
    except Exception as e:
        print("Error al obtener perfil del atleta:", e)
        return jsonify({'error': 'No se pudo obtener el perfil'}), 500

@app.route('/actualizar_perfil', methods=['POST'])
@requires_roles('atleta')
def actualizar_perfil(current_user):
    try:
        usuario_id = current_user['id']
        nombre = request.form.get('nombre')
        apellidos = request.form.get('apellidos')
        email = (request.form.get('email') or '').strip()
        telefono = (request.form.get('telefono') or '').strip() or None
        fecha_nacimiento = (request.form.get('fecha_nacimiento') or '').strip() or None
        foto = request.files.get('foto')
        foto_url = None

        if not nombre or not apellidos or not email:
            return jsonify({"error": "Nombre, apellidos y email son obligatorios"}), 400

        # Comprobar email único
        existente = query_db(
            "SELECT id FROM usuarios WHERE email = ? AND id != ?",
            (email, usuario_id),
            one=True
        )
        if existente:
            return jsonify({"error": "Ese correo ya está en uso"}), 409

        if foto:
            # Carpeta de destino
            print("Nombre del archivo recibido:", foto.filename)
            carpeta_destino = os.path.join('..', 'frontend','static', 'img', 'perfiles')
            os.makedirs(carpeta_destino, exist_ok=True)

            # Guardar imagen con nombre único
            extension = os.path.splitext(foto.filename)[1]
            nombre_archivo = f"perfil_{usuario_id}{extension}"
            ruta_archivo = os.path.join(carpeta_destino, secure_filename(nombre_archivo))
            foto.save(ruta_archivo)
            print(f"Imagen guardada en: {ruta_archivo}")


            foto_url = f"/static/img/perfiles/{nombre_archivo}"

            # Actualizar con imagen
            execute_db(
                """
                UPDATE usuarios
                SET nombre = ?, apellidos = ?, email = ?, telefono = ?, fecha_nacimiento = ?, foto_url = ?
                WHERE id = ?
                """,
                (nombre, apellidos, email, telefono, fecha_nacimiento, foto_url, usuario_id)
            )
        else:
            # Actualizar sin imagen
            execute_db(
                """
                UPDATE usuarios
                SET nombre = ?, apellidos = ?, email = ?, telefono = ?, fecha_nacimiento = ?
                WHERE id = ?
                """,
                (nombre, apellidos, email, telefono, fecha_nacimiento, usuario_id)
            )

        return jsonify({
            "message": "Perfil actualizado correctamente",
            "foto_url": foto_url
        }), 200

    except Exception as e:
        print("Error al actualizar perfil:", e)
        return jsonify({"error": "No se pudo actualizar el perfil"}), 500

# --- Rutas para Entrenamientos ---
@app.route('/entrenamientos', methods=['POST'])
@requires_roles('admin', 'entrenador')
def crear_entrenamiento(current_user):
    data = request.get_json(silent=True) or {}

    nombre = (data.get('nombre') or '').strip()
    objetivo = (data.get('objetivo') or '').strip() or None
    notas = (data.get('notas') or '').strip() or None
    km_totales = data.get('km_totales')
    pasos = data.get('pasos') or []

    if not nombre:
        return jsonify({'error': 'El nombre del entrenamiento es obligatorio'}), 400
    if not isinstance(pasos, list) or not pasos:
        return jsonify({'error': 'Debe incluir al menos un bloque (paso) en el entrenamiento'}), 400
    calculado_km_totales = calcular_km_totales_desde_pasos(pasos)
    if km_totales is None:
        km_totales = calculado_km_totales
    else:
        try:
            km_totales = float(km_totales)
        except (TypeError, ValueError):
            km_totales = calculado_km_totales
    if km_totales < 0:
        km_totales = 0
    conn = get_db()
    cur = conn.cursor()

    try:
        # ====== 1) Generar bloque_principal (resumen) ======
        def describe_step_py(step):
            partes = []
            tipo = (step.get('tipo_paso') or '').lower()

            if tipo == 'warmup':
                partes.append('Calentamiento')
            elif tipo == 'interval':
                partes.append('Intervalos')
            elif tipo == 'rest':
                partes.append('Recuperación')
            elif tipo == 'cooldown':
                partes.append('Enfriamiento')
            elif tipo == 'repeat':
                reps = step.get('repeticiones') or 1
                partes.append(f'{reps}× bloque')
            else:
                partes.append('Bloque')

            val = (str(step.get('objetivo_valor') or '')).strip()
            unidad = (step.get('unidad') or '').strip()
            if val:
                partes.append(f'{val}{unidad}')

            zona = (step.get('zona') or '').strip()
            if zona:
                partes.append(zona if zona.upper().startswith('Z') else f'Z{zona}')

            return ' '.join(partes).strip()

        resumen_partes = []

        def flatten_steps(steps):
            for s in steps:
                desc = describe_step_py(s)
                if desc:
                    resumen_partes.append(desc)
                sub = s.get('subpasos') or []
                if sub:
                    flatten_steps(sub)

        flatten_steps(pasos)
        bloque_principal = ' · '.join(resumen_partes) or None

        # ====== 2) Insertar en entrenamientos ======
        cur.execute(
            """
            INSERT INTO entrenamientos (nombre, objetivo, notas, bloque_principal, km_totales, creador_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (nombre, objetivo, notas, bloque_principal, km_totales, current_user["id"])
        )
        entrenamiento_id = cur.lastrowid

        # ====== 3) Insertar pasos en entrenamientos_detalle ======
        now = datetime.now().isoformat(' ')
        orden_counter = 1

        def insert_step(step, parent_id=None):
            nonlocal orden_counter

            tipo_paso = step.get('tipo_paso') or 'custom'
            repeticiones = step.get('repeticiones')
            objetivo_tipo = step.get('objetivo_tipo')
            objetivo_valor = step.get('objetivo_valor')
            unidad = step.get('unidad')
            zona = step.get('zona')
            recuperacion_valor = step.get('recuperacion_valor')
            recuperacion_unidad = step.get('recuperacion_unidad')
            intensidad = step.get('intensidad')
            descripcion = step.get('descripcion')

            cur.execute(
                """
                INSERT INTO entrenamientos_detalle
                    (entrenamiento_id, tipo_paso, repeticiones,
                     objetivo_tipo, objetivo_valor, unidad, zona,
                     recuperacion_valor, recuperacion_unidad,
                     intensidad, descripcion, parent_id, orden)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entrenamiento_id,
                    tipo_paso,
                    repeticiones,
                    objetivo_tipo,
                    objetivo_valor,
                    unidad,
                    zona,
                    recuperacion_valor,
                    recuperacion_unidad,
                    intensidad,
                    descripcion,
                    parent_id,
                    orden_counter
                )
            )

            this_id = cur.lastrowid
            orden_counter += 1

            for sub in step.get('subpasos') or []:
                insert_step(sub, this_id)

        # Insertar todos los pasos raíz
        for step in pasos:
            insert_step(step, None)

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            'message': 'Entrenamiento creado exitosamente',
            'id': entrenamiento_id
        }), 201

    except Exception as e:
        print("Error en crear_entrenamiento:", e)
        return jsonify({'error': 'Error al crear el entrenamiento'}), 500
def calcular_km_totales_desde_pasos(pasos):
    """
    Calcula km totales de un entrenamiento a partir de la estructura de pasos
    usada en el frontend (warmup, interval, repeat, etc.).

    Convención:
    - objetivo_tipo = 'distancia'
    - unidad = 'm' o 'km'
    - repeat con subpasos multiplica por repeticiones.
    """

    total_metros = 0.0

    def rec(step, factor_reps=1):
        nonlocal total_metros

        tipo = (step.get('tipo_paso') or '').lower()
        reps = step.get('repeticiones') or 1
        objetivo_tipo = (step.get('objetivo_tipo') or '').lower()
        unidad = (step.get('unidad') or '').lower()
        valor = step.get('objetivo_valor') or 0

        # Distancias directas (ej: 1000 m, 8 km…)
        if objetivo_tipo in ('distancia', 'distance') and valor:
            if unidad in ('m', 'metro', 'metros'):
                total_metros += float(valor) * factor_reps
            elif unidad in ('km', 'kilometro', 'kilómetros', 'kilometros'):
                total_metros += float(valor) * 1000 * factor_reps

        # Subpasos (ej: repeat con 3× (1000 m + 200 m))
        subpasos = step.get('subpasos') or []
        if subpasos:
            # Si es un repeat, multiplicamos el factor por nº de reps
            nuevo_factor = factor_reps * (reps if tipo == 'repeat' else 1)
            for s in subpasos:
                rec(s, nuevo_factor)

    for s in pasos or []:
        rec(s, 1)

    # Redondeamos a 2 decimales de km
    return round(total_metros / 1000.0, 2)


@app.route('/entrenamientos', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamientos(current_user):
    if current_user["rol"] == "entrenador":
        entrenamientos = query_db(
            "SELECT * FROM entrenamientos WHERE creador_id = ? OR creador_id IS NULL",
            (current_user["id"],),
        )
    else:
        entrenamientos = query_db('SELECT * FROM entrenamientos')
    return jsonify([dict(entrenamiento) for entrenamiento in entrenamientos])

def get_entrenamiento_con_pasos(entrenamiento_id: int, current_user=None):
    conn = get_db()
    cur = conn.cursor()

    # 1) Datos básicos del entrenamiento
    cur.execute("""
        SELECT id, nombre, objetivo, notas, bloque_principal, km_totales, creador_id
        FROM entrenamientos
        WHERE id = ?
    """, (entrenamiento_id,))
    row = cur.fetchone()

    if not row:
        cur.close()
        conn.close()
        return None
    if current_user and current_user.get("rol") == "entrenador":
        creador = row.get("creador_id") if isinstance(row, dict) else row[6]
        if creador not in (None, current_user.get("id")):
            cur.close()
            conn.close()
            return None

    entrenamiento = {
        "id": row["id"],
        "nombre": row["nombre"],
        "objetivo": row["objetivo"],
        "notas": row["notas"],
        "bloque_principal": row["bloque_principal"],
        "km_totales": row["km_totales"],
    }

    # 2) Detalles (pasos) del entrenamiento
    # AJUSTA los nombres de columna a tu tabla entrenamiento_detalle
    cur.execute("""
        SELECT
            id,
            tipo_paso,
            repeticiones,
            objetivo_tipo,
            objetivo_valor,
            unidad,
            zona,
            recuperacion_valor,
            recuperacion_unidad,
            intensidad,
            descripcion,
            parent_id,      -- si no tienes jerarquía, elimina este campo
            orden
        FROM entrenamientos_detalle
        WHERE entrenamiento_id = ?
        ORDER BY orden, id
    """, (entrenamiento_id,))
    detalles = cur.fetchall()

    # 3) Construimos los pasos en el formato que espera el frontend
    pasos_por_id = {}
    pasos_root = []

    for d in detalles:
        paso = {
            "id_detalle": d["id"],
            "tipo_paso": d["tipo_paso"] or "custom",
            "repeticiones": d["repeticiones"],
            "objetivo_tipo": d["objetivo_tipo"],
            "objetivo_valor": d["objetivo_valor"],
            "unidad": d["unidad"],
            "zona": d["zona"],
            "recuperacion_valor": d["recuperacion_valor"],
            "recuperacion_unidad": d["recuperacion_unidad"],
            "intensidad": d["intensidad"],
            "descripcion": d["descripcion"],
            "subpasos": []
        }
        pasos_por_id[d["id"]] = paso

    # Si tienes jerarquía (repeat con subpasos) usando parent_id:
    try:
        for d in detalles:
            parent_id = d["parent_id"]
            paso = pasos_por_id[d["id"]]
            if parent_id:
                parent = pasos_por_id.get(parent_id)
                if parent:
                    parent["subpasos"].append(paso)
            else:
                pasos_root.append(paso)
    except KeyError:
        # Si tu tabla NO tiene parent_id, todos los pasos son root
        pasos_root = list(pasos_por_id.values())

    entrenamiento["pasos"] = pasos_root

    cur.close()
    conn.close()
    return entrenamiento

@app.route('/entrenamientos/<int:id>', methods=['GET'])
@requires_roles('admin', 'entrenador')
def obtener_entrenamiento(current_user, id):
    try:
        entrenamiento = get_entrenamiento_con_pasos(id, current_user)
        if not entrenamiento:
            return jsonify({"error": "Entrenamiento no encontrado"}), 404
        return jsonify(entrenamiento), 200
    except Exception as e:
        print("Error al obtener entrenamiento:", e)
        return jsonify({"error": "Error al obtener el entrenamiento"}), 500

@app.route('/entrenamientos/<int:entrenamiento_id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def actualizar_entrenamiento(current_user, entrenamiento_id):
    data = request.get_json(silent=True) or {}

    nombre = (data.get('nombre') or '').strip()
    objetivo = (data.get('objetivo') or '').strip() or None
    notas = (data.get('notas') or '').strip() or None
    km_totales = data.get('km_totales')
    pasos = data.get('pasos') or []

    if not nombre:
        return jsonify({'error': 'El nombre del entrenamiento es obligatorio'}), 400
    if not isinstance(pasos, list) or not pasos:
        return jsonify({'error': 'Debe haber al menos un bloque (paso) en el entrenamiento'}), 400

    try:
        conn = get_db()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # 1) Comprobar que existe el entrenamiento
        cur.execute("SELECT id FROM entrenamientos WHERE id = ?", (entrenamiento_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Entrenamiento no encontrado'}), 404

        # 2) Generar un pequeño resumen para bloque_principal (opcional)
        def describe_step_py(step):
            partes = []
            tipo = (step.get('tipo_paso') or '').lower()

            if tipo == 'warmup':
                partes.append('Calentamiento')
            elif tipo == 'interval':
                partes.append('Intervalos')
            elif tipo == 'rest':
                partes.append('Recuperación')
            elif tipo == 'cooldown':
                partes.append('Enfriamiento')
            elif tipo == 'repeat':
                reps = step.get('repeticiones') or 1
                partes.append(f'{reps}× bloque')
            else:
                partes.append('Bloque')

            val = (str(step.get('objetivo_valor') or '')).strip()
            unidad = (step.get('unidad') or '').strip()
            if val:
                partes.append(f'{val}{unidad}')

            zona = (step.get('zona') or '').strip()
            if zona:
                partes.append(zona if zona.upper().startswith('Z') else f'Z{zona}')

            return ' '.join(partes).strip()

        resumen_partes = []

        def flatten_steps(steps):
            for s in steps:
                desc = describe_step_py(s)
                if desc:
                    resumen_partes.append(desc)
                sub = s.get('subpasos') or []
                if sub:
                    flatten_steps(sub)

        flatten_steps(pasos)
        bloque_principal = ' · '.join(resumen_partes) or None

        calculado_km_totales = calcular_km_totales_desde_pasos(pasos)
        if km_totales is None:
            km_totales_val = calculado_km_totales
        else:
            try:
                km_totales_val = float(km_totales)
            except (TypeError, ValueError):
                km_totales_val = calculado_km_totales
        if km_totales_val < 0:
            km_totales_val = 0

        # 3) Actualizar tabla principal de entrenamientos
        cur.execute(
            """
            UPDATE entrenamientos
            SET nombre = ?, objetivo = ?, notas = ?, bloque_principal = ?, km_totales = ?
            WHERE id = ?
            """,
            (nombre, objetivo, notas, bloque_principal, km_totales_val, entrenamiento_id)
        )

        # 4) Borrar detalles antiguos
        cur.execute(
            "DELETE FROM entrenamientos_detalle WHERE entrenamiento_id = ?",
            (entrenamiento_id,)
        )

        # 5) Insertar nuevos pasos en entrenamientos_detalle
        now = datetime.now().isoformat(' ')
        orden_counter = 1

        def insert_step(step, parent_id=None):
            nonlocal orden_counter

            tipo_paso = step.get('tipo_paso') or 'custom'
            repeticiones = step.get('repeticiones')
            objetivo_tipo = step.get('objetivo_tipo')
            objetivo_valor = step.get('objetivo_valor')
            unidad = step.get('unidad')
            zona = step.get('zona')
            recuperacion_valor = step.get('recuperacion_valor')
            recuperacion_unidad = step.get('recuperacion_unidad')
            intensidad = step.get('intensidad')
            descripcion = step.get('descripcion')

            cur.execute(
                """
                INSERT INTO entrenamientos_detalle
                    (entrenamiento_id, tipo_paso, repeticiones,
                     objetivo_tipo, objetivo_valor, unidad, zona,
                     recuperacion_valor, recuperacion_unidad,
                     intensidad, descripcion, parent_id, orden)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entrenamiento_id,
                    tipo_paso,
                    repeticiones,
                    objetivo_tipo,
                    objetivo_valor,
                    unidad,
                    zona,
                    recuperacion_valor,
                    recuperacion_unidad,
                    intensidad,
                    descripcion,
                    parent_id,
                    orden_counter
                )
            )
            this_id = cur.lastrowid
            orden_counter += 1

            # subpasos (para repeat)
            for sub in step.get('subpasos') or []:
                insert_step(sub, this_id)

        for step in pasos:
            insert_step(step, None)

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({'message': 'Entrenamiento actualizado'}), 200

    except Exception as e:
        print("Error en actualizar_entrenamiento:", e)
        return jsonify({'error': 'Error al actualizar el entrenamiento'}), 500


@app.route('/entrenamientos/<int:id>', methods=['DELETE'])
@requires_roles('admin', 'entrenador')  # Admin y Entrenador pueden eliminar
def eliminar_entrenamiento(current_user, id):
    execute_db('DELETE FROM entrenamientos WHERE id = ?', (id,))
    return jsonify({'message': 'Entrenamiento eliminado exitosamente'}), 200

# --- Rutas para Feedback (Ejemplo) ---

@app.route('/calendario/<int:atleta_id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def get_calendario(current_user, atleta_id):
    try:
        # Recuperamos todas las asignaciones del atleta
        entrenamientos_asignados = query_db(
            "SELECT id, nombre, fecha, visible FROM entrenamientos_asignados WHERE atleta_id = ?",
            (atleta_id,)
        )

        def fecha_to_iso(val):
            try:
                if hasattr(val, "isoformat"):
                    return val.isoformat()
            except Exception:
                pass
            return str(val) if val is not None else None

        eventos = []
        for e in entrenamientos_asignados:
            # visible puede ser None en algunos registros antiguos
            raw_visible = e["visible"]
            if raw_visible is None:
                visible = 1
            else:
                try:
                    visible = int(raw_visible)
                except:
                    visible = 1

            eventos.append({
                "id": e["id"],
                "title": e["nombre"],
                "start": fecha_to_iso(e["fecha"]),
                "visible": visible,
            })

        return jsonify(eventos), 200

    except Exception as ex:
        print("Error en GET /calendario:", ex)
        return jsonify({"error": "Error al cargar el calendario"}), 500

    print(f'Ruta /calendario/{atleta_id} solicitada')  # Depuración

    try:
        # Obtener los entrenamientos asignados desde la nueva tabla
        entrenamientos_asignados = query_db(
            'SELECT * FROM entrenamientos_asignados WHERE atleta_id = ?',
            (atleta_id,)
        )

        # Formatear los datos para FullCalendar
        events = []
        for entrenamiento in entrenamientos_asignados:
            visible = entrenamiento.get('visible')
            if visible is None:
                visible = 1  # Por defecto visible si no está definido

            events.append({
                'id': entrenamiento['id'],
                'title': entrenamiento['nombre'],
                'start': entrenamiento['fecha'],
                'visible': int(visible),
            })

        return jsonify(events), 200

    except Exception as e:
        print("Error en /calendario/<atleta_id>:", e)
        return jsonify({'error': 'Error al cargar el calendario'}), 500


# ============================================================
# Helper: clonar detalle de un entrenamiento base a uno asignado
# ============================================================

def clonar_detalle_entrenamiento(cur, plantilla_ent_id, asignado_id):
    """
    Copia los pasos de entrenamientos_detalle → entrenamientos_asignados_detalle,
    respetando jerarquía (parent_id / orden).
    """
    cur.execute(
        """
        SELECT *
        FROM entrenamientos_detalle
        WHERE entrenamiento_id = ?
        ORDER BY parent_id IS NOT NULL, parent_id, orden, id
        """,
        (plantilla_ent_id,),
    )
    detalles = cur.fetchall()

    id_map = {}  # plantilla_id → asignado_detalle_id

    for d in detalles:
        parent_old = d['parent_id']
        parent_new = id_map.get(parent_old) if parent_old else None

        cur.execute("""
            INSERT INTO entrenamientos_asignados_detalle (
                entrenamiento_asignado_id, parent_id, orden, tipo_paso,
                repeticiones, objetivo_tipo, objetivo_valor, unidad, zona,
                recuperacion_valor, recuperacion_unidad, intensidad, descripcion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            asignado_id,
            parent_new,
            d['orden'],
            d['tipo_paso'],
            d['repeticiones'],
            d['objetivo_tipo'],
            d['objetivo_valor'],
            d['unidad'],
            d['zona'],
            d['recuperacion_valor'],
            d['recuperacion_unidad'],
            d['intensidad'],
            d['descripcion'],
        ))

        nuevo_id = cur.lastrowid
        id_map[d['id']] = nuevo_id


def clonar_entrenamiento_para_atleta(
    *,
    fecha,
    entrenamiento_id,
    atleta_id,
    meta=None,
    visible=1,
):
    """
    Inserta un registro en entrenamientos_asignados copiando la cabecera y el
    detalle del entrenamiento base indicado.
    Devuelve el id del entrenamiento asignado creado.
    """
    if not fecha or not entrenamiento_id or not atleta_id:
        raise ValueError("Faltan datos para clonar el entrenamiento")

    meta = meta or {}
    ciclo_tipo = meta.get("ciclo_tipo")
    ciclo_id = meta.get("ciclo_id")
    macrociclo_id = meta.get("macrociclo_id")
    mesociclo_id = meta.get("mesociclo_id")
    microciclo_id = meta.get("microciclo_id")

    if isinstance(fecha, datetime):
        fecha_str = fecha.isoformat()
    else:
        fecha_str = str(fecha)

    conn = get_db()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT id, nombre, objetivo, notas, km_totales
            FROM entrenamientos
            WHERE id = ?
            """,
            (entrenamiento_id,),
        )
        entrenamiento = cur.fetchone()

        if entrenamiento is None:
            raise ValueError("Entrenamiento base no encontrado")

        now = datetime.now().isoformat(" ")
        cur.execute(
            """
            INSERT INTO entrenamientos_asignados (
                atleta_id, fecha, entrenamiento_id, visible,
                ciclo_tipo, ciclo_id, macrociclo_id, mesociclo_id, microciclo_id,
                nombre, objetivo, notas, km_previstos, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                atleta_id,
                fecha_str,
                entrenamiento_id,
                visible,
                ciclo_tipo,
                ciclo_id,
                macrociclo_id,
                mesociclo_id,
                microciclo_id,
                entrenamiento["nombre"],
                entrenamiento["objetivo"],
                entrenamiento["notas"],
                entrenamiento["km_totales"] if entrenamiento["km_totales"] is not None else 0,
                now,
                now,
            ),
        )

        asignado_id = cur.lastrowid
        clonar_detalle_entrenamiento(cur, entrenamiento_id, asignado_id)
        conn.commit()
        return asignado_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ============================================================
# 1) Crear un entrenamiento ASIGNADO (desde plantilla)
# ============================================================

@app.route('/entrenamientos_asignados', methods=['POST'])
@requires_roles('admin', 'entrenador')
def crear_entrenamiento_asignado(current_user):
    """
    Crea un entrenamiento asignado a partir de un entrenamiento base
    (plantilla). Copia pasos a entrenamientos_asignados_detalle.

    Payload esperado (lo que manda tu calendario.js):
    {
      atleta_id: 3,
      fecha: "2025-11-20",
      entrenamiento_id: 14,
      nombre: "2x (1000 + 800 + ...)",
      visible: 0   # opcional, por defecto 0
    }
    """
    data = request.get_json() or {}

    atleta_id = data.get('atleta_id')
    entrenamiento_id = data.get('entrenamiento_id')
    fecha_str = data.get('fecha')
    nombre = (data.get('nombre') or '').strip()
    visible_raw = data.get('visible', 0)

    # Validaciones básicas
    try:
        atleta_id = int(atleta_id)
        entrenamiento_id = int(entrenamiento_id)
    except (TypeError, ValueError):
        return jsonify({'error': 'atleta_id o entrenamiento_id inválidos'}), 400

    if not fecha_str or not nombre:
        return jsonify({'error': 'Faltan fecha o nombre'}), 400

    try:
        # Validar formato de fecha (YYYY-MM-DD)
        datetime.strptime(fecha_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Fecha inválida'}), 400

    visible = 1 if str(visible_raw) in ('1', 'true', 'True') else 0
    now = datetime.now().isoformat(' ')

    conn = get_db()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        # Snapshot del entrenamiento base
        cur.execute("""
            SELECT id, nombre, objetivo, notas, km_totales
            FROM entrenamientos
            WHERE id = ?
        """, (entrenamiento_id,))
        ent = cur.fetchone()

        if not ent:
            return jsonify({'error': 'Entrenamiento base no encontrado'}), 404

        objetivo = ent['objetivo']
        notas = ent['notas']
        km_previstos = ent['km_totales'] if ent['km_totales'] is not None else 0
        # Insert en entrenamientos_asignados
        cur.execute("""
            INSERT INTO entrenamientos_asignados (
                atleta_id, fecha, entrenamiento_id, visible,
                ciclo_tipo, ciclo_id, macrociclo_id, mesociclo_id, microciclo_id,
                nombre, objetivo, notas, km_previstos, created_at, updated_at
            ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)
        """, (
            atleta_id,
            fecha_str,
            entrenamiento_id,
            visible,
            nombre,
            objetivo,
            notas,
            km_previstos,
            now,
            now
        ))

        asignado_id = cur.lastrowid

        # Registrar km planificados en tabla resumen
        try:
            upsert_km_realizados(cur, asignado_id, km_previstos, None, now)
        except Exception as e:
            print("Aviso: no se pudo registrar km planificados en km_realizados_entrenamientos", e)

        # Clonar pasos
        clonar_detalle_entrenamiento(cur, entrenamiento_id, asignado_id)

        conn.commit()
        return jsonify({
            'message': 'Entrenamiento asignado correctamente',
            'id': asignado_id
        }), 201

    except Exception as e:
        print("Error en crear_entrenamiento_asignado:", e)
        conn.rollback()
        return jsonify({'error': 'Error al asignar entrenamiento'}), 500


# ============================================================
# 2) Listar entrenamientos asignados de un atleta
#    (lo dejo casi como lo tenías)
# ============================================================

@app.route('/entrenamientos_asignados/<int:atleta_id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamientos_asignados(current_user, atleta_id):
    try:
        # Si es atleta, sólo puede ver los suyos
        if session.get("user_rol") == "atleta" and session.get("user_id") != atleta_id:
            return jsonify({'error': 'Acceso no autorizado'}), 403

        entrenamientos = query_db(
            """
            SELECT *
            FROM entrenamientos_asignados 
            WHERE atleta_id = ?
            ORDER BY fecha ASC
            """,
            (atleta_id,)
        )
        return jsonify([dict(e) for e in entrenamientos]), 200
    except Exception as e:
        print("Error al obtener entrenamientos asignados:", e)
        return jsonify({'error': 'Error al obtener entrenamientos asignados'}), 500


# ============================================================
# 3) Obtener UN entrenamiento asignado + pasos (para el modal)
# ============================================================

@app.route('/entrenamientos_asignados/uno/<int:id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamiento_asignado(current_user, id):
    conn = get_db()
    cur = conn.cursor()

    # Cabecera del entrenamiento asignado
    cur.execute(
        "SELECT * FROM entrenamientos_asignados WHERE id = ?",
        (id,)
    )
    entrenamiento = cur.fetchone()

    if not entrenamiento:
        return jsonify({'error': 'Entrenamiento no encontrado'}), 404

    # Detalle de pasos
    cur.execute(
        """
        SELECT *
        FROM entrenamientos_asignados_detalle
        WHERE entrenamiento_asignado_id = ?
        ORDER BY parent_id IS NOT NULL, parent_id, orden, id
        """,
        (id,),
    )
    detalles = cur.fetchall()

    # Reconstruir árbol de pasos
    pasos_dict = {}
    for d in detalles:
        paso = dict(d)
        paso['subpasos'] = []
        pasos_dict[paso['id']] = paso

    pasos_raiz = []
    for paso in pasos_dict.values():
        parent_id = paso['parent_id']
        if parent_id is None:
            pasos_raiz.append(paso)
        else:
            padre = pasos_dict.get(parent_id)
            if padre:
                padre.setdefault('subpasos', []).append(paso)
            else:
                pasos_raiz.append(paso)  # huérfano, lo ponemos al raíz

    data = dict(entrenamiento)
    data['pasos'] = pasos_raiz

    return jsonify(data), 200


# ============================================================
# 4) Editar un entrenamiento asignado
#    (si cambias la plantilla, se vuelven a clonar los pasos)
# ============================================================

@app.route('/entrenamientos_asignados/<int:id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def editar_entrenamiento_asignado(current_user, id):
    data = request.get_json() or {}

    fecha_str = data.get('fecha')
    nombre = (data.get('nombre') or '').strip()
    entrenamiento_id_nuevo = data.get('entrenamiento_id')
    visible_raw = data.get('visible')

    if not fecha_str or not nombre:
        return jsonify({'error': 'Faltan fecha o nombre'}), 400

    try:
        datetime.strptime(fecha_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Fecha inválida'}), 400

    conn = get_db()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT *
            FROM entrenamientos_asignados
            WHERE id = ?
        """, (id,))
        actual = cur.fetchone()

        if not actual:
            return jsonify({'error': 'Entrenamiento asignado no encontrado'}), 404

        # Si no mandan entrenamiento_id nuevo, usamos el actual
        if entrenamiento_id_nuevo is None:
            entrenamiento_id_nuevo = actual['entrenamiento_id']
        else:
            entrenamiento_id_nuevo = int(entrenamiento_id_nuevo)

        visible = actual['visible']
        if visible_raw is not None:
            visible = 1 if str(visible_raw) in ('1', 'true', 'True') else 0

        now = datetime.now().isoformat(' ')

        # Snapshot del nuevo entrenamiento base (por si cambia)
        cur.execute("""
            SELECT id, objetivo, notas, km_totales
            FROM entrenamientos
            WHERE id = ?
        """, (entrenamiento_id_nuevo,))
        ent_base = cur.fetchone()

        if not ent_base:
            return jsonify({'error': 'Entrenamiento base no encontrado'}), 404

        objetivo = ent_base['objetivo']
        notas = ent_base['notas']
        km_previstos = ent_base['km_totales'] if ent_base['km_totales'] is not None else 0

        # Actualizar cabecera
        cur.execute("""
            UPDATE entrenamientos_asignados
            SET fecha = ?, nombre = ?, entrenamiento_id = ?,
                visible = ?, objetivo = ?, notas = ?, km_previstos = ?, updated_at = ?
            WHERE id = ?
        """, (
            fecha_str,
            nombre,
            entrenamiento_id_nuevo,
            visible,
            objetivo,
            notas,
            km_previstos,
            now,
            id
        ))

        # Si cambia la plantilla, regeneramos pasos
        if entrenamiento_id_nuevo != actual['entrenamiento_id']:
            cur.execute("""
                DELETE FROM entrenamientos_asignados_detalle
                WHERE entrenamiento_asignado_id = ?
            """, (id,))
            clonar_detalle_entrenamiento(cur, entrenamiento_id_nuevo, id)

        conn.commit()
        return jsonify({'message': 'Entrenamiento actualizado correctamente'}), 200

    except Exception as e:
        print("Error al actualizar entrenamiento asignado:", e)
        conn.rollback()
        return jsonify({'error': 'Error al actualizar entrenamiento asignado'}), 500

import json

@app.route('/entrenamientos_asignados/<int:id>/detalle', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def actualizar_entrenamiento_asignado_detalle(current_user, id):
    data = request.get_json() or {}

    # Aceptamos:
    #  - una lista directamente
    #  - o un objeto {"pasos": [...]}
    if isinstance(data, list):
        pasos_raw = data
    elif isinstance(data, dict):
        pasos_raw = data.get('pasos') or []
    else:
        pasos_raw = []

    # Normalizamos: solo dicts
    pasos = []
    for item in pasos_raw:
        if isinstance(item, dict):
            pasos.append(item)
        elif isinstance(item, str):
            # por si viniera un JSON en string
            try:
                parsed = json.loads(item)
                if isinstance(parsed, dict):
                    pasos.append(parsed)
                else:
                    print("Paso no válido (string JSON pero no dict):", item)
            except Exception:
                print("Paso no válido (string):", item)
        else:
            print("Paso no válido (tipo raro):", type(item), item)

    if not pasos:
        return jsonify({'error': 'No se recibieron pasos válidos'}), 400

    conn = get_db()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        # Borramos el detalle anterior
        cur.execute("""
            DELETE FROM entrenamientos_asignados_detalle
            WHERE entrenamiento_asignado_id = ?
        """, (id,))

        now = datetime.now().isoformat(' ')
        orden = 1

        def insertar_paso(paso, parent_id=None):
            nonlocal orden

            if not isinstance(paso, dict):
                print("insertar_paso: paso no es dict:", type(paso), paso)
                return

            cur.execute("""
                INSERT INTO entrenamientos_asignados_detalle
                  (entrenamiento_asignado_id,
                   parent_id,
                   orden,
                   tipo_paso,
                   repeticiones,
                   objetivo_tipo,
                   objetivo_valor,
                   unidad,
                   zona,
                   recuperacion_valor,
                   recuperacion_unidad)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                id,
                parent_id,
                orden,
                paso.get('tipo_paso'),
                paso.get('repeticiones'),
                paso.get('objetivo_tipo'),
                paso.get('objetivo_valor'),
                paso.get('unidad'),
                paso.get('zona'),
                paso.get('recuperacion_valor'),
                paso.get('recuperacion_unidad')
            ))

            nuevo_id = cur.lastrowid
            orden += 1

            # Insertar subpasos con parent_id = nuevo_id
            for sub in (paso.get('subpasos') or []):
                insertar_paso(sub, parent_id=nuevo_id)

        # Insertar todos los pasos raíz
        for p in pasos:
            insertar_paso(p, parent_id=None)

        conn.commit()
        return jsonify({'message': 'Detalle del entrenamiento asignado actualizado correctamente'}), 200

    except Exception as e:
        print("Error al actualizar detalle entrenamiento asignado:", e)
        conn.rollback()
        return jsonify({'error': 'Error al actualizar el detalle del entrenamiento asignado'}), 500


# ============================================================
# 5) Eliminar entrenamiento asignado (+ sus pasos)
# ============================================================

@app.route('/entrenamientos_asignados/<int:id>', methods=['DELETE'])
@requires_roles('admin', 'entrenador')
def eliminar_entrenamiento_asignado(current_user, id):
    conn = get_db()
    cur = conn.cursor()

    try:
        # Primero borramos pasos (por si no hay ON DELETE CASCADE)
        cur.execute("""
            DELETE FROM entrenamientos_asignados_detalle
            WHERE entrenamiento_asignado_id = ?
        """, (id,))

        # Luego la cabecera
        cur.execute("DELETE FROM entrenamientos_asignados WHERE id = ?", (id,))

        conn.commit()
        return jsonify({'message': 'Entrenamiento asignado eliminado correctamente'}), 200

    except Exception as e:
        print("Error al eliminar entrenamiento asignado:", e)
        conn.rollback()
        return jsonify({'error': 'Error al eliminar entrenamiento asignado'}), 500

@app.route('/entrenamientos_asignados/<int:id>/pasos', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def actualizar_pasos_entrenamiento_asignado(current_user, id):
    """
    Actualiza los pasos (detalles) de un entrenamiento asignado.
    Sobrescribe completamente los pasos existentes.
    """
    data = request.get_json()

    pasos = data.get("pasos")
    if not isinstance(pasos, list):
        return jsonify({"error": "Formato de pasos incorrecto"}), 400

    # Comprobar que el entrenamiento asignado existe
    asignado = query_db(
        "SELECT * FROM entrenamientos_asignados WHERE id = ?",
        (id,),
        one=True
    )
    if not asignado:
        return jsonify({"error": "Entrenamiento asignado no encontrado"}), 404

    try:
        conn = get_db()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # 1. Borrar pasos existentes
        cur.execute(
            "DELETE FROM entrenamientos_asignados_detalle WHERE entrenamiento_asignado_id = ?",
            (id,)
        )

        # 2. Insertar los nuevos pasos manteniendo jerarquía repeat/subpasos
        id_map = {}  # mapa plantilla→nuevo para parent_id

        def insertar_paso(paso, parent_id=None):
            cur.execute("""
                INSERT INTO entrenamientos_asignados_detalle (
                    entrenamiento_asignado_id, parent_id, orden, tipo_paso,
                    repeticiones, objetivo_tipo, objetivo_valor, unidad, zona,
                    recuperacion_valor, recuperacion_unidad, intensidad, descripcion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                id,
                parent_id,
                paso.get("orden"),
                paso.get("tipo_paso"),
                paso.get("repeticiones"),
                paso.get("objetivo_tipo"),
                paso.get("objetivo_valor"),
                paso.get("unidad"),
                paso.get("zona"),
                paso.get("recuperacion_valor"),
                paso.get("recuperacion_unidad"),
                paso.get("intensidad"),
                paso.get("descripcion")
            ))
            nuevo_id = cur.lastrowid

            # Subpasos si es repeat
            for idx, sub in enumerate(paso.get("subpasos", [])):
                sub["orden"] = idx + 1
                insertar_paso(sub, nuevo_id)

        # Insertar todos los pasos raíz
        for idx, paso in enumerate(pasos):
            paso["orden"] = idx + 1
            insertar_paso(paso, None)

        # (Opcional) marcar como personalizado
        cur.execute(
            "UPDATE entrenamientos_asignados SET personalizado = 1 WHERE id = ?",
            (id,)
        )

        conn.commit()

        return jsonify({"message": "Pasos actualizados correctamente"}), 200

    except Exception as e:
        print("Error al actualizar pasos del entrenamiento asignado:", e)
        conn.rollback()
        return jsonify({"error": "Error interno al actualizar pasos"}), 500

@app.route('/asignar_grupo_entrenamiento', methods=['POST'])
@requires_roles('admin', 'entrenador')
def asignar_grupo_entrenamiento(current_user):
    data = request.get_json()
    categoria = data.get('categoria')
    fecha = data.get('fecha')

    if not categoria or not fecha:
        return jsonify({'error': 'Categoría y fecha son obligatorios'}), 400

    # Copiar los campos del entrenamiento
    entrenamiento_datos = {
        'nombre': data.get('nombre'),
        'duracion_valor': data.get('duracion_valor'),
        'duracion_tipo': data.get('duracion_tipo'),
        'calentamiento_tipo': data.get('calentamiento_tipo'),
        'calentamiento_valor': data.get('calentamiento_valor'),
        'bloque_activacion': data.get('bloque_activacion'),
        'bloque_principal': data.get('bloque_principal'),
        'enfriamiento_tipo': data.get('enfriamiento_tipo'),
        'enfriamiento_valor': data.get('enfriamiento_valor'),
        'fecha': fecha
    }

    try:
        atletas = query_db('SELECT id FROM usuarios WHERE categoria = ?', (categoria,))
        if not atletas:
            return jsonify({'error': 'No hay atletas en esa categoría'}), 404

        for atleta in atletas:
            execute_db('''
                INSERT INTO entrenamientos_asignados (
                    atleta_id, fecha, nombre, duracion_valor, duracion_tipo,
                    calentamiento_tipo, calentamiento_valor, bloque_activacion,
                    bloque_principal, enfriamiento_tipo, enfriamiento_valor
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                atleta['id'], fecha, entrenamiento_datos['nombre'],
                entrenamiento_datos['duracion_valor'], entrenamiento_datos['duracion_tipo'],
                entrenamiento_datos['calentamiento_tipo'], entrenamiento_datos['calentamiento_valor'],
                entrenamiento_datos['bloque_activacion'], entrenamiento_datos['bloque_principal'],
                entrenamiento_datos['enfriamiento_tipo'], entrenamiento_datos['enfriamiento_valor']
            ))

        return jsonify({'message': 'Entrenamiento asignado correctamente a todos los atletas del grupo'}), 201

    except Exception as e:
        print(e)
        return jsonify({'error': 'Error al asignar entrenamiento al grupo'}), 500

def asignar_ciclo_interno(tipo, ciclo_id, atletas, fecha_inicio_str, notas=None, anclar_en=None):
    """
    Lógica central para asignar micro/meso/macro a atletas y generar entrenamientos reales.
    """
    tipo = (tipo or '').strip().lower()
    if tipo not in ('micro', 'meso', 'macro'):
        return jsonify({'error': 'Tipo de ciclo inválido'}), 400

    try:
        ciclo_id = int(ciclo_id)
    except Exception:
        return jsonify({'error': 'ciclo_id inválido'}), 400

    if not atletas:
        return jsonify({'error': 'Debes seleccionar al menos un atleta'}), 400

    try:
        fecha_inicio = datetime.strptime(fecha_inicio_str, '%Y-%m-%d').date()
    except Exception:
        return jsonify({'error': 'Fecha inválida'}), 400

    atleta_ids = []
    for a in atletas:
        try:
            atleta_ids.append(int(a))
        except Exception:
            pass

    if not atleta_ids:
        return jsonify({'error': 'Lista de atletas inválida'}), 400

    conn = get_db()
    cur = conn.cursor()

    def expand_micro(micro_id, base_offset=0, meso_id=None, macro_id=None):
        cur.execute(
            """
            SELECT dia_relativo, sesion_indice, entrenamiento_id
            FROM microciclos_entrenamientos
            WHERE microciclo_id = ?
            ORDER BY dia_relativo, sesion_indice, orden, id
            """,
            (micro_id,),
        )
        filas = cur.fetchall()

        out = []
        for f in filas:
            offset = base_offset + (f['dia_relativo'] - 1)
            out.append((offset, f['entrenamiento_id'], micro_id, meso_id, macro_id))
        return out

    def expand_meso(meso_id, base_offset=0, macro_id=None):
        cur.execute(
            """
            SELECT id, microciclo_id, orden
            FROM mesociclos_microciclos
            WHERE mesociclo_id = ?
            ORDER BY orden, id
            """,
            (meso_id,),
        )
        filas = cur.fetchall()

        items = []
        for f in filas:
            micro_id = f['microciclo_id']
            offset_sem = base_offset + (f['orden'] - 1)*7
            items.extend(expand_micro(micro_id, offset_sem, meso_id, macro_id))

        return items, len(filas)

    def expand_macro(macro_id, base_offset=0):
        cur.execute(
            """
            SELECT id, mesociclo_id, orden
            FROM macrociclos_mesociclos
            WHERE macrociclo_id = ?
            ORDER BY orden, id
            """,
            (macro_id,),
        )
        filas = cur.fetchall()

        items = []
        current_offset = base_offset

        for f in filas:
            meso_id = f['mesociclo_id']
            items_meso, num_weeks = expand_meso(meso_id, base_offset=current_offset, macro_id=macro_id)
            items.extend(items_meso)
            current_offset += num_weeks * 7

        return items

    if tipo == 'micro':
        items = expand_micro(ciclo_id)
    elif tipo == 'meso':
        items, _ = expand_meso(ciclo_id)
    else:
        items = expand_macro(ciclo_id)

    if not items:
        cur.close()
        conn.close()
        return jsonify({'error': 'El ciclo no tiene entrenamientos'}), 400

    def clonar_detalle(plantilla_ent_id, asignado_id):
        cur.execute(
            """
            SELECT *
            FROM entrenamientos_detalle
            WHERE entrenamiento_id = ?
            ORDER BY parent_id IS NOT NULL, parent_id, orden, id
            """,
            (plantilla_ent_id,),
        )
        detalles = cur.fetchall()

        id_map = {}  # plantilla_id → asignado_id

        for d in detalles:
            parent_old = d['parent_id']
            parent_new = id_map.get(parent_old) if parent_old else None

            cur.execute("""
                INSERT INTO entrenamientos_asignados_detalle (
                    entrenamiento_asignado_id, parent_id, orden, tipo_paso,
                    repeticiones, objetivo_tipo, objetivo_valor, unidad, zona,
                    recuperacion_valor, recuperacion_unidad, intensidad, descripcion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                asignado_id,
                parent_new,
                d['orden'],
                d['tipo_paso'],
                d['repeticiones'],
                d['objetivo_tipo'],
                d['objetivo_valor'],
                d['unidad'],
                d['zona'],
                d['recuperacion_valor'],
                d['recuperacion_unidad'],
                d['intensidad'],
                d['descripcion'],
            ))

            nuevo = cur.lastrowid
            id_map[d['id']] = nuevo

    now = datetime.now().isoformat(' ')

    try:
        for atleta_id in atleta_ids:
            for offset, entrenamiento_id, micro_id, meso_id, macro_id in items:
                cur.execute("""
                    SELECT id, nombre, objetivo, km_totales
                    FROM entrenamientos
                    WHERE id = ?
                """, (entrenamiento_id,))
                ent = cur.fetchone()

                if ent is None:
                    print("❌ ERROR: entrenamiento_id inexistente en ciclo →", entrenamiento_id)
                    continue

                fecha = fecha_inicio + timedelta(days=offset)

                cur.execute("""
                    INSERT INTO entrenamientos_asignados (
                        atleta_id, fecha, entrenamiento_id, visible,
                        ciclo_tipo, ciclo_id, macrociclo_id, mesociclo_id, microciclo_id,
                        nombre, objetivo, notas, km_previstos, created_at, updated_at
                    ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    atleta_id,
                    fecha.isoformat(),
                    ent["id"],
                    tipo,
                    ciclo_id,
                    macro_id,
                    meso_id,
                    micro_id,
                    ent["nombre"],
                    ent["objetivo"],
                    notas,
                    ent["km_totales"] if ent["km_totales"] is not None else 0,
                    now,
                    now
                ))

                asignado_id = cur.lastrowid
                clonar_detalle(ent["id"], asignado_id)

                # Registrar km planificados en tabla resumen
                try:
                    upsert_km_realizados(
                        cur,
                        asignado_id,
                        ent["km_totales"] if ent["km_totales"] is not None else None,
                        None,
                        now,
                    )
                except Exception as e:
                    print("Aviso: no se pudo registrar km planificados (ciclo):", e)

        conn.commit()
        return jsonify({'message': 'Ciclo asignado con éxito'}), 201
    except Exception as e:
        print("Error asignando ciclo:", e)
        conn.rollback()
        return jsonify({'error': 'No se pudo asignar el ciclo'}), 500
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

@app.route('/ciclos/asignar', methods=['POST'])
@requires_roles('admin', 'entrenador')
def asignar_ciclo(current_user):
    data = request.get_json(silent=True) or {}
    tipo = (data.get('tipo') or '').strip().lower()     # micro | meso | macro
    ciclo_id = data.get('ciclo_id')
    atletas = data.get('atletas') or []
    fecha_inicio_str = data.get('fecha_inicio')
    notas = (data.get('notas') or '').strip() or None
    return asignar_ciclo_interno(tipo, ciclo_id, atletas, fecha_inicio_str, notas)

@app.route('/ciclos/<tipo>/<int:ciclo_id>/asignaciones', methods=['POST'])
@requires_roles('admin', 'entrenador')
def asignar_ciclo_alias(current_user, tipo, ciclo_id):
    """
    Alias para asignar micro/meso/macro desde el calendario.
    Acepta payload con fecha_inicio_real y atleta_ids.
    """
    data = request.get_json(silent=True) or {}
    fecha_inicio_str = data.get('fecha_inicio_real') or data.get('fecha_inicio')
    atletas = data.get('atleta_ids') or data.get('atletas') or []
    notas = (data.get('notas') or '').strip() or None
    anclar_en = (data.get('anclar_en') or '').strip().lower() or None
    return asignar_ciclo_interno(tipo, ciclo_id, atletas, fecha_inicio_str, notas, anclar_en)
        
@app.route('/atletas_filtrados', methods=['GET'])
@requires_roles('entrenador')
def atletas_filtrados(current_user):
    grupo = request.args.get('grupo')
    subgrupo = request.args.get('subgrupo')
    categoria = request.args.get('categoria')

    query = 'SELECT * FROM usuarios WHERE rol = "atleta" AND aprobado = 1 AND entrenador_id = ?'
    params = [current_user['id']]

    if grupo:
        query += ' AND grupo = ?'
        params.append(grupo)
    if subgrupo:
        query += ' AND subgrupo = ?'
        params.append(subgrupo)
    if categoria:
        query += ' AND categoria = ?'
        params.append(categoria)

    atletas = query_db(query, tuple(params))
    return jsonify([dict(a) for a in atletas]), 200

@app.route('/asignar_entrenamiento_lote', methods=['POST'])
@requires_roles('entrenador')
def asignar_entrenamiento_lote(current_user):
    """
    Asigna un entrenamiento completo (incluyendo pasos) a varios atletas.
    Copia desde entrenamientos + entrenamientos_detalle →
    entrenamientos_asignados + entrenamientos_asignados_detalle
    usando el helper clonar_entrenamiento_para_atleta.
    """
    data = request.get_json() or {}
    fecha = data.get("fecha")
    entrenamiento_id = data.get("entrenamiento_id")
    atletas_ids = data.get("atletas_ids") or []

    if not fecha or not entrenamiento_id or not atletas_ids:
        return jsonify({"error": "Faltan datos requeridos"}), 400

    try:
        creados = 0

        for atleta_id in atletas_ids:
            clonar_entrenamiento_para_atleta(
                fecha=fecha,
                entrenamiento_id=entrenamiento_id,
                atleta_id=atleta_id,
                meta={
                    # Como es un entrenamiento suelto, no viene de ciclo
                    "ciclo_tipo": None,
                    "ciclo_id": None,
                    "macrociclo_id": None,
                    "mesociclo_id": None,
                    "microciclo_id": None,
                    "categoria": None,
                    "intensidad": None,
                },
            )
            creados += 1

        return jsonify({
            "message": f"Entrenamiento asignado correctamente a {creados} atletas",
            "creados": creados
        }), 200

    except ValueError as ve:
        print("Error en asignar_entrenamiento_lote (validación):", ve)
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        print("Error al asignar entrenamiento por lote:", e)
        return jsonify({"error": "Error interno al asignar entrenamiento"}), 500


@app.route('/feedback', methods=['POST'])
@requires_roles('atleta')
def enviar_feedback(current_user):
    data = request.get_json()
    entrenamiento_id = data.get("entrenamiento_id")
    comentario = data.get("comentario")
    url_datos = data.get("url_datos")
    atleta_id = current_user['id']

    if not entrenamiento_id or not comentario:
        return jsonify({"error": "Entrenamiento y comentario requeridos"}), 400

    try:
        execute_db(
            '''INSERT INTO feedbacks (entrenamiento_asignado_id, atleta_id, comentario, url_datos) 
               VALUES (?, ?, ?, ?)''',
            (entrenamiento_id, atleta_id, comentario, url_datos)
        )
        return jsonify({"message": "Feedback enviado correctamente"}), 200
    except Exception as e:
        print("Error al enviar feedback:", e)
        return jsonify({"error": "No se pudo enviar el feedback"}), 500

@app.route('/feedbacks_pendientes', methods=['GET'])
@requires_roles('entrenador')
def feedbacks_no_leidos(current_user):
    try:
        query = '''
            SELECT
                f.id,
                f.comentario,
                f.fecha,
                CONCAT_WS(' ', u.nombre, u.apellidos) AS atleta,
                ea.fecha AS fecha_entreno,
                f.url_datos
            FROM feedbacks f
            JOIN usuarios u
              ON f.atleta_id = u.id
            LEFT JOIN entrenamientos_asignados ea
              ON f.entrenamiento_asignado_id = ea.id
            WHERE f.leido = 0
              AND u.entrenador_id = ?
            ORDER BY f.fecha DESC
        '''
        resultados = query_db(query, (current_user["id"],))
        return jsonify([dict(r) for r in resultados]), 200
    except Exception as e:
        print("Error al obtener feedbacks no leídos:", e)
        return jsonify({'error': 'No se pudieron obtener los feedbacks'}), 500

@app.route('/feedbacks/<int:feedback_id>/leer', methods=['PUT'])
@requires_roles('entrenador')
def marcar_feedback_leido(current_user, feedback_id):
    try:
        data = request.get_json(silent=True) or {}
        nuevo_estado = data.get('leido', 1)  # Por defecto marcar como leído

        execute_db(
            'UPDATE feedbacks SET leido = ? WHERE id = ?',
            (nuevo_estado, feedback_id)
        )
        return jsonify({'message': f'Feedback marcado como {"leído" if nuevo_estado else "no leído"}'}), 200
    except Exception as e:
        print("Error al marcar feedback como leído/no leído:", e)
        return jsonify({'error': 'No se pudo actualizar el estado'}), 500


@app.route('/feedbacks/<int:feedback_id>', methods=['GET'])
@requires_roles('entrenador')
def ver_feedback(current_user, feedback_id):
    try:
        query = '''
            SELECT f.id, f.comentario, f.fecha, f.leido, f.respuesta,
                   CONCAT_WS(' ', u.nombre, u.apellidos) AS atleta,
                   ea.fecha AS fecha_entreno,
                   f.url_datos
            FROM feedbacks f
            JOIN usuarios u ON f.atleta_id = u.id
            LEFT JOIN entrenamientos_asignados ea ON f.entrenamiento_asignado_id = ea.id
            WHERE f.id = ? AND u.entrenador_id = ?
        '''
        resultado = query_db(query, (feedback_id, current_user['id']), one=True)
        if resultado:
            return jsonify(dict(resultado)), 200
        return jsonify({'error': 'Feedback no encontrado'}), 404
    except Exception as e:
        print("Error al obtener el detalle del feedback:", e)
        return jsonify({'error': 'No se pudo obtener el feedback'}), 500


@app.route('/resultados/entrenador', methods=['GET'])
@requires_roles('entrenador', 'admin')
def listar_resultados_entrenador(current_user):
    """
    Devuelve los entrenamientos con resultados de los atletas del entrenador, ordenados por fecha desc.
    """
    try:
        filtros = []
        params = []
        if current_user["rol"] == "entrenador":
            filtros.append("u.entrenador_id = ?")
            params.append(current_user["id"])

        where_clause = ""
        if filtros:
            where_clause = "WHERE " + " AND ".join(filtros)

        nombre_atleta_expr = (
            "CONCAT_WS(' ', u.nombre, u.apellidos)"
            if DB_ENGINE == "mariadb"
            else "u.nombre || ' ' || COALESCE(u.apellidos, '')"
        )

        query = f"""
            SELECT
                ea.id AS entrenamiento_asignado_id,
                ea.fecha,
                COALESCE(ea.nombre, e.nombre, 'Entrenamiento') AS entrenamiento_nombre,
                u.id AS atleta_id,
                {nombre_atleta_expr} AS atleta_nombre,
                AVG(re.tiempo_real_seg) AS tiempo_real_seg,
                COUNT(re.id) AS num_series,
                kre.km_planificados,
                kre.km_realizados
            FROM resultados_entrenamientos re
            JOIN entrenamientos_asignados ea ON ea.id = re.entrenamiento_asignado_id
            JOIN usuarios u ON u.id = ea.atleta_id
            LEFT JOIN entrenamientos e ON e.id = ea.entrenamiento_id
            LEFT JOIN km_realizados_entrenamientos kre ON kre.entrenamiento_asignado_id = ea.id
            {where_clause}
            GROUP BY ea.id, ea.fecha, entrenamiento_nombre, u.id, atleta_nombre, kre.km_planificados, kre.km_realizados
            ORDER BY DATE(ea.fecha) DESC, ea.id DESC
            LIMIT 300
        """
        filas = query_db(query, tuple(params))
        resultados = []
        for f in filas:
            atleta_nombre = f["atleta_nombre"]
            try:
                atleta_nombre = str(atleta_nombre).strip()
            except Exception:
                atleta_nombre = str(atleta_nombre)

            resultados.append({
                "entrenamiento_asignado_id": f["entrenamiento_asignado_id"],
                "fecha": f["fecha"],
                "entrenamiento": f["entrenamiento_nombre"],
                "atleta_id": f["atleta_id"],
                "atleta": atleta_nombre,
                "tiempo_real_seg": f["tiempo_real_seg"],
                "num_series": f["num_series"],
                "km_planificados": f.get("km_planificados"),
                "km_realizados": f.get("km_realizados"),
            })
        return jsonify(resultados), 200
    except Exception as e:
        print("Error listando resultados de entrenador:", e)
        return jsonify({'error': 'No se pudieron obtener los resultados'}), 500


@app.route('/resultados/entrenador/<int:asignado_id>', methods=['GET'])
@requires_roles('entrenador', 'admin')
def detalle_resultado_entrenador(current_user, asignado_id):
    """
    Devuelve detalle de un entrenamiento asignado (cabecera, pasos, resultados y feedbacks).
    """
    try:
        conn = get_db()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT ea.*, u.nombre AS atleta_nombre, u.apellidos AS atleta_apellidos, u.entrenador_id,
                   e.nombre AS plantilla_nombre
            FROM entrenamientos_asignados ea
            JOIN usuarios u ON u.id = ea.atleta_id
            LEFT JOIN entrenamientos e ON e.id = ea.entrenamiento_id
            WHERE ea.id = ?
            """,
            (asignado_id,),
        )
        asignado = cur.fetchone()
        if not asignado:
            return jsonify({'error': 'Entrenamiento no encontrado'}), 404
        if current_user["rol"] == "entrenador" and asignado["entrenador_id"] != current_user["id"]:
            return jsonify({'error': 'No tienes permiso para ver este entrenamiento'}), 403

        cur.execute(
            """
            SELECT
                id,
                parent_id,
                orden,
                tipo_paso,
                repeticiones,
                objetivo_tipo,
                objetivo_valor,
                unidad,
                zona,
                recuperacion_valor,
                recuperacion_unidad,
                intensidad,
                descripcion
            FROM entrenamientos_asignados_detalle
            WHERE entrenamiento_asignado_id = ?
            ORDER BY orden, id
            """,
            (asignado_id,),
        )
        pasos = [dict(p) for p in cur.fetchall()]

        cur.execute(
            """
            SELECT
                paso_detalle_id,
                repeticion,
                tiempo_real_seg,
                fecha
            FROM resultados_entrenamientos
            WHERE entrenamiento_asignado_id = ?
            ORDER BY fecha
            """,
            (asignado_id,),
        )
        resultados = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT comentario, url_datos, fecha
            FROM feedbacks
            WHERE entrenamiento_asignado_id = ?
            ORDER BY fecha DESC
            """,
            (asignado_id,),
        )
        feedbacks = [dict(fb) for fb in cur.fetchall()]

        cur.execute(
            """
            SELECT km_planificados, km_realizados
            FROM km_realizados_entrenamientos
            WHERE entrenamiento_asignado_id = ?
            """,
            (asignado_id,),
        )
        km_row = cur.fetchone()

        payload = {
            "entrenamiento": {
                "id": asignado["id"],
                "nombre": asignado["nombre"] or asignado.get("plantilla_nombre") or "Entrenamiento",
                "fecha": asignado["fecha"],
                "objetivo": asignado.get("objetivo"),
                "notas": asignado.get("notas"),
                "km_previstos": asignado.get("km_previstos"),
                "km_realizados": km_row["km_realizados"] if km_row else None,
                "km_planificados": km_row["km_planificados"] if km_row else None,
                "atleta": f"{asignado['atleta_nombre']} {asignado.get('atleta_apellidos') or ''}".strip(),
            },
            "pasos": pasos,
            "resultados": resultados,
            "feedbacks": feedbacks,
        }
        return jsonify(payload), 200
    except Exception as e:
        print("Error obteniendo detalle de resultado:", e)
        return jsonify({'error': 'No se pudo obtener el detalle del entrenamiento'}), 500
@app.route('/feedbacks', methods=['GET'])
@requires_roles('entrenador')
def obtener_todos_los_feedbacks(current_user):
    try:
        query = '''
            SELECT f.id, f.comentario, f.fecha, f.leido, f.respuesta,
                   CONCAT_WS(' ', u.nombre, u.apellidos) AS atleta,
                   ea.fecha AS fecha_entreno,
                   f.url_datos
            FROM feedbacks f
            JOIN usuarios u ON f.atleta_id = u.id
            LEFT JOIN entrenamientos_asignados ea ON f.entrenamiento_asignado_id = ea.id
            WHERE u.entrenador_id = ?
            ORDER BY f.fecha DESC
        '''
        resultados = query_db(query, (current_user['id'],))
        return jsonify([dict(r) for r in resultados]), 200
    except Exception as e:
        print("Error al obtener todos los feedbacks:", e)
        return jsonify({'error': 'No se pudieron obtener los feedbacks'}), 500

@app.route('/feedbacks/<int:feedback_id>/responder', methods=['POST'])
@requires_roles('entrenador')
def responder_feedback(current_user, feedback_id):
    data = request.get_json()
    respuesta = data.get('respuesta')

    if not respuesta:
        return jsonify({'error': 'Respuesta vacía'}), 400

    try:
        execute_db(
            'UPDATE feedbacks SET respuesta = ? WHERE id = ?',
            (respuesta, feedback_id)
        )
        return jsonify({'message': 'Respuesta guardada'}), 200
    except Exception as e:
        print("Error al guardar respuesta:", e)
        return jsonify({'error': 'Error al guardar respuesta'}), 500

# En el backend, podrías añadir una ruta como:
@app.route('/entrenamientos_proximos', methods=['GET'])
@requires_roles('entrenador')
def entrenamientos_proximos(current_user):
    try:
        query = '''
            SELECT
                DATE(ea.fecha) AS fecha,
                ea.entrenamiento_id,
                MIN(COALESCE(ea.visible, 1)) AS visible,
                MIN(COALESCE(ea.nombre, t.nombre, 'Entrenamiento')) AS nombre,
                COUNT(DISTINCT ea.atleta_id) AS num_atletas,
                GROUP_CONCAT(DISTINCT ea.atleta_id) AS atletas_ids
            FROM entrenamientos_asignados ea
            JOIN usuarios u ON u.id = ea.atleta_id
            LEFT JOIN entrenamientos t ON t.id = ea.entrenamiento_id
            WHERE u.entrenador_id = ?
              AND DATE(ea.fecha) >= DATE('now')
            GROUP BY DATE(ea.fecha), ea.entrenamiento_id
            ORDER BY DATE(ea.fecha) ASC
            LIMIT 10
        '''
        resultados = query_db(query, (current_user['id'],))
        return jsonify([dict(r) for r in resultados]), 200
    except Exception as e:
        print("Error al obtener próximos entrenamientos:", e)
        return jsonify({'error': 'No se pudieron obtener los entrenamientos'}), 500

@app.route('/calcular_zonas/<int:atleta_id>', methods=['POST'])
@requires_roles('entrenador')
def calcular_zonas(current_user, atleta_id):
    try:
        data = request.get_json()
        minutos = int(data['minutos'])
        segundos = int(data['segundos'])

        tiempo_horas = (minutos * 60 + segundos) / 3600
        vam = round(2 / tiempo_horas, 2)

        zonas = {
            'z1': round(vam * 0.60, 2),
            'z2': round(vam * 0.70, 2),
            'z3': round(vam * 0.80, 2),
            'z4': round(vam * 0.90, 2),
            'z5': round(vam * 1.00, 2),
            'z6': round(vam * 1.10, 2)
        }

        fecha_inicio = data.get("fecha_inicio") or datetime.utcnow().date().isoformat()
        try:
            fin_anterior = (datetime.fromisoformat(fecha_inicio) - timedelta(days=1)).date().isoformat()
        except Exception:
            fin_anterior = fecha_inicio

        execute_db(
            "UPDATE zonas_entrenamiento SET fecha_fin = ? WHERE atleta_id = ? AND fecha_fin IS NULL",
            (fin_anterior, atleta_id)
        )

        execute_db(
            '''
            INSERT INTO zonas_entrenamiento (atleta_id, vam, z1, z2, z3, z4, z5, z6, fecha_inicio)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (atleta_id, vam, zonas['z1'], zonas['z2'], zonas['z3'], zonas['z4'], zonas['z5'], zonas['z6'], fecha_inicio)
        )

        return jsonify({'vam': vam, 'zonas': zonas}), 200
    except Exception as e:
        print("Error al calcular zonas:", e)
        return jsonify({'error': 'No se pudieron calcular las zonas'}), 500

@app.route('/guardar_zonas', methods=['POST'])
@requires_roles('entrenador')
def guardar_zonas(current_user):
    try:
        data = request.get_json()
        atleta_id = data.get("atleta_id")
        vam = data.get("vam")
        z1 = data.get("z1")
        z2 = data.get("z2")
        z3 = data.get("z3")
        z4 = data.get("z4")
        z5 = data.get("z5")
        z6 = data.get("z6")
        fecha_inicio = data.get("fecha_inicio") or datetime.utcnow().date().isoformat()

        if not all([atleta_id, vam, z1, z2, z3, z4, z5, z6]):
            return jsonify({"error": "Datos incompletos"}), 400

        try:
            fin_anterior = (datetime.fromisoformat(fecha_inicio) - timedelta(days=1)).date().isoformat()
        except Exception:
            fin_anterior = fecha_inicio

        execute_db(
            "UPDATE zonas_entrenamiento SET fecha_fin = ? WHERE atleta_id = ? AND fecha_fin IS NULL",
            (fin_anterior, atleta_id)
        )

        execute_db(
            '''
            INSERT INTO zonas_entrenamiento (atleta_id, vam, z1, z2, z3, z4, z5, z6, fecha_inicio)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (atleta_id, vam, z1, z2, z3, z4, z5, z6, fecha_inicio)
        )

        return jsonify({"message": "Zonas guardadas correctamente"}), 200

    except Exception as e:
        print("Error al guardar zonas:", e)
        return jsonify({"error": "No se pudieron guardar las zonas"}), 500

from datetime import datetime, timedelta  # asegúrate de tener esto arriba del todo
from email.utils import parsedate_to_datetime


def _normalizar_fecha(value):
    """
    Normaliza diferentes formatos de fecha (iso, rfc2822) a string YYYY-MM-DD.
    Devuelve None si no puede parsear.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    try:
        # ISO (YYYY-MM-DD o con tiempo)
        return datetime.fromisoformat(str(value)).date().isoformat()
    except Exception:
        pass
    try:
        # Formatos tipo "Mon, 06 Oct 2025 00:00:00 GMT"
        return parsedate_to_datetime(str(value)).date().isoformat()
    except Exception:
        return None

@app.route('/entrenamientos_asignados/visibilidad', methods=['POST'])
def actualizar_visibilidad_entrenamientos_asignados():
    """
    Acepta JSON:
      { "atletas": [3,4], "fecha": "2025-11-21", "visible": 1, "modo": "dia|semana" }
    o:
      { "asignacion_id": 12, "atletas": [3,4], "visible": 1 }

    Devuelve: { ok: True, updated: N } o { error: '...' }
    """
    data = request.get_json(silent=True) or {}
    atletas = data.get('atletas') or []
    asignacion_id = data.get('asignacion_id')
    fecha = data.get('fecha')
    visible = data.get('visible')
    modo = (data.get('modo') or 'dia').lower()  # "dia" por defecto

    if not isinstance(atletas, list) or len(atletas) == 0:
        return jsonify({'error': 'Faltan atletas'}), 400
    if visible is None:
        return jsonify({'error': 'Falta campo visible'}), 400

    # normalizar visible
    try:
        visible_val = 1 if int(visible) else 0
    except Exception:
        visible_val = 1 if bool(visible) else 0

    try:
        conn = get_db()
        cur = conn.cursor()

        placeholders = ','.join(['?'] * len(atletas))
        params = [visible_val]

        if asignacion_id:
            # actualizar por asignacion_id y atleta_id
            query = f"""
                UPDATE entrenamientos_asignados
                   SET visible = ?
                 WHERE asignacion_id = ?
                   AND atleta_id IN ({placeholders})
            """
            params.append(asignacion_id)
            params.extend(atletas)

        elif fecha:
            fecha_norm = _normalizar_fecha(fecha)
            if not fecha_norm:
                return jsonify({'error': 'Fecha inválida'}), 400
            # actualizar por fecha, con soporte para "dia" o "semana"
            if modo == 'semana':
                # calcular lunes–domingo de la semana de 'fecha'
                fecha_dt = datetime.fromisoformat(fecha_norm).date()
                inicio_semana = fecha_dt - timedelta(days=fecha_dt.weekday())  # lunes
                fin_semana = inicio_semana + timedelta(days=6)                # domingo

                query = f"""
                    UPDATE entrenamientos_asignados
                       SET visible = ?
                     WHERE DATE(fecha) BETWEEN DATE(?) AND DATE(?)
                       AND atleta_id IN ({placeholders})
                """
                params.append(inicio_semana.isoformat())
                params.append(fin_semana.isoformat())
                params.extend(atletas)
            else:
                # modo "dia" (comportamiento original)
                query = f"""
                    UPDATE entrenamientos_asignados
                       SET visible = ?
                     WHERE DATE(fecha) = DATE(?)
                       AND atleta_id IN ({placeholders})
                """
                params.append(fecha_norm)
                params.extend(atletas)

        else:
            # actualizar por atleta_id solamente (todo lo asignado)
            query = f"""
                UPDATE entrenamientos_asignados
                   SET visible = ?
                 WHERE atleta_id IN ({placeholders})
            """
            params.extend(atletas)

        cur.execute(query, tuple(params))
        conn.commit()
        updated = cur.rowcount if hasattr(cur, 'rowcount') else None
        if updated is None or (isinstance(updated, int) and updated < 0):
            # Fallback para SQLite
            try:
                updated = conn.total_changes
            except Exception:
                updated = 0

        return jsonify({'ok': True, 'updated': updated}), 200

    except Exception as e:
        app.logger.exception('Error actualizando visibilidad grupal')
        return jsonify({'error': 'No se pudo actualizar la visibilidad'}), 500

    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

@app.route('/entrenamientos_asignados/<int:asignado_id>/detalle', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_detalle_entrenamiento_asignado(current_user, asignado_id):
    """
    Devuelve la lista de pasos (detalle) de un entrenamiento asignado.
    Usado por el editor entrenamiento_asignado_editor.js
    """
    # Comprobamos que el entrenamiento asignado existe
    ent = query_db(
        "SELECT atleta_id FROM entrenamientos_asignados WHERE id = ?",
        (asignado_id,),
        one=True
    )
    if not ent:
        return jsonify({'error': 'Entrenamiento asignado no encontrado'}), 404

    # Si es atleta, sólo puede ver los suyos
    if current_user['rol'] == 'atleta' and current_user['id'] != ent['atleta_id']:
        return jsonify({'error': 'No tienes permiso para ver este entrenamiento'}), 403

    filas = query_db(
        """
        SELECT
            id,
            entrenamiento_asignado_id,
            parent_id,
            orden,
            tipo_paso,
            repeticiones,
            objetivo_tipo,
            objetivo_valor,
            unidad,
            zona,
            recuperacion_valor,
            recuperacion_unidad,
            intensidad,
            descripcion
        FROM entrenamientos_asignados_detalle
        WHERE entrenamiento_asignado_id = ?
        ORDER BY orden, id
        """,
        (asignado_id,)
    )

    # El editor trabaja en plano, sin árbol de subpasos
    pasos = [dict(f) for f in filas]
    return jsonify(pasos), 200

@app.route('/entrenamientos_asignados/<int:id>/detalle', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def actualizar_detalle_entrenamiento_asignado(current_user, id):
    data = request.get_json() or {}

    # Aceptamos tanto lista directa como {"pasos":[...]}
    if isinstance(data, list):
        pasos = data
    else:
        pasos = data.get('pasos') or []

    if not isinstance(pasos, list):
        return jsonify({'error': 'Formato de datos inválido (se esperaba una lista de pasos)'}), 400

    conn = get_db()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        # Borramos detalle anterior
        cur.execute("""
            DELETE FROM entrenamientos_asignados_detalle
            WHERE entrenamiento_asignado_id = ?
        """, (id,))

        now = datetime.now().isoformat(' ')
        orden = 1

        def insertar_paso(paso, parent_id=None):
            nonlocal orden

            cur.execute("""
                INSERT INTO entrenamientos_asignados_detalle
                  (entrenamiento_asignado_id,
                   parent_id,
                   orden,
                   tipo_paso,
                   repeticiones,
                   objetivo_tipo,
                   objetivo_valor,
                   unidad,
                   zona,
                   recuperacion_valor,
                   recuperacion_unidad,
                   created_at,
                   updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                id,
                parent_id,
                orden,
                paso.get('tipo_paso'),
                paso.get('repeticiones'),
                paso.get('objetivo_tipo'),
                paso.get('objetivo_valor'),
                paso.get('unidad'),
                paso.get('zona'),
                paso.get('recuperacion_valor'),
                paso.get('recuperacion_unidad'),
                now,
                now
            ))

            nuevo_id = cur.lastrowid
            orden += 1

            # Si hay subpasos (p.ej. bloque repetido), los insertamos con parent_id = nuevo_id
            for sub in (paso.get('subpasos') or []):
                insertar_paso(sub, parent_id=nuevo_id)

        # Insertamos todos los pasos raíz
        for p in pasos:
            insertar_paso(p, parent_id=None)

        conn.commit()
        return jsonify({'message': 'Detalle del entrenamiento asignado actualizado correctamente'}), 200

    except Exception as e:
        print("Error al actualizar detalle entrenamiento asignado:", e)
        conn.rollback()
        return jsonify({'error': 'Error al actualizar el detalle del entrenamiento asignado'}), 500
   
@app.route('/zonas_atleta/<int:atleta_id>', methods=['GET'])
@requires_roles('entrenador', 'atleta')
def obtener_zonas_atleta(current_user, atleta_id):
    try:
        fecha_ref = request.args.get("fecha")
        params = [atleta_id]
        if fecha_ref:
            params.extend([fecha_ref, fecha_ref])
            query = '''
                SELECT vam, z1, z2, z3, z4, z5, z6, fecha_inicio, fecha_fin
                FROM zonas_entrenamiento
                WHERE atleta_id = ?
                  AND fecha_inicio <= ?
                  AND (fecha_fin IS NULL OR fecha_fin >= ?)
                ORDER BY fecha_inicio DESC
                LIMIT 1
            '''
        else:
            query = '''
                SELECT vam, z1, z2, z3, z4, z5, z6, fecha_inicio, fecha_fin
                FROM zonas_entrenamiento
                WHERE atleta_id = ?
                ORDER BY fecha_inicio DESC
                LIMIT 1
            '''
        resultado = query_db(query, tuple(params), one=True)
        if resultado:
            return jsonify(dict(resultado)), 200
        else:
            return jsonify({'message': 'No hay zonas guardadas para este atleta'}), 404
    except Exception as e:
        print("Error al obtener zonas:", e)
        return jsonify({'error': 'No se pudieron obtener las zonas'}), 500
@app.route('/entrenadores', methods=['GET'])
def get_entrenadores():
    """
    Devuelve la lista de entrenadores disponibles para el registro de atletas.
    Formato: [{id, nombre_completo}]
    """
    try:
        entrenadores = query_db(
            "SELECT id, nombre, apellidos FROM usuarios WHERE rol = 'entrenador'"
        )
        resultado = [
            {
                'id': e['id'],
                'nombre_completo': f"{e['nombre']} {e['apellidos']}"
            }
            for e in entrenadores
        ]
        return jsonify(resultado), 200
    except Exception as e:
        print("Error obteniendo entrenadores:", e)
        return jsonify({'error': 'No se pudieron cargar los entrenadores'}), 500

from datetime import datetime  # ya lo tienes arriba, si no, añádelo


# ============================================================
#   RUTAS PARA CICLOS: MICRO / MESO / MACRO
# ============================================================

# ---------- MICRO CICLOS ----------

@app.route('/microciclos', methods=['GET'])
@requires_roles('admin', 'entrenador')
def listar_microciclos_plantillas(current_user):
    """
    Alias para compatibilidad con el frontend:
    /microciclos -> mismo resultado que /microciclos
    """
    try:
        where = ""
        params = []
        if current_user["rol"] == "entrenador":
            where = "WHERE creador_id = ? OR creador_id IS NULL"
            params.append(current_user["id"])

        filas = query_db(
            f"SELECT id, nombre, objetivo FROM microciclos {where} ORDER BY id DESC",
            tuple(params)
        )
        return jsonify([dict(f) for f in filas]), 200
    except Exception as e:
        print("Error en listar_microciclos_plantillas:", e)
        return jsonify({'error': 'Error al obtener microciclos'}), 500


@app.route("/microciclos", methods=["GET"])
@requires_roles("entrenador", "admin")
def listar_microciclos(current_user):
    db = get_db()

    where_clause = ""
    params = []
    if current_user["rol"] == "entrenador":
        where_clause = "WHERE creador_id = ? OR creador_id IS NULL"
        params.append(current_user["id"])

    micros = db.execute(
        f"""
        SELECT id, mesociclo_id, nombre, objetivo, created_at
        FROM microciclos
        {where_clause}
        ORDER BY created_at DESC
        """,
        params
    ).fetchall()

    # Contamos sesiones por microciclo
    sesiones = db.execute(
        """
        SELECT microciclo_id, dia_relativo, COUNT(*) AS total
        FROM microciclos_entrenamientos
        GROUP BY microciclo_id, dia_relativo
        """
    ).fetchall()

    resumen_por_micro = {}
    for r in sesiones:
        mid = r["microciclo_id"]
        if mid not in resumen_por_micro:
            resumen_por_micro[mid] = {}
        resumen_por_micro[mid][r["dia_relativo"]] = r["total"]

    data = []
    for m in micros:
        resumen = resumen_por_micro.get(m["id"], {})
        data.append(
            {
                "id": m["id"],
                "mesociclo_id": m["mesociclo_id"],
                "nombre": m["nombre"],
                "objetivo": m["objetivo"],
                "created_at": m["created_at"],
                "resumen_sesiones": resumen,  # {1:2, 2:1, ...}
            }
        )

    return jsonify(data)


@app.route('/microciclos', methods=['POST'])
@requires_roles('admin', 'entrenador')
def crear_microciclo(current_user):
    """
    Crea un microciclo nuevo.

    Espera JSON:
    {
      "nombre": "Carga",
      "objetivo": "Semana de carga",
      "sesiones": [
        {
          "dia_relativo": 1,
          "sesion_indice": 1,
          "entrenamiento_id": 5,
          "notas": "Rodaje suave",
          "orden": 1
        },
        ...
      ]
    }
    """
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    objetivo = (data.get('objetivo') or '').strip() or None
    sesiones = data.get('sesiones') or []

    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()

        now = datetime.now().isoformat(' ')
        cur.execute(
            """
            INSERT INTO microciclos (mesociclo_id, nombre, objetivo, created_at, creador_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (None, nombre, objetivo, now, current_user["id"])
        )
        micro_id = cur.lastrowid

        for s in sesiones:
            dia = int(s.get('dia_relativo') or 1)
            sesion_idx = int(s.get('sesion_indice') or 1)
            entrenamiento_id = s.get('entrenamiento_id')
            notas = s.get('notas')
            orden = s.get('orden')
            cur.execute(
                """
                INSERT INTO microciclos_entrenamientos
                    (microciclo_id, dia_relativo, sesion_indice,
                     entrenamiento_id, notas, orden, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (micro_id, dia, sesion_idx, entrenamiento_id, notas, orden, now)
            )

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'message': 'Microciclo creado', 'id': micro_id}), 201

    except Exception as e:
        print("Error en crear_microciclo:", e)
        return jsonify({'error': 'Error al crear el microciclo'}), 500


@app.route('/microciclos/<int:micro_id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def actualizar_microciclo(current_user, micro_id):
    """
    Actualiza un microciclo y sus sesiones (sobrescribe las sesiones).
    Mismo formato JSON que POST /microciclos.
    """
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    objetivo = (data.get('objetivo') or '').strip() or None
    sesiones = data.get('sesiones') or []

    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()

        # Comprobar que existe
        cur.execute("SELECT id, creador_id FROM microciclos WHERE id = ?", (micro_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({'error': 'Microciclo no encontrado'}), 404
        if current_user["rol"] == "entrenador":
            creador = row["creador_id"] if isinstance(row, dict) else None
            if creador not in (None, current_user["id"]):
                cur.close()
                conn.close()
                return jsonify({'error': 'No tienes permiso para editar este microciclo'}), 403

        now = datetime.now().isoformat(' ')

        cur.execute(
            "UPDATE microciclos SET nombre = ?, objetivo = ? WHERE id = ?",
            (nombre, objetivo, micro_id)
        )

        # Borrar sesiones antiguas
        cur.execute(
            "DELETE FROM microciclos_entrenamientos WHERE microciclo_id = ?",
            (micro_id,)
        )

        # Insertar nuevas sesiones
        for s in sesiones:
            dia = int(s.get('dia_relativo') or 1)
            sesion_idx = int(s.get('sesion_indice') or 1)
            entrenamiento_id = s.get('entrenamiento_id')
            notas = s.get('notas')
            orden = s.get('orden')
            cur.execute(
                """
                INSERT INTO microciclos_entrenamientos
                    (microciclo_id, dia_relativo, sesion_indice,
                     entrenamiento_id, notas, orden, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (micro_id, dia, sesion_idx, entrenamiento_id, notas, orden, now)
            )

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'message': 'Microciclo actualizado'}), 200

    except Exception as e:
        print("Error en actualizar_microciclo:", e)
        return jsonify({'error': 'Error al actualizar el microciclo'}), 500


@app.route('/microciclos/<int:micro_id>', methods=['DELETE'])
@requires_roles('admin', 'entrenador')
def borrar_microciclo(current_user, micro_id):
    """
    Elimina el microciclo y sus sesiones asociadas.
    """
    try:
        conn = get_db()
        cur = conn.cursor()

        cur.execute("SELECT creador_id FROM microciclos WHERE id = ?", (micro_id,))
        owner_row = cur.fetchone()
        if not owner_row:
            cur.close()
            conn.close()
            return jsonify({'error': 'Microciclo no encontrado'}), 404
        if current_user["rol"] == "entrenador":
            creador = owner_row["creador_id"] if isinstance(owner_row, dict) else None
            if creador not in (None, current_user["id"]):
                cur.close()
                conn.close()
                return jsonify({'error': 'No tienes permiso para eliminar este microciclo'}), 403

        cur.execute("DELETE FROM microciclos_entrenamientos WHERE microciclo_id = ?", (micro_id,))
        cur.execute("DELETE FROM microciclos WHERE id = ?", (micro_id,))

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'message': 'Microciclo eliminado'}), 200

    except Exception as e:
        print("Error en borrar_microciclo:", e)
        return jsonify({'error': 'Error al eliminar el microciclo'}), 500

@app.route("/microciclos/<int:micro_id>/entrenamientos", methods=["GET"])
@requires_roles("entrenador", "admin")
def listar_entrenamientos_microciclo(current_user, micro_id):
    conn = get_db()
    cur = conn.cursor()

    # Comprobamos que el microciclo existe
    cur.execute(
        """
        SELECT id, mesociclo_id, nombre, objetivo, created_at, creador_id
        FROM microciclos
        WHERE id = ?
        """,
        (micro_id,),
    )
    micro = cur.fetchone()

    if micro is None:
        cur.close()
        conn.close()
        return jsonify({"error": "Microciclo no encontrado"}), 404

    if current_user["rol"] == "entrenador":
        creador = micro["creador_id"] if isinstance(micro, dict) else None
        if creador not in (None, current_user["id"]):
            cur.close()
            conn.close()
            return jsonify({"error": "No tienes permiso para ver este microciclo"}), 403

    cur.execute(
        """
        SELECT
            me.id,
            me.microciclo_id,
            me.dia_relativo,
            me.sesion_indice,
            me.entrenamiento_id,
            me.orden,
            e.nombre   AS entrenamiento_nombre,
            e.objetivo AS entrenamiento_objetivo
        FROM microciclos_entrenamientos AS me
        LEFT JOIN entrenamientos AS e
               ON e.id = me.entrenamiento_id
        WHERE me.microciclo_id = ?
        ORDER BY me.dia_relativo, me.sesion_indice, me.orden
        """,
        (micro_id,),
    )
    rows = cur.fetchall()

    detalles = []
    for r in rows:
        detalles.append(
            {
                "id": r["id"],
                "microciclo_id": r["microciclo_id"],
                "dia_relativo": r["dia_relativo"],
                "sesion_indice": r["sesion_indice"],
                "entrenamiento_id": r["entrenamiento_id"],
                "orden": r["orden"],
                "entrenamiento_nombre": r["entrenamiento_nombre"],
                "entrenamiento_objetivo": r["entrenamiento_objetivo"],
            }
        )

    cur.close()
    conn.close()

    # Respuesta con el microciclo + sus entrenamientos
    return jsonify({
        "id": micro["id"],
        "mesociclo_id": micro["mesociclo_id"],
        "nombre": micro["nombre"],
        "objetivo": micro["objetivo"],
        "created_at": micro["created_at"],
        "detalles": detalles,
    })

# ---------- MESO CICLOS ----------

@app.route('/mesociclos', methods=['GET'])
@requires_roles('admin', 'entrenador')
def listar_mesociclos(current_user):
    try:
        where = ""
        params = []
        if current_user["rol"] == "entrenador":
            where = "WHERE creador_id = ? OR creador_id IS NULL"
            params.append(current_user["id"])

        filas = query_db(
            f"SELECT id, nombre, objetivo FROM mesociclos {where} ORDER BY id DESC",
            tuple(params)
        )
        return jsonify([dict(f) for f in filas]), 200
    except Exception as e:
        print("Error en listar_mesociclos:", e)
        return jsonify({'error': 'Error al obtener mesociclos'}), 500


@app.route('/mesociclos', methods=['GET'])
@requires_roles('admin', 'entrenador')
def listar_mesociclos_plantillas(current_user):
    """
    Devuelve los mesociclos incluyendo los microciclos asociados,
    tal como el frontend necesita.
    """
    try:
        where = ""
        params = []
        if current_user["rol"] == "entrenador":
            where = "WHERE creador_id = ? OR creador_id IS NULL"
            params.append(current_user["id"])

        # Datos base de mesociclos
        meso_rows = query_db(
            f"SELECT id, nombre, objetivo FROM mesociclos {where} ORDER BY id DESC",
            tuple(params)
        )

        resultado = []

        for meso in meso_rows:
            meso_id = meso["id"]

            # Traer microciclos ligados
            micro_rows = query_db(
                """
                SELECT mm.id,
                       mm.microciclo_id,
                       mc.nombre AS microciclo_nombre,
                       mm.orden,
                       mm.notas
                FROM mesociclos_microciclos mm
                LEFT JOIN microciclos mc ON mc.id = mm.microciclo_id
                WHERE mm.mesociclo_id = ?
                ORDER BY mm.orden, mm.id
                """,
                (meso_id,)
            )

            resultado.append({
                "id": meso_id,
                "nombre": meso["nombre"],
                "objetivo": meso["objetivo"],
                "microciclos": [dict(r) for r in micro_rows]
            })

        return jsonify(resultado), 200

    except Exception as e:
        print("Error en listar_mesociclos_plantillas:", e)
        return jsonify({'error': 'Error al obtener mesociclos'}), 500

@app.route('/mesociclos/<int:meso_id>', methods=['GET'])
@requires_roles('admin', 'entrenador')
def obtener_mesociclo(current_user, meso_id):
    """
    Detalle de mesociclo, con sus microciclos asociados.
    """
    try:
        meso = query_db(
            "SELECT id, nombre, objetivo, creador_id FROM mesociclos WHERE id = ?",
            (meso_id,),
            one=True
        )
        if not meso:
            return jsonify({'error': 'Mesociclo no encontrado'}), 404
        if current_user["rol"] == "entrenador":
            creador = meso.get("creador_id") if isinstance(meso, dict) else None
            if creador not in (None, current_user["id"]):
                return jsonify({'error': 'No tienes permiso para ver este mesociclo'}), 403

        filas = query_db(
            """
            SELECT mm.id,
                   mm.microciclo_id,
                   mc.nombre AS microciclo_nombre,
                   mm.orden,
                   mm.notas
            FROM mesociclos_microciclos mm
            LEFT JOIN microciclos mc ON mc.id = mm.microciclo_id
            WHERE mm.mesociclo_id = ?
            ORDER BY mm.orden, mm.id
            """,
            (meso_id,)
        )

        data = dict(meso)
        data['microciclos'] = [dict(f) for f in filas]
        return jsonify(data), 200

    except Exception as e:
        print("Error en obtener_mesociclo:", e)
        return jsonify({'error': 'Error al obtener el mesociclo'}), 500


@app.route('/mesociclos', methods=['POST'])
@requires_roles('admin', 'entrenador')
def crear_mesociclo(current_user):
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    objetivo = (data.get('objetivo') or '').strip() or None
    microciclos = data.get('microciclos') or []

    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400
    if not microciclos:
        return jsonify({'error': 'Añade al menos un microciclo'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()

        cur.execute(
            "INSERT INTO mesociclos (nombre, objetivo, creador_id) VALUES (?, ?, ?)",
            (nombre, objetivo, current_user["id"])
        )
        meso_id = cur.lastrowid

        for m in microciclos:
            micro_id = m.get('microciclo_id')
            orden = int(m.get('orden') or 1)
            notas = m.get('notas')
            if not micro_id:
                continue
            cur.execute(
                """
                INSERT INTO mesociclos_microciclos (mesociclo_id, microciclo_id, orden, notas)
                VALUES (?, ?, ?, ?)
                """,
                (meso_id, micro_id, orden, notas)
            )

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({'message': 'Mesociclo creado', 'id': meso_id}), 201

    except Exception as e:
        print("Error en crear_mesociclo:", e)
        return jsonify({'error': 'Error al crear el mesociclo'}), 500


@app.route('/mesociclos/<int:meso_id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def actualizar_mesociclo(current_user, meso_id):
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    objetivo = (data.get('objetivo') or '').strip() or None
    microciclos = data.get('microciclos') or []

    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400
    if not microciclos:
        return jsonify({'error': 'Añade al menos un microciclo'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()

        # comprobar que existe
        cur.execute("SELECT id, creador_id FROM mesociclos WHERE id = ?", (meso_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({'error': 'Mesociclo no encontrado'}), 404
        if current_user["rol"] == "entrenador":
            creador = row["creador_id"] if isinstance(row, dict) else None
            if creador not in (None, current_user["id"]):
                cur.close()
                conn.close()
                return jsonify({'error': 'No tienes permiso para editar este mesociclo'}), 403

        cur.execute(
            "UPDATE mesociclos SET nombre = ?, objetivo = ? WHERE id = ?",
            (nombre, objetivo, meso_id)
        )

        # borrar composición anterior
        cur.execute("DELETE FROM mesociclos_microciclos WHERE mesociclo_id = ?", (meso_id,))

        # insertar nueva secuencia
        for m in microciclos:
          micro_id = m.get('microciclo_id')
          orden = int(m.get('orden') or 1)
          notas = m.get('notas')
          if not micro_id:
              continue
          cur.execute(
              """
              INSERT INTO mesociclos_microciclos (mesociclo_id, microciclo_id, orden, notas)
              VALUES (?, ?, ?, ?)
              """,
              (meso_id, micro_id, orden, notas)
          )

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({'message': 'Mesociclo actualizado'}), 200

    except Exception as e:
        print("Error en actualizar_mesociclo:", e)
        return jsonify({'error': 'Error al actualizar el mesociclo'}), 500


@app.route('/mesociclos/<int:meso_id>', methods=['DELETE'])
@requires_roles('admin', 'entrenador')
def borrar_mesociclo(current_user, meso_id):
    try:
        conn = get_db()
        cur = conn.cursor()

        cur.execute("SELECT creador_id FROM mesociclos WHERE id = ?", (meso_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({'error': 'Mesociclo no encontrado'}), 404
        if current_user["rol"] == "entrenador":
            creador = row["creador_id"] if isinstance(row, dict) else None
            if creador not in (None, current_user["id"]):
                cur.close()
                conn.close()
                return jsonify({'error': 'No tienes permiso para eliminar este mesociclo'}), 403

        cur.execute("DELETE FROM mesociclos WHERE id = ?", (meso_id,))
        deleted = cur.rowcount

        conn.commit()
        cur.close()
        conn.close()

        if deleted == 0:
            return jsonify({'error': 'Mesociclo no encontrado'}), 404

        return jsonify({'message': 'Mesociclo eliminado'}), 200

    except Exception as e:
        print("Error en borrar_mesociclo:", e)
        return jsonify({'error': 'Error al eliminar el mesociclo'}), 500

# ---------- MACRO CICLOS ----------

@app.route('/macrociclos/<int:macro_id>', methods=['GET'])
@requires_roles('admin', 'entrenador')
def obtener_macrociclo(current_user, macro_id):
    """
    Detalle de macrociclo, con sus mesociclos.
    """
    try:
        macro = query_db(
            "SELECT id, nombre, objetivo_general, creador_id FROM macrociclos WHERE id = ?",
            (macro_id,),
            one=True
        )
        if not macro:
            return jsonify({'error': 'Macrociclo no encontrado'}), 404
        if current_user["rol"] == "entrenador":
            creador = macro.get("creador_id") if isinstance(macro, dict) else None
            if creador not in (None, current_user["id"]):
                return jsonify({'error': 'No tienes permiso para ver este macrociclo'}), 403

        filas = query_db(
            """
            SELECT mm.id,
                   mm.mesociclo_id,
                   m.nombre AS mesociclo_nombre,
                   mm.orden,
                   mm.notas
            FROM macrociclos_mesociclos mm
            LEFT JOIN mesociclos m ON m.id = mm.mesociclo_id
            WHERE mm.macrociclo_id = ?
            ORDER BY mm.orden, mm.id
            """,
            (macro_id,)
        )

        data = dict(macro)
        data['mesociclos'] = [dict(f) for f in filas]
        return jsonify(data), 200

    except Exception as e:
        print("Error en obtener_macrociclo:", e)
        return jsonify({'error': 'Error al obtener el macrociclo'}), 500

@app.route('/macrociclos', methods=['GET'])
@requires_roles('admin', 'entrenador')
def listar_macrociclos(current_user):
    try:
        where = ""
        params = []
        if current_user["rol"] == "entrenador":
            where = "WHERE creador_id = ? OR creador_id IS NULL"
            params.append(current_user["id"])

        filas = query_db(
            f"SELECT id, nombre, objetivo_general FROM macrociclos {where} ORDER BY id DESC",
            tuple(params)
        )
        return jsonify([dict(f) for f in filas]), 200
    except Exception as e:
        print("Error en listar_macrociclos:", e)
        return jsonify({'error': 'Error al obtener macrociclos'}), 500

@app.route('/macrociclos', methods=['POST'])
@requires_roles('admin', 'entrenador')
def crear_macrociclo(current_user):
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    objetivo_general = (data.get('objetivo_general') or '').strip() or None
    mesociclos = data.get('mesociclos') or []

    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400
    if not mesociclos:
        return jsonify({'error': 'Añade al menos un mesociclo'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()

        cur.execute(
            "INSERT INTO macrociclos (nombre, objetivo_general, creador_id) VALUES (?, ?, ?)",
            (nombre, objetivo_general, current_user["id"])
        )
        macro_id = cur.lastrowid

        for m in mesociclos:
            meso_id = m.get('mesociclo_id')
            orden = int(m.get('orden') or 1)
            notas = m.get('notas')
            if not meso_id:
                continue
            cur.execute(
                """
                INSERT INTO macrociclos_mesociclos (macrociclo_id, mesociclo_id, orden, notas)
                VALUES (?, ?, ?, ?)
                """,
                (macro_id, meso_id, orden, notas)
            )

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({'message': 'Macrociclo creado', 'id': macro_id}), 201

    except Exception as e:
        print("Error en crear_macrociclo:", e)
        return jsonify({'error': 'Error al crear el macrociclo'}), 500

@app.route('/macrociclos/<int:macro_id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def actualizar_macrociclo(current_user, macro_id):
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    objetivo_general = (data.get('objetivo_general') or '').strip() or None
    mesociclos = data.get('mesociclos') or []

    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400
    if not mesociclos:
        return jsonify({'error': 'Añade al menos un mesociclo'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()

        cur.execute("SELECT id, creador_id FROM macrociclos WHERE id = ?", (macro_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({'error': 'Macrociclo no encontrado'}), 404
        if current_user["rol"] == "entrenador":
            creador = row["creador_id"] if isinstance(row, dict) else None
            if creador not in (None, current_user["id"]):
                cur.close()
                conn.close()
                return jsonify({'error': 'No tienes permiso para editar este macrociclo'}), 403

        cur.execute(
            "UPDATE macrociclos SET nombre = ?, objetivo_general = ? WHERE id = ?",
            (nombre, objetivo_general, macro_id)
        )

        cur.execute("DELETE FROM macrociclos_mesociclos WHERE macrociclo_id = ?", (macro_id,))

        for m in mesociclos:
            meso_id = m.get('mesociclo_id')
            orden = int(m.get('orden') or 1)
            notas = m.get('notas')
            if not meso_id:
                continue
            cur.execute(
                """
                INSERT INTO macrociclos_mesociclos (macrociclo_id, mesociclo_id, orden, notas)
                VALUES (?, ?, ?, ?)
                """,
                (macro_id, meso_id, orden, notas)
            )

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({'message': 'Macrociclo actualizado'}), 200

    except Exception as e:
        print("Error en actualizar_macrociclo:", e)
        return jsonify({'error': 'Error al actualizar el macrociclo'}), 500

@app.route('/macrociclos/<int:macro_id>', methods=['DELETE'])
@requires_roles('admin', 'entrenador')
def borrar_macrociclo(current_user, macro_id):
    try:
        conn = get_db()
        cur = conn.cursor()

        # borramos el propio macrociclo (suponiendo ON DELETE CASCADE para la tabla de enlace;
        # si no lo tienes, puedes añadir también un DELETE explícito en macrociclos_mesociclos)
        cur.execute("DELETE FROM macrociclos WHERE id = ?", (macro_id,))
        deleted = cur.rowcount

        conn.commit()
        cur.close()
        conn.close()

        if deleted == 0:
            return jsonify({'error': 'Macrociclo no encontrado'}), 404

        return jsonify({'message': 'Macrociclo eliminado'}), 200

    except Exception as e:
        print("Error en borrar_macrociclo:", e)
        return jsonify({'error': 'Error al eliminar el macrociclo'}), 500

@app.route('/mis_feedbacks', methods=['GET'])
@requires_roles('atleta')
def mis_feedbacks(current_user):
    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT
                f.id,
                f.entrenamiento_asignado_id AS entrenamiento_id,
                f.comentario,
                f.fecha,
                f.leido,
                f.respuesta,
                ea.nombre AS entrenamiento_nombre,
                ea.fecha AS fecha_entreno,
                f.url_datos
            FROM feedbacks f
            LEFT JOIN entrenamientos_asignados ea
                   ON ea.id = f.entrenamiento_asignado_id
            WHERE f.atleta_id = ?
            ORDER BY f.fecha DESC
            """,
            (current_user["id"],),
        )
        rows = cur.fetchall()

        return jsonify([dict(r) for r in rows]), 200

    except Exception as e:
        print("Error en /mis_feedbacks:", e)
        return jsonify({"error": "Error al obtener feedbacks"}), 500
from datetime import datetime

def now_ts():
    return datetime.now().isoformat(" ", "seconds")

def format_date_short(value):
    if not value:
        return ""
    try:
        return datetime.fromisoformat(str(value)).strftime("%d/%m/%Y")
    except ValueError:
        return str(value)

@app.route('/entrenamientos_asignados/<int:entrenamiento_id>/resultados', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_resultados_entrenamiento(current_user, entrenamiento_id):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT ea.atleta_id
            FROM entrenamientos_asignados ea
            WHERE ea.id = ?
        """, (entrenamiento_id,))
        ent = cur.fetchone()

        if not ent:
            return jsonify({'error': 'Entrenamiento no encontrado'}), 404

        if current_user['rol'] == 'atleta' and current_user['id'] != ent['atleta_id']:
            return jsonify({'error': 'No tienes permiso para ver este entrenamiento'}), 403

        cur.execute("""
            SELECT
                paso_detalle_id,
                repeticion,
                tiempo_real_seg
            FROM resultados_entrenamientos
            WHERE entrenamiento_asignado_id = ?
        """, (entrenamiento_id,))
        filas = cur.fetchall()

        cur.execute(
            """
            SELECT km_realizados
            FROM km_realizados_entrenamientos
            WHERE entrenamiento_asignado_id = ?
            """,
            (entrenamiento_id,)
        )
        km_row = cur.fetchone()
        km_real_total = km_row["km_realizados"] if km_row else None

        payload = []
        for f in filas:
            d = dict(f)
            if km_real_total is not None:
                d["km_realizados_total"] = km_real_total
            payload.append(d)

        # Si no hay filas de intervalos pero tenemos kms totales, devolvemos un registro simple
        if not payload and km_real_total is not None:
            payload.append({"km_realizados_total": km_real_total})

        return jsonify(payload), 200
    except Exception as e:
        print("Error al obtener resultados del entrenamiento:", e)
        return jsonify({'error': 'No se pudieron obtener los resultados'}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/entrenamientos_asignados/<int:entrenamiento_id>/resultados', methods=['POST'])
@requires_roles('atleta')
def guardar_resultados_series(current_user, entrenamiento_id):
    """
    Guarda los tiempos reales de las series de un entrenamiento asignado
    y calcula los km realizados a partir de la distancia del paso en
    entrenamientos_asignados_detalle.
    """

    data = request.get_json(silent=True) or {}

    if isinstance(data, dict):
        resultados = data.get("series") or data.get("resultados") or []
        km_real_total = data.get("km_realizados")
    else:
        resultados = data
        km_real_total = None

    if not isinstance(resultados, list):
        return jsonify({"error": "No se han recibido resultados válidos."}), 400

    user_data = dict(current_user) if isinstance(current_user, sqlite3.Row) else current_user

    conn = get_db()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Garantizamos tabla simple para guardar km totales por entrenamiento asignado
    try:
        if DB_ENGINE == "mariadb":
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS km_realizados_entrenamientos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    entrenamiento_asignado_id INT UNIQUE,
                    km_planificados DOUBLE,
                    km_realizados DOUBLE,
                    fecha DATETIME NOT NULL,
                    CONSTRAINT fk_km_entrenamiento
                        FOREIGN KEY (entrenamiento_asignado_id)
                        REFERENCES entrenamientos_asignados(id)
                        ON DELETE CASCADE
                )
                """
            )
        else:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS km_realizados_entrenamientos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entrenamiento_asignado_id INTEGER UNIQUE,
                    km_planificados REAL,
                    km_realizados REAL,
                    fecha TEXT
                )
                """
            )
    except Exception as e:
        print("Aviso: no se pudo asegurar la tabla km_realizados_entrenamientos", e)

    # ---------------- Comprobar que el entrenamiento pertenece al atleta actual ----------------
    cur.execute(
        """
        SELECT ea.id, ea.atleta_id, ea.km_previstos, ea.fecha
        FROM entrenamientos_asignados ea
        WHERE ea.id = ?
        """,
        (entrenamiento_id,)
    )
    atleta = cur.fetchone()

    if not atleta:
        return jsonify({"error": "Entrenamiento asignado no encontrado."}), 404

    km_previstos_asignado = None
    try:
        km_previstos_asignado = atleta["km_previstos"]
    except Exception:
        km_previstos_asignado = None

    # Si tienes current_user["atleta_id"] o similar, comprueba propiedad
    atleta_id_usuario = user_data.get("atleta_id")
    if atleta_id_usuario and atleta["atleta_id"] != atleta_id_usuario:
        return jsonify({"error": "No tienes permiso para modificar este entrenamiento."}), 403

    # ---------------- Cache de pasos para saber distancia ----------------
    pasos_cache = {}

    def obtener_km_para_paso(paso_id: int) -> float:
        """
        Devuelve los km correspondientes al paso_detalle indicado,
        según objetivo_tipo/valor/unidad en entrenamientos_asignados_detalle.
        """
        if paso_id in pasos_cache:
            return pasos_cache[paso_id]

        cur.execute(
            """
            SELECT objetivo_tipo, objetivo_valor, unidad
            FROM entrenamientos_asignados_detalle
            WHERE id = ?
            """,
            (paso_id,)
        )
        row = cur.fetchone()

        km = 0.0
        if row:
            objetivo_tipo = (row["objetivo_tipo"] or "").lower()
            unidad = (row["unidad"] or "").lower()
            valor = row["objetivo_valor"] or 0

            if objetivo_tipo in ("distancia", "distance") and valor:
                if unidad in ("m", "metro", "metros"):
                    km = float(valor) / 1000.0
                elif unidad in ("km", "kilometro", "kilometros", "kilómetros"):
                    km = float(valor)

        pasos_cache[paso_id] = km
        return km

    # ---------------- Borramos resultados anteriores de este entrenamiento ----------------
    cur.execute(
        "DELETE FROM resultados_entrenamientos WHERE entrenamiento_asignado_id = ?",
        (entrenamiento_id,)
    )

    # ---------------- Insertamos nuevos resultados ----------------
    now_ts = datetime.utcnow().isoformat(timespec="seconds")

    try:
        km_real_total = float(km_real_total)
    except (TypeError, ValueError):
        km_real_total = None
    if km_real_total is not None and km_real_total < 0:
        km_real_total = None

    registros = []
    total_plan_km = 0.0

    for item in resultados or []:
        paso_id = item.get("repeticion_id") or item.get("paso_detalle_id")
        tiempo_real_seg = item.get("tiempo_real_seg")

        # Si no hay paso, asumimos que es un entrenamiento sin intervalos; se manejará más abajo
        if not paso_id:
            continue

        repeticion = item.get("repeticion", 1)
        km_plan = obtener_km_para_paso(paso_id)
        total_plan_km += km_plan

        # Si no hay tiempo, igual permitimos guardar km para bloques simples
        if tiempo_real_seg is None:
            tiempo_real_seg = None

        registros.append(
            {
                "paso_id": paso_id,
                "tiempo_real_seg": tiempo_real_seg,
                "repeticion": repeticion,
                "km_plan": km_plan,
            }
        )

    km_real_total_val = km_real_total if isinstance(km_real_total, (int, float)) else None

    # Si hay registros por paso, no escalamos: usamos los km planificados por paso.
    # El total de km_real_total se usa solo para el resumen de kms (tabla km_realizados_entrenamientos).
    if registros:
        factor = 1.0
    else:
        factor = 1.0
        if km_real_total_val is not None and total_plan_km > 0:
            factor = km_real_total_val / total_plan_km

    km_plan_total = total_plan_km if total_plan_km > 0 else None
    km_real_suma = 0.0

    cur.execute(
        """
        SELECT id FROM entrenamientos_asignados_detalle
        WHERE entrenamiento_asignado_id = ?
        ORDER BY orden, id
        LIMIT 1
        """,
        (entrenamiento_id,)
    )
    paso_fallback_row = cur.fetchone()
    paso_fallback_id = paso_fallback_row["id"] if paso_fallback_row else None

    for registro in registros:
        km_realizados = (
            registro["km_plan"] * factor
            if km_real_total_val is not None
            else registro["km_plan"]
        )
        km_real_suma += km_realizados

        cur.execute(
            """
            INSERT INTO resultados_entrenamientos (
                entrenamiento_asignado_id,
                paso_detalle_id,
                repeticion,
                tiempo_real_seg,
                fecha
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                entrenamiento_id,
                registro["paso_id"] or paso_fallback_id,
                registro["repeticion"],
                registro["tiempo_real_seg"],
                now_ts,
            ),
        )

    # Guardar km totales en tabla dedicada (para consultas simples)
    km_total_guardar = None
    if km_real_total is not None and isinstance(km_real_total, (int, float)):
        km_total_guardar = float(km_real_total)
    elif km_real_suma > 0:
        km_total_guardar = km_real_suma

    if km_total_guardar is not None:
        fecha_entrenamiento = None
        try:
            fecha_entrenamiento = atleta["fecha"]
        except Exception:
            fecha_entrenamiento = None
        if not fecha_entrenamiento:
            cur.execute(
                "SELECT fecha FROM entrenamientos_asignados WHERE id = ?",
                (entrenamiento_id,)
            )
            fila_fecha = cur.fetchone()
            if fila_fecha:
                try:
                    fecha_entrenamiento = fila_fecha["fecha"]
                except Exception:
                    fecha_entrenamiento = None
        upsert_km_realizados(
            cur,
            entrenamiento_id,
            float(km_plan_total) if isinstance(km_plan_total, (int, float)) else km_previstos_asignado,
            km_total_guardar,
            fecha_entrenamiento or now_ts,
        )

    conn.commit()

    return jsonify({"status": "ok"}), 200

@app.route('/')
def index():
    return redirect(url_for('static', filename='login.html'))


def format_segundos(seg):
    if seg is None:
        return ""
    seg = float(seg)
    if seg <= 0:
        return ""
    minutos = int(seg // 60)
    restantes = int(seg % 60)
    return f"{minutos}:{str(restantes).zfill(2)}"


@app.route('/estadisticas/entrenador/atletas', methods=['GET'])
@app.route('/atletas/estadisticas', methods=['GET'])
@requires_roles('entrenador', 'admin')
def estadisticas_listar_atletas(current_user):
    try:
        filas = query_db("""
            SELECT id, nombre, apellidos, email
            FROM usuarios
            WHERE rol = 'atleta'
            ORDER BY nombre
        """)
        return jsonify([dict(f) for f in filas]), 200
    except Exception as e:
        print("Error al listar atletas:", e)
        return jsonify({"error": "No se pudieron obtener los atletas."}), 500

@app.route('/estadisticas/entrenador/atletas/<int:atleta_id>/analisis', methods=['GET'])
@app.route('/atletas/<int:atleta_id>/analisis', methods=['GET'])
@app.route('/analisis/atleta/<int:atleta_id>', methods=['GET'])
@app.route('/analisis_atleta/<int:atleta_id>', methods=['GET'])  # alias adicional
@requires_roles('entrenador', 'admin', 'atleta')
def estadisticas_analisis_atleta(current_user, atleta_id):
    try:
        # Normalizamos current_user a diccionario
        user = current_user if isinstance(current_user, dict) else dict(current_user)

        # 1) Datos del atleta
        atleta = query_db("""
            SELECT id, nombre, apellidos, entrenador_id, rol
            FROM usuarios
            WHERE id = ?
        """, (atleta_id,), one=True)

        if not atleta or atleta["rol"] != "atleta":
            return jsonify({"error": "Atleta no encontrado"}), 404

        # Comprobación de permisos: el entrenador solo ve a sus atletas
        if user.get('rol') == 'entrenador' and atleta['entrenador_id'] not in (None, user['id']):
            return jsonify(
                {'error': 'No tienes permiso para ver las estadísticas de este atleta'}
            ), 403

        # 2) Totales de sesiones
        total_plan = query_db("""
            SELECT COUNT(*) AS total
            FROM entrenamientos_asignados
            WHERE atleta_id = ?
        """, (atleta_id,), one=True)["total"]

        total_con_registro = query_db("""
            SELECT COUNT(DISTINCT ea.id) AS total
            FROM entrenamientos_asignados ea
            JOIN resultados_entrenamientos re
              ON re.entrenamiento_asignado_id = ea.id
            WHERE ea.atleta_id = ?
        """, (atleta_id,), one=True)["total"]

        if DB_ENGINE == "mariadb":
            total_sin_registro = query_db("""
                SELECT COUNT(*) AS total
                FROM entrenamientos_asignados ea
                WHERE ea.atleta_id = ?
                  AND DATE(ea.fecha) <= CURDATE()
                  AND NOT EXISTS (
                    SELECT 1
                    FROM resultados_entrenamientos re
                    WHERE re.entrenamiento_asignado_id = ea.id
                  )
            """, (atleta_id,), one=True)["total"]

            lunes_plan = "DATE_SUB(DATE(ea.fecha), INTERVAL WEEKDAY(ea.fecha) DAY)"
            base_real = "COALESCE(kre.fecha, ea.fecha)"
            lunes_real = f"DATE_SUB(DATE({base_real}), INTERVAL WEEKDAY({base_real}) DAY)"

            plan_rows = query_db(f"""
                SELECT
                  {lunes_plan} AS lunes_semana,
                  SUM(
                    COALESCE(kre.km_planificados, ea.km_previstos, 0)
                  ) AS km_planificados
                FROM entrenamientos_asignados ea
                LEFT JOIN km_realizados_entrenamientos kre
                  ON kre.entrenamiento_asignado_id = ea.id
                WHERE ea.atleta_id = ?
                GROUP BY lunes_semana
                ORDER BY lunes_semana
            """, (atleta_id,))

            real_rows = query_db(f"""
                SELECT
                  {lunes_real} AS lunes_semana,
                  SUM(COALESCE(kre.km_realizados, 0)) AS km_realizados
                FROM km_realizados_entrenamientos kre
                JOIN entrenamientos_asignados ea
                  ON ea.id = kre.entrenamiento_asignado_id
                WHERE ea.atleta_id = ?
                GROUP BY lunes_semana
                ORDER BY lunes_semana
            """, (atleta_id,))
        else:
            total_sin_registro = query_db("""
                SELECT COUNT(*) AS total
                FROM entrenamientos_asignados ea
                WHERE ea.atleta_id = ?
                  AND DATE(ea.fecha) <= DATE('now')
                  AND NOT EXISTS (
                    SELECT 1
                    FROM resultados_entrenamientos re
                    WHERE re.entrenamiento_asignado_id = ea.id
                  )
            """, (atleta_id,), one=True)["total"]

            # 3) Kms por semana (lunes–domingo) usando km_realizados_entrenamientos
            # Kms planificados: usamos km_previstos de entrenamientos_asignados,
            # y si existe fila en km_realizados_entrenamientos usamos también su km_planificados
            plan_rows = query_db("""
                SELECT
                  date(ea.fecha, 'weekday 1', '-7 days') AS lunes_semana,
                  SUM(
                    COALESCE(kre.km_planificados, ea.km_previstos, 0)
                  ) AS km_planificados
                FROM entrenamientos_asignados ea
                LEFT JOIN km_realizados_entrenamientos kre
                  ON kre.entrenamiento_asignado_id = ea.id
                WHERE ea.atleta_id = ?
                GROUP BY lunes_semana
                ORDER BY lunes_semana
            """, (atleta_id,))

            # Kms realizados: solo de km_realizados_entrenamientos
            real_rows = query_db("""
                SELECT
                  date(COALESCE(kre.fecha, ea.fecha), 'weekday 1', '-7 days') AS lunes_semana,
                  SUM(COALESCE(kre.km_realizados, 0)) AS km_realizados
                FROM km_realizados_entrenamientos kre
                JOIN entrenamientos_asignados ea
                  ON ea.id = kre.entrenamiento_asignado_id
                WHERE ea.atleta_id = ?
                GROUP BY lunes_semana
                ORDER BY lunes_semana
            """, (atleta_id,))

        plan_dict = {
            row["lunes_semana"]: round(row["km_planificados"] or 0, 2)
            for row in plan_rows
            if row["lunes_semana"]
        }
        real_dict = {
            row["lunes_semana"]: round(row["km_realizados"] or 0, 2)
            for row in real_rows
            if row["lunes_semana"]
        }

        semanas = sorted(set(plan_dict.keys()) | set(real_dict.keys()))

        def build_label(lunes_str: str) -> str:
            """
            lunes_str: 'YYYY-MM-DD' (lunes de la semana)
            Devuelve algo tipo: 'Sem 41 · 06/10–12/10'
            """
            try:
                lunes = datetime.strptime(lunes_str, "%Y-%m-%d").date()
                domingo = lunes + timedelta(days=6)
                iso_year, iso_week, _ = lunes.isocalendar()
                return f"Sem {iso_week} · {lunes.strftime('%d/%m')}–{domingo.strftime('%d/%m')}"
            except Exception:
                return lunes_str

        kms_semana = [
            {
                "semana": lunes_str,  # clave interna (lunes)
                "label": build_label(lunes_str),
                "planificados": plan_dict.get(lunes_str, 0.0),
                "realizados": real_dict.get(lunes_str, 0.0)
            }
            for lunes_str in semanas
        ]

        # 4) Resumen por tipo de entrenamiento (tu parte original)
        tipos = query_db("""
            SELECT
                ea.entrenamiento_id,
                COALESCE(e.nombre, ea.nombre) AS nombre,
                COUNT(*) AS asignaciones
            FROM entrenamientos_asignados ea
            LEFT JOIN entrenamientos e ON e.id = ea.entrenamiento_id
            WHERE ea.atleta_id = ?
            GROUP BY ea.entrenamiento_id, COALESCE(e.nombre, ea.nombre)
            ORDER BY nombre
        """, (atleta_id,))

        tipos_resumen = []
        for tipo in tipos:
            entrenamiento_id = tipo["entrenamiento_id"]

            if entrenamiento_id is None:
                comp_query = """
                    SELECT ea.id, ea.fecha, AVG(re.tiempo_real_seg) AS promedio_real
                    FROM entrenamientos_asignados ea
                    JOIN resultados_entrenamientos re
                      ON re.entrenamiento_asignado_id = ea.id
                    WHERE ea.atleta_id = ?
                      AND ea.entrenamiento_id IS NULL
                      AND ea.nombre = ?
                    GROUP BY ea.id, ea.fecha
                    ORDER BY ea.fecha
                """
                comp_params = (atleta_id, tipo["nombre"])
            else:
                comp_query = """
                    SELECT ea.id, ea.fecha, AVG(re.tiempo_real_seg) AS promedio_real
                    FROM entrenamientos_asignados ea
                    JOIN resultados_entrenamientos re
                      ON re.entrenamiento_asignado_id = ea.id
                    WHERE ea.atleta_id = ?
                      AND ea.entrenamiento_id = ?
                    GROUP BY ea.id, ea.fecha
                    ORDER BY ea.fecha
                """
                comp_params = (atleta_id, entrenamiento_id)

            comparativas = query_db(comp_query, comp_params)

            tipos_resumen.append({
                "entrenamiento_id": entrenamiento_id,
                "nombre": tipo["nombre"],
                "asignaciones": tipo["asignaciones"],
                "comparativas": [
                    {
                        "fecha": fila["fecha"],
                        "fecha_texto": format_date_short(fila["fecha"]),
                        "tiempo_real_seg": fila["promedio_real"],
                        "tiempo_real_texto": format_segundos(fila["promedio_real"])
                    }
                    for fila in comparativas
                    if fila["promedio_real"] is not None
                ]
            })

        respuesta = {
            "atleta": {
                "id": atleta["id"],
                "nombre": atleta["nombre"],
                "apellidos": atleta["apellidos"],
            },
            "totales": {
                "planificados": total_plan,
                "con_registro": total_con_registro,
                "sin_registro": total_sin_registro
            },
            "kms_semana": kms_semana,
            "tipos": tipos_resumen
        }
        return jsonify(respuesta), 200

    except Exception as e:
        print("Error en análisis de atleta:", e)
        return jsonify({"error": "No se pudieron obtener las estadísticas."}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
