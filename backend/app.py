from flask import Flask, jsonify, request, session
from flask import redirect, url_for
from flask_cors import CORS
from flask_session import Session
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import os
import hashlib
from werkzeug.utils import secure_filename
import secrets
import sqlite3

try:
    import mariadb  # type: ignore
except ImportError:  # El paquete se instala sólo cuando se usa MariaDB
    mariadb = None

try:
    import pymysql  # type: ignore
except ImportError:
    pymysql = None

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
app.config["SESSION_COOKIE_SECURE"] = os.getenv("SESSION_COOKIE_SECURE", "0") in ("1", "true", "True")
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
elif pymysql:
    DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError, pymysql.IntegrityError)


def ensure_meta_columns():
    """
    Asegura columnas de propietario (creador_id) y extras (force_password_change, url_datos).
    """
    tablas_owner = ("entrenamientos", "microciclos", "mesociclos", "macrociclos")
    feedback_columns = (
        ("rpe", "INT", "INTEGER"),
        ("sensacion", "VARCHAR(20)", "TEXT"),
        ("fatiga", "VARCHAR(20)", "TEXT"),
        ("dolor", "TINYINT", "INTEGER"),
        ("zona_dolor", "VARCHAR(50)", "TEXT"),
        ("completado", "TINYINT", "INTEGER"),
    )
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
            for col, col_type in (
                ("vdot_val", "DOUBLE"),
                ("vdot_fecha", "DATE"),
                ("vdot_distancia_m", "DOUBLE"),
                ("vdot_tiempo_seg", "INT"),
            ):
                try:
                    cur.execute(f"ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS {col} {col_type}")
                except Exception:
                    pass
            try:
                cur.execute("ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS url_datos TEXT")
            except Exception:
                pass
            for nombre, tipo_mariadb, _ in feedback_columns:
                try:
                    default_clause = "DEFAULT 0" if nombre == "dolor" else ("DEFAULT 1" if nombre == "completado" else "")
                    cur.execute(f"ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS {nombre} {tipo_mariadb} {default_clause}")
                except Exception:
                    pass
            
            for col in ("fc_z1", "fc_z2", "fc_z3", "fc_z4", "fc_z5", "fc_z6", "metodo"):
                try:
                    tipo = "VARCHAR(20)" if col == "metodo" else "DOUBLE"
                    cur.execute(f"ALTER TABLE zonas_entrenamiento ADD COLUMN IF NOT EXISTS {col} {tipo}")
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

            for col, col_type in (
                ("vdot_val", "REAL"),
                ("vdot_fecha", "TEXT"),
                ("vdot_distancia_m", "REAL"),
                ("vdot_tiempo_seg", "INTEGER"),
            ):
                if not column_exists("usuarios", col):
                    try:
                        cur.execute(f"ALTER TABLE usuarios ADD COLUMN {col} {col_type}")
                    except Exception:
                        pass

            if not column_exists("feedbacks", "url_datos"):
                try:
                    cur.execute("ALTER TABLE feedbacks ADD COLUMN url_datos TEXT")
                except Exception:
                    pass
            for nombre, _, tipo_sqlite in feedback_columns:
                if not column_exists("feedbacks", nombre):
                    try:
                        default_clause = "DEFAULT 0" if nombre == "dolor" else ("DEFAULT 1" if nombre == "completado" else "")
                        cur.execute(f"ALTER TABLE feedbacks ADD COLUMN {nombre} {tipo_sqlite} {default_clause}".strip())
                    except Exception:
                        pass

            
            # Zonas FC + método
            for col in ("fc_z1", "fc_z2", "fc_z3", "fc_z4", "fc_z5", "fc_z6", "metodo"):
                if not column_exists("zonas_entrenamiento", col):
                    try:
                        col_type = "TEXT" if col == "metodo" else "REAL"
                        cur.execute(f"ALTER TABLE zonas_entrenamiento ADD COLUMN {col} {col_type}")
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

class PyMySQLCursorWrapper:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, query, args=None):
        if args is not None:
            query = query.replace('?', '%s')
        return self._cursor.execute(query, args)

    def executemany(self, query, args=None):
        if args is not None:
            query = query.replace('?', '%s')
        return self._cursor.executemany(query, args)

    def __getattr__(self, name):
        return getattr(self._cursor, name)


class PyMySQLConnectionWrapper:
    def __init__(self, conn):
        object.__setattr__(self, '_conn', conn)
        object.__setattr__(self, '_row_factory', None)

    def cursor(self):
        return PyMySQLCursorWrapper(self._conn.cursor())

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def __setattr__(self, name, value):
        if name in ('_conn', '_row_factory'):
            object.__setattr__(self, name, value)
        elif name == 'row_factory':
            object.__setattr__(self, '_row_factory', value)
        else:
            setattr(self._conn, name, value)



def get_db():
    """
    Devuelve una conexión según el motor configurado (MariaDB por defecto).
    """
    if DB_ENGINE == "mariadb":
        if mariadb:
            conn = mariadb.connect(**MARIADB_CONFIG)
            conn.autocommit = False
            return MariaDBConnectionWrapper(conn)
        if pymysql:
            conn = pymysql.connect(
                host=MARIADB_CONFIG["host"],
                port=MARIADB_CONFIG["port"],
                user=MARIADB_CONFIG["user"],
                password=MARIADB_CONFIG["password"],
                database=MARIADB_CONFIG["database"],
                cursorclass=pymysql.cursors.DictCursor,
            )
            conn.autocommit(False)
            return PyMySQLConnectionWrapper(conn)
        raise RuntimeError("DB_ENGINE=mariadb pero no hay driver instalado (mariadb o pymysql)")

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
            try:
                conn.execute("PRAGMA foreign_keys = OFF;")
            except Exception:
                pass
            conn.executescript(script)
            try:
                conn.execute("PRAGMA foreign_keys = ON;")
            except Exception:
                pass
        else:
            cur = conn.cursor()
            try:
                cur.execute("SET FOREIGN_KEY_CHECKS=0;")
            except Exception:
                pass
            statements = [s.strip() for s in script.split(";") if s.strip()]
            for stmt in statements:
                cur.execute(stmt)
            try:
                cur.execute("SET FOREIGN_KEY_CHECKS=1;")
            except Exception:
                pass
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
# ensure_v2_tables()  # disabled: defined later

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
            SELECT u.id, u.nombre, u.apellidos, u.email, u.foto_url, u.telefono,
                   u.fecha_nacimiento, u.categoria, u.grupo, u.subgrupo, u.entrenador_id, u.rol,
                   u.vdot_val, u.vdot_fecha, u.vdot_distancia_m, u.vdot_tiempo_seg
            FROM usuarios u
            WHERE u.id = ?
        '''
        resultado = query_db(query, (atleta_id,), one=True)
        if not resultado:
            return jsonify({'error': 'Atleta no encontrado'}), 404

        # Si es entrenador, solo puede ver sus atletas
        if current_user["rol"] == "entrenador":
            ent_id = resultado.get("entrenador_id") if isinstance(resultado, dict) else None
            if ent_id != current_user["id"]:
                return jsonify({'error': 'No tienes permiso para ver este atleta'}), 403

        return jsonify(dict(resultado)), 200
    except Exception as e:
        print("Error al obtener perfil del atleta:", e)
        return jsonify({'error': 'No se pudo obtener el perfil'}), 500



@app.route('/atletas/<int:atleta_id>/vdot', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_vdot_atleta(current_user, atleta_id):
    atleta = query_db(
        "SELECT id, rol, entrenador_id, vdot_val, vdot_fecha, vdot_distancia_m, vdot_tiempo_seg FROM usuarios WHERE id = ?",
        (atleta_id,),
        one=True,
    )
    if not atleta or atleta.get('rol') != 'atleta':
        return jsonify({'error': 'Atleta no encontrado'}), 404

    if current_user['rol'] == 'atleta' and current_user['id'] != atleta_id:
        return jsonify({'error': 'Acceso no autorizado'}), 403
    if current_user['rol'] == 'entrenador' and atleta.get('entrenador_id') not in (None, current_user['id']):
        return jsonify({'error': 'No tienes permiso'}), 403

    return jsonify({
        'atleta_id': atleta_id,
        'vdot_val': atleta.get('vdot_val'),
        'vdot_fecha': atleta.get('vdot_fecha'),
        'vdot_distancia_m': atleta.get('vdot_distancia_m'),
        'vdot_tiempo_seg': atleta.get('vdot_tiempo_seg'),
    }), 200




@app.route('/atletas/<int:atleta_id>/vdot/historial', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_historial_vdot(current_user, atleta_id):
    atleta = query_db(
        "SELECT id, rol, entrenador_id FROM usuarios WHERE id = ?",
        (atleta_id,),
        one=True,
    )
    if not atleta or atleta.get('rol') != 'atleta':
        return jsonify({'error': 'Atleta no encontrado'}), 404
    if current_user['rol'] == 'atleta' and current_user['id'] != atleta_id:
        return jsonify({'error': 'Acceso no autorizado'}), 403
    if current_user['rol'] == 'entrenador' and atleta.get('entrenador_id') not in (None, current_user['id']):
        return jsonify({'error': 'No tienes permiso'}), 403

    filas = query_db(
        "SELECT vdot_val, vdot_fecha, vdot_distancia_m, vdot_tiempo_seg, created_at FROM vdot_historial WHERE atleta_id = ? ORDER BY created_at DESC",
        (atleta_id,),
    )
    return jsonify([dict(f) for f in filas]), 200

@app.route('/atletas/<int:atleta_id>/vdot', methods=['POST'])
@requires_roles('admin', 'entrenador', 'atleta')
def guardar_vdot_atleta(current_user, atleta_id):
    data = request.get_json(silent=True) or {}
    try:
        vdot_val = float(data.get('vdot_val')) if data.get('vdot_val') is not None else None
    except Exception:
        vdot_val = None
    try:
        distancia_m = float(data.get('vdot_distancia_m')) if data.get('vdot_distancia_m') is not None else None
    except Exception:
        distancia_m = None
    try:
        tiempo_seg = int(float(data.get('vdot_tiempo_seg'))) if data.get('vdot_tiempo_seg') is not None else None
    except Exception:
        tiempo_seg = None
    fecha = (data.get('vdot_fecha') or '').strip() or None

    if vdot_val is None:
        return jsonify({'error': 'VDOT inválido'}), 400

    atleta = query_db(
        "SELECT id, rol, entrenador_id FROM usuarios WHERE id = ?",
        (atleta_id,),
        one=True,
    )
    if not atleta or atleta.get('rol') != 'atleta':
        return jsonify({'error': 'Atleta no encontrado'}), 404

    if current_user['rol'] == 'atleta' and current_user['id'] != atleta_id:
        return jsonify({'error': 'Acceso no autorizado'}), 403
    if current_user['rol'] == 'entrenador' and atleta.get('entrenador_id') not in (None, current_user['id']):
        return jsonify({'error': 'No tienes permiso'}), 403

    execute_db(
        "UPDATE usuarios SET vdot_val = ?, vdot_fecha = ?, vdot_distancia_m = ?, vdot_tiempo_seg = ? WHERE id = ?",
        (vdot_val, fecha, distancia_m, tiempo_seg, atleta_id),
    )

    try:
        execute_db(
            "INSERT INTO vdot_historial (atleta_id, vdot_val, vdot_fecha, vdot_distancia_m, vdot_tiempo_seg) VALUES (?, ?, ?, ?, ?)",
            (atleta_id, vdot_val, fecha, distancia_m, tiempo_seg),
        )
    except Exception:
        pass

    return jsonify({'message': 'VDOT guardado', 'vdot_val': vdot_val}), 200


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


@app.route('/perfil_atleta/<int:atleta_id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def actualizar_perfil_atleta(current_user, atleta_id):
    data = request.get_json(silent=True) or {}
    nombre = (data.get("nombre") or "").strip()
    apellidos = (data.get("apellidos") or "").strip()
    email = (data.get("email") or "").strip()
    telefono = (data.get("telefono") or "").strip() or None
    fecha_nacimiento = (data.get("fecha_nacimiento") or "").strip() or None
    categoria = (data.get("categoria") or "").strip() or None
    grupo = (data.get("grupo") or "").strip() or None
    subgrupo = (data.get("subgrupo") or "").strip() or None

    if not nombre or not apellidos or not email:
        return jsonify({"error": "Nombre, apellidos y email son obligatorios"}), 400

    atleta = query_db(
        "SELECT id, rol, entrenador_id FROM usuarios WHERE id = ?",
        (atleta_id,),
        one=True,
    )
    if not atleta or (atleta.get("rol") if isinstance(atleta, dict) else None) != "atleta":
        return jsonify({"error": "Atleta no encontrado"}), 404

    if current_user["rol"] == "entrenador":
        entrenador_id = atleta.get("entrenador_id") if isinstance(atleta, dict) else None
        if entrenador_id != current_user["id"]:
            return jsonify({"error": "No tienes permiso para editar este atleta"}), 403

    existente = query_db(
        "SELECT id FROM usuarios WHERE email = ? AND id != ?",
        (email, atleta_id),
        one=True,
    )
    if existente:
        return jsonify({"error": "Ese correo ya está en uso"}), 409

    try:
        execute_db(
            """
            UPDATE usuarios
            SET nombre = ?, apellidos = ?, email = ?, telefono = ?, fecha_nacimiento = ?,
                categoria = ?, grupo = ?, subgrupo = ?
            WHERE id = ?
            """,
            (
                nombre,
                apellidos,
                email,
                telefono,
                fecha_nacimiento,
                categoria,
                grupo,
                subgrupo,
                atleta_id,
            ),
        )
        return jsonify({"message": "Perfil de atleta actualizado"}), 200
    except Exception as e:
        print("Error al actualizar perfil de atleta:", e)
        return jsonify({"error": "No se pudo actualizar el perfil del atleta"}), 500

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
    nombre_override=None,
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
        nombre_final = nombre_override if nombre_override else entrenamiento["nombre"]

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
                nombre_final,
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


def asignar_entrenamiento_a_atletas(
    *,
    fecha,
    entrenamiento_id,
    atletas_ids,
    visible=1,
    nombre=None,
):
    """
    Asigna un entrenamiento base a múltiples atletas usando el flujo unificado
    (clona cabecera + pasos).
    """
    if not fecha or not entrenamiento_id or not atletas_ids:
        raise ValueError("Faltan datos para asignar entrenamiento")

    creados = []
    for atleta_id in atletas_ids:
        asignado_id = clonar_entrenamiento_para_atleta(
            fecha=fecha,
            entrenamiento_id=entrenamiento_id,
            atleta_id=atleta_id,
            meta={
                "ciclo_tipo": None,
                "ciclo_id": None,
                "macrociclo_id": None,
                "mesociclo_id": None,
                "microciclo_id": None,
            },
            visible=visible,
            nombre_override=nombre,
        )
        creados.append(asignado_id)

    return creados


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
    atletas_ids = data.get('atletas_ids') or data.get('atletas') or []
    entrenamiento_id = data.get('entrenamiento_id')
    fecha_str = data.get('fecha')
    nombre = (data.get('nombre') or '').strip() or None
    visible_raw = data.get('visible', 0)

    # Normalizar lista de atletas
    if atleta_id is not None and not atletas_ids:
        atletas_ids = [atleta_id]
    atletas_ids = [
        int(a) for a in atletas_ids
        if isinstance(a, (int, str)) and str(a).isdigit()
    ]

    # Validaciones básicas
    try:
        entrenamiento_id = int(entrenamiento_id)
    except (TypeError, ValueError):
        return jsonify({'error': 'entrenamiento_id inválido'}), 400

    if not fecha_str or not atletas_ids:
        return jsonify({'error': 'Faltan fecha o atletas'}), 400

    try:
        # Validar formato de fecha (YYYY-MM-DD)
        datetime.strptime(fecha_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Fecha inválida'}), 400

    visible = 1 if str(visible_raw) in ('1', 'true', 'True') else 0

    try:
        asignados = asignar_entrenamiento_a_atletas(
            fecha=fecha_str,
            entrenamiento_id=entrenamiento_id,
            atletas_ids=atletas_ids,
            visible=visible,
            nombre=nombre,
        )
        return jsonify({
            'message': 'Entrenamiento asignado correctamente',
            'ids': asignados,
            'creados': len(asignados),
        }), 201

    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        print("Error en crear_entrenamiento_asignado:", e)
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

@app.route('/asignar_grupo_entrenamiento', methods=['POST'])
@requires_roles('admin', 'entrenador')
def asignar_grupo_entrenamiento(current_user):
    return (
        jsonify(
            {
                "error": (
                    "Endpoint legado deshabilitado. Usa /asignar_entrenamiento_lote "
                    "con entrenamiento_id y atletas_ids."
                )
            }
        ),
        410,
    )

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
        asignados = asignar_entrenamiento_a_atletas(
            fecha=fecha,
            entrenamiento_id=entrenamiento_id,
            atletas_ids=atletas_ids,
            visible=1,
            nombre=None,
        )

        return jsonify({
            "message": f"Entrenamiento asignado correctamente a {len(asignados)} atletas",
            "creados": len(asignados),
            "ids": asignados,
        }), 200

    except ValueError as ve:
        print("Error en asignar_entrenamiento_lote (validación):", ve)
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        print("Error al asignar entrenamiento por lote:", e)
        return jsonify({"error": "Error interno al asignar entrenamiento"}), 500


def _coerce_bool(value):
    """
    Convierte diferentes representaciones a booleano. Devuelve None si no es interpretable.
    """
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        val = value.strip().lower()
        if val in ("1", "true", "t", "si", "sí", "yes", "y", "on"):
            return True
        if val in ("0", "false", "f", "no", "off", "n"):
            return False
    return None


def validar_feedback(data):
    """
    Valida y normaliza los campos estructurados del feedback.
    """
    if not isinstance(data, dict):
        raise ValueError("Formato de datos inválido")

    rpe_raw = data.get("rpe")
    rpe = None
    if rpe_raw not in (None, "", "null"):
        try:
            rpe = int(rpe_raw)
        except Exception:
            raise ValueError("RPE fuera de rango (1-10)")
        if not (1 <= rpe <= 10):
            raise ValueError("RPE fuera de rango (1-10)")

    dolor_val = _coerce_bool(data.get("dolor"))
    dolor = bool(dolor_val) if dolor_val is not None else False
    zona_dolor = (data.get("zona_dolor") or "").strip()
    if dolor and not zona_dolor:
        raise ValueError("Zona de dolor requerida")

    completado_val = _coerce_bool(data.get("completado"))
    completado = 1 if completado_val is None else int(bool(completado_val))

    sensacion = (data.get("sensacion") or "").strip() or None
    fatiga = (data.get("fatiga") or "").strip() or None

    return {
        "rpe": rpe,
        "sensacion": sensacion,
        "fatiga": fatiga,
        "dolor": 1 if dolor else 0,
        "zona_dolor": zona_dolor or None,
        "completado": completado,
    }


@app.route('/feedback', methods=['POST'])
@requires_roles('atleta')
def enviar_feedback(current_user):
    data = request.get_json(silent=True) or {}
    entrenamiento_id = data.get("entrenamiento_id") or data.get("entrenamiento")
    comentario = (data.get("comentario") or "").strip()
    url_datos = (data.get("url_datos") or "").strip() or None
    atleta_id = current_user['id']

    if not entrenamiento_id:
        return jsonify({"error": "Entrenamiento requerido"}), 400

    try:
        extras = validar_feedback(data)
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM entrenamientos_asignados WHERE id = ? AND atleta_id = ?",
            (entrenamiento_id, atleta_id),
        )
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Entrenamiento no encontrado o no asignado"}), 404

        # Buscar feedback previo para este entrenamiento/atleta
        cur.execute(
            """
            SELECT id
            FROM feedbacks
            WHERE entrenamiento_asignado_id = ? AND atleta_id = ?
            ORDER BY fecha DESC
            LIMIT 1
            """,
            (entrenamiento_id, atleta_id),
        )
        row_prev = cur.fetchone()
        now_str = datetime.utcnow().isoformat(" ", "seconds")
        mensaje = "Feedback enviado correctamente"
        feedback_id = None

        if row_prev:
            feedback_id = row_prev["id"] if isinstance(row_prev, dict) else row_prev[0]
            cur.execute(
                """
                UPDATE feedbacks
                   SET comentario = ?, url_datos = ?, rpe = ?, sensacion = ?, fatiga = ?,
                       dolor = ?, zona_dolor = ?, completado = ?, fecha = ?
                 WHERE id = ?
                """,
                (
                    comentario or "",
                    url_datos,
                    extras["rpe"],
                    extras["sensacion"],
                    extras["fatiga"],
                    extras["dolor"],
                    extras["zona_dolor"],
                    extras["completado"],
                    now_str,
                    feedback_id,
                ),
            )
            mensaje = "Feedback actualizado"
        else:
            cur.execute(
                """
                INSERT INTO feedbacks (
                    entrenamiento_asignado_id, atleta_id, comentario, url_datos,
                    rpe, sensacion, fatiga, dolor, zona_dolor, completado, fecha
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entrenamiento_id,
                    atleta_id,
                    comentario or "",
                    url_datos,
                    extras["rpe"],
                    extras["sensacion"],
                    extras["fatiga"],
                    extras["dolor"],
                    extras["zona_dolor"],
                    extras["completado"],
                    now_str,
                ),
            )
            feedback_id = cur.lastrowid

        # Eliminar duplicados antiguos para este entrenamiento/atleta
        if feedback_id:
            cur.execute(
                """
                DELETE FROM feedbacks
                 WHERE entrenamiento_asignado_id = ?
                   AND atleta_id = ?
                   AND id <> ?
                """,
                (entrenamiento_id, atleta_id, feedback_id),
            )

        # Actualizar sesion_realizada (V2)
        try:
            actualizar_sesion_feedback(
                conn,
                entrenamiento_asignado_id=entrenamiento_id,
                atleta_id=atleta_id,
                comentario=comentario or "",
                rpe=extras["rpe"],
                sensacion=extras["sensacion"],
                fatiga=extras["fatiga"],
                dolor=extras["dolor"],
                zona_dolor=extras["zona_dolor"],
                completado=extras["completado"],
            )
        except Exception as e:
            print("Aviso: no se pudo actualizar sesion_realizada:", e)
        
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"message": mensaje}), 200
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
                f.rpe,
                f.sensacion,
                f.fatiga,
                f.dolor,
                f.zona_dolor,
                f.completado,
                f.fecha,
                CONCAT_WS(' ', u.nombre, u.apellidos) AS atleta,
                COALESCE(ea.nombre, 'Entrenamiento') AS entrenamiento_nombre,
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
        payload = []
        for r in resultados:
            item = dict(r)
            item["fecha"] = _fecha_iso(item.get("fecha"))
            item["fecha_entreno"] = _fecha_iso(item.get("fecha_entreno"))
            payload.append(item)
        return jsonify(payload), 200
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
                   f.entrenamiento_asignado_id,
                   f.rpe, f.sensacion, f.fatiga, f.dolor, f.zona_dolor, f.completado,
                   CONCAT_WS(' ', u.nombre, u.apellidos) AS atleta,
                   COALESCE(ea.nombre, 'Entrenamiento') AS entrenamiento_nombre,
                   ea.fecha AS fecha_entreno,
                   f.url_datos
            FROM feedbacks f
            JOIN usuarios u ON f.atleta_id = u.id
            LEFT JOIN entrenamientos_asignados ea ON f.entrenamiento_asignado_id = ea.id
            WHERE f.id = ? AND u.entrenador_id = ?
        '''
        resultado = query_db(query, (feedback_id, current_user['id']), one=True)
        if resultado:
            data = dict(resultado)
            data["fecha"] = _fecha_iso(data.get("fecha"))
            data["fecha_entreno"] = _fecha_iso(data.get("fecha_entreno"))
            return jsonify(data), 200
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
                kre.km_realizados,
                f.rpe AS feedback_rpe,
                f.sensacion AS feedback_sensacion,
                f.fatiga AS feedback_fatiga,
                f.dolor AS feedback_dolor,
                f.zona_dolor AS feedback_zona_dolor,
                f.completado AS feedback_completado
            FROM resultados_entrenamientos re
            JOIN entrenamientos_asignados ea ON ea.id = re.entrenamiento_asignado_id
            JOIN usuarios u ON u.id = ea.atleta_id
            LEFT JOIN entrenamientos e ON e.id = ea.entrenamiento_id
            LEFT JOIN km_realizados_entrenamientos kre ON kre.entrenamiento_asignado_id = ea.id
            LEFT JOIN feedbacks f
              ON f.id = (
                SELECT id FROM feedbacks fb
                 WHERE fb.entrenamiento_asignado_id = ea.id
                 ORDER BY fb.fecha DESC
                 LIMIT 1
              )
            {where_clause}
            GROUP BY ea.id, ea.fecha, entrenamiento_nombre, u.id, atleta_nombre,
                     kre.km_planificados, kre.km_realizados,
                     f.rpe, f.sensacion, f.fatiga, f.dolor, f.zona_dolor, f.completado
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

            item = {
                "entrenamiento_asignado_id": f["entrenamiento_asignado_id"],
                "fecha": f["fecha"],
                "entrenamiento": f["entrenamiento_nombre"],
                "atleta_id": f["atleta_id"],
                "atleta": atleta_nombre,
                "tiempo_real_seg": f["tiempo_real_seg"],
                "num_series": f["num_series"],
                "km_planificados": f.get("km_planificados"),
                "km_realizados": f.get("km_realizados"),
                "feedback": {
                    "rpe": f.get("feedback_rpe"),
                    "sensacion": f.get("feedback_sensacion"),
                    "fatiga": f.get("feedback_fatiga"),
                    "dolor": f.get("feedback_dolor"),
                    "zona_dolor": f.get("feedback_zona_dolor"),
                    "completado": f.get("feedback_completado"),
                },
            }
            item["alertas"] = generar_alertas_resultado(item)
            resultados.append(item)
        return jsonify(resultados), 200
    except Exception as e:
        print("Error listando resultados de entrenador:", e)
        return jsonify({'error': 'No se pudieron obtener los resultados'}), 500


@app.route('/alertas/entrenador', methods=['GET'])
@requires_roles('entrenador', 'admin')
def listar_alertas_entrenador(current_user):
    """
    Recalcula alertas a partir de los resultados del entrenador y las persiste.
    Luego devuelve las alertas almacenadas.
    """
    refresh = (request.args.get("refresh") or "1").strip().lower()

    try:
        ensure_alertas_table()

        if refresh in ("1", "true", "t", "si", "sí", "yes", "y"):
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
                    kre.km_planificados,
                    kre.km_realizados,
                    f.rpe AS feedback_rpe,
                    f.sensacion AS feedback_sensacion,
                    f.fatiga AS feedback_fatiga,
                    f.dolor AS feedback_dolor,
                    f.zona_dolor AS feedback_zona_dolor
                FROM entrenamientos_asignados ea
                JOIN usuarios u ON u.id = ea.atleta_id
                LEFT JOIN entrenamientos e ON e.id = ea.entrenamiento_id
                LEFT JOIN km_realizados_entrenamientos kre ON kre.entrenamiento_asignado_id = ea.id
                LEFT JOIN feedbacks f
                  ON f.id = (
                    SELECT id FROM feedbacks fb
                     WHERE fb.entrenamiento_asignado_id = ea.id
                     ORDER BY fb.fecha DESC
                     LIMIT 1
                  )
                {where_clause}
                ORDER BY DATE(ea.fecha) DESC, ea.id DESC
                LIMIT 300
            """
            filas = query_db(query, tuple(params))

            conn = get_db()
            try:
                total_persistidas = 0
                for f in filas:
                    atleta_nombre = f["atleta_nombre"]
                    try:
                        atleta_nombre = str(atleta_nombre).strip()
                    except Exception:
                        atleta_nombre = str(atleta_nombre)

                    item = {
                        "entrenamiento_asignado_id": f["entrenamiento_asignado_id"],
                        "fecha": f["fecha"],
                        "entrenamiento": f["entrenamiento_nombre"],
                        "atleta_id": f["atleta_id"],
                        "atleta": atleta_nombre,
                        "km_planificados": f.get("km_planificados"),
                        "km_realizados": f.get("km_realizados"),
                        "feedback": {
                            "rpe": f.get("feedback_rpe"),
                            "sensacion": f.get("feedback_sensacion"),
                            "fatiga": f.get("feedback_fatiga"),
                            "dolor": f.get("feedback_dolor"),
                            "zona_dolor": f.get("feedback_zona_dolor"),
                        },
                    }
                    alertas = generar_alertas_resultado(item)
                    total_persistidas += _persistir_alertas(conn, alertas, item["atleta_id"])
                conn.commit()
            finally:
                conn.close()

        # Devolver alertas persistidas
        filtros = []
        params = []
        if current_user["rol"] == "entrenador":
            filtros.append("u.entrenador_id = ?")
            params.append(current_user["id"])

        tipo_filtro = (request.args.get("tipo") or "").strip().lower()
        activo_filtro = request.args.get("activo")
        if activo_filtro is None or activo_filtro == "":
            activo_filtro = "1"
        if tipo_filtro:
            filtros.append("LOWER(ae.tipo) = ?")
            params.append(tipo_filtro)
        try:
            activo_val = int(activo_filtro)
        except Exception:
            activo_val = 1
        filtros.append("ae.activo = ?")
        params.append(activo_val)

        where_clause = ""
        if filtros:
            where_clause = "WHERE " + " AND ".join(filtros)

        nombre_atleta_expr = (
            "CONCAT_WS(' ', u.nombre, u.apellidos)"
            if DB_ENGINE == "mariadb"
            else "u.nombre || ' ' || COALESCE(u.apellidos, '')"
        )

        query_alertas = f"""
            SELECT
                ae.id,
                ae.entrenamiento_asignado_id,
                ae.atleta_id,
                ae.tipo,
                ae.codigo,
                ae.mensaje,
                ae.fecha_detectada,
                ae.activo,
                ea.fecha AS fecha_entreno,
                COALESCE(ea.nombre, e.nombre, 'Entrenamiento') AS entrenamiento_nombre,
                {nombre_atleta_expr} AS atleta_nombre
            FROM alertas_entrenamientos ae
            JOIN entrenamientos_asignados ea ON ea.id = ae.entrenamiento_asignado_id
            JOIN usuarios u ON u.id = ae.atleta_id
            LEFT JOIN entrenamientos e ON e.id = ea.entrenamiento_id
            {where_clause}
            ORDER BY ae.fecha_detectada DESC
            LIMIT 300
        """
        filas = query_db(query_alertas, tuple(params))
        payload = []
        for f in filas:
            payload.append(
                {
                    "id": f["id"],
                    "entrenamiento_asignado_id": f["entrenamiento_asignado_id"],
                    "atleta_id": f["atleta_id"],
                    "tipo": f["tipo"],
                    "codigo": f["codigo"],
                    "mensaje": f["mensaje"],
                    "fecha_detectada": _fecha_iso(f.get("fecha_detectada")),
                    "fecha_entreno": _fecha_iso(f.get("fecha_entreno")),
                    "entrenamiento": f.get("entrenamiento_nombre"),
                    "atleta": f.get("atleta_nombre"),
                    "activo": f.get("activo", 1),
                }
            )

        return jsonify(payload), 200
    except Exception as e:
        print("Error en /alertas/entrenador:", e)
        return jsonify({"error": "No se pudieron obtener las alertas"}), 500


@app.route('/alertas/entrenador/<int:alerta_id>/resolver', methods=['PUT'])
@requires_roles('entrenador', 'admin')
def resolver_alerta_entrenador(current_user, alerta_id):
    """
    Marca una alerta como resuelta (activo=0). Solo el entrenador dueño puede hacerlo.
    """
    ensure_alertas_table()
    try:
        conn = get_db()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT ae.id, u.entrenador_id
                FROM alertas_entrenamientos ae
                JOIN usuarios u ON u.id = ae.atleta_id
                WHERE ae.id = ?
                """,
                (alerta_id,),
            )
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Alerta no encontrada"}), 404

            entrenador_id = row["entrenador_id"] if isinstance(row, dict) else row[1]
            if current_user["rol"] == "entrenador" and entrenador_id != current_user["id"]:
                return jsonify({"error": "No tienes permiso para resolver esta alerta"}), 403

            cur.execute(
                "UPDATE alertas_entrenamientos SET activo = 0 WHERE id = ?",
                (alerta_id,),
            )
            conn.commit()
            return jsonify({"message": "Alerta marcada como resuelta"}), 200
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        print("Error al resolver alerta:", e)
        return jsonify({"error": "No se pudo resolver la alerta"}), 500


@app.route('/alertas/entrenador/<int:alerta_id>/reactivar', methods=['PUT'])
@requires_roles('entrenador', 'admin')
def reactivar_alerta_entrenador(current_user, alerta_id):
    """
    Reactiva una alerta (activo=1). Solo el entrenador dueño puede hacerlo.
    """
    ensure_alertas_table()
    try:
        conn = get_db()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT ae.id, u.entrenador_id
                FROM alertas_entrenamientos ae
                JOIN usuarios u ON u.id = ae.atleta_id
                WHERE ae.id = ?
                """,
                (alerta_id,),
            )
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Alerta no encontrada"}), 404

            entrenador_id = row["entrenador_id"] if isinstance(row, dict) else row[1]
            if current_user["rol"] == "entrenador" and entrenador_id != current_user["id"]:
                return jsonify({"error": "No tienes permiso para reactivar esta alerta"}), 403

            cur.execute(
                "UPDATE alertas_entrenamientos SET activo = 1 WHERE id = ?",
                (alerta_id,),
            )
            conn.commit()
            return jsonify({"message": "Alerta reactivada"}), 200
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        print("Error al reactivar alerta:", e)
        return jsonify({"error": "No se pudo reactivar la alerta"}), 500


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
            SELECT comentario, url_datos, fecha, rpe, sensacion, fatiga, dolor, zona_dolor, completado
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

        dur_plan, zonas_plan = _planificacion_desde_pasos(pasos)
        cur.execute("SELECT id, km_real, duracion_real_seg, origen_datos FROM sesiones_realizadas WHERE entrenamiento_asignado_id = ?", (asignado_id,))
        sesion = cur.fetchone()
        sesion_id = sesion[0] if sesion and not isinstance(sesion, dict) else (sesion.get('id') if sesion else None)
        dur_real = sesion[2] if sesion and not isinstance(sesion, dict) else (sesion.get('duracion_real_seg') if sesion else None)
        km_real_sesion = sesion[1] if sesion and not isinstance(sesion, dict) else (sesion.get('km_real') if sesion else None)
        origen = sesion[3] if sesion and not isinstance(sesion, dict) else (sesion.get('origen_datos') if sesion else None)
        metricas = _obtener_metricas_sesion(cur, sesion_id)
        # Guardar resumen planificado por zonas (ritmo)
        zonas_atleta = None
        try:
            zonas_atleta = obtener_zonas_atleta_por_fecha(cur, asignado['atleta_id'] if isinstance(asignado, dict) else atleta_id, asignado.get('fecha') if isinstance(asignado, dict) else None)
        except Exception:
            zonas_atleta = None
        plan_resumen_guardado = False
        if zonas_atleta:
            _guardar_resumen_plan_zonas(cur, asignado_id, asignado['atleta_id'] if isinstance(asignado, dict) else atleta_id, pasos, zonas_atleta)
            _guardar_resumen_plan_zonas_fc(cur, asignado_id, asignado['atleta_id'] if isinstance(asignado, dict) else atleta_id, pasos, zonas_atleta)
            plan_resumen_guardado = True

        ritmo_real = metricas.get('ritmo_medio_seg_km')
        if ritmo_real is None and dur_real and km_real_sesion:
            try:
                ritmo_real = float(dur_real) / float(km_real_sesion)
            except Exception:
                ritmo_real = None
        ritmo_plan = None
        km_plan_for_pace = km_row['km_planificados'] if km_row else None
        if km_plan_for_pace is None:
            km_plan_for_pace = asignado.get('km_previstos') if isinstance(asignado, dict) else None
        if dur_plan and km_plan_for_pace:
            try:
                ritmo_plan = float(dur_plan) / float(km_plan_for_pace)
            except Exception:
                ritmo_plan = None
        comparativa = {
            'plan': {
                'km': (km_row['km_planificados'] if km_row else None) or (asignado.get('km_previstos') if isinstance(asignado, dict) else None),
                'duracion_seg': dur_plan,
                'ritmo_seg_km': ritmo_plan,
                'zonas': zonas_plan,
            },
            'real': {
                'km': km_real_sesion if km_real_sesion is not None else (km_row['km_realizados'] if km_row else None),
                'duracion_seg': dur_real,
                'ritmo_seg_km': ritmo_real,
                'fc_media': metricas.get('fc_media'),
                'fc_max': metricas.get('fc_max'),
                'cadencia_media': metricas.get('cadencia_media'),
                'distancia_m': metricas.get('distancia_m'),
            },
            'origen_datos': origen,
        }

        if plan_resumen_guardado:
            conn.commit()

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
            "comparativa": comparativa,
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
                   f.rpe, f.sensacion, f.fatiga, f.dolor, f.zona_dolor, f.completado,
                   CONCAT_WS(' ', u.nombre, u.apellidos) AS atleta,
                   COALESCE(ea.nombre, 'Entrenamiento') AS entrenamiento_nombre,
                    ea.fecha AS fecha_entreno,
                    f.url_datos
            FROM feedbacks f
            JOIN usuarios u ON f.atleta_id = u.id
            LEFT JOIN entrenamientos_asignados ea ON f.entrenamiento_asignado_id = ea.id
            WHERE u.entrenador_id = ?
            ORDER BY f.fecha DESC
        '''
        resultados = query_db(query, (current_user['id'],))
        payload = []
        for r in resultados:
            item = dict(r)
            item["fecha"] = _fecha_iso(item.get("fecha"))
            item["fecha_entreno"] = _fecha_iso(item.get("fecha_entreno"))
            payload.append(item)
        return jsonify(payload), 200
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

        fc_max = data.get('fc_max')
        try:
            fc_max = float(fc_max) if fc_max is not None else None
        except Exception:
            fc_max = None

        fc_zonas = None
        fc_z1 = fc_z2 = fc_z3 = fc_z4 = fc_z5 = fc_z6 = None
        if fc_max:
            fc_zonas = {
                'z1': round(fc_max * 0.60, 0),
                'z2': round(fc_max * 0.70, 0),
                'z3': round(fc_max * 0.80, 0),
                'z4': round(fc_max * 0.90, 0),
                'z5': round(fc_max * 0.95, 0),
                'z6': round(fc_max * 1.00, 0)
            }
            fc_z1, fc_z2, fc_z3, fc_z4, fc_z5, fc_z6 = (
                fc_zonas['z1'], fc_zonas['z2'], fc_zonas['z3'],
                fc_zonas['z4'], fc_zonas['z5'], fc_zonas['z6']
            )
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
            INSERT INTO zonas_entrenamiento (atleta_id, vam, z1, z2, z3, z4, z5, z6, fecha_inicio, metodo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (atleta_id, vam, zonas['z1'], zonas['z2'], zonas['z3'], zonas['z4'], zonas['z5'], zonas['z6'], fecha_inicio, 'vam')
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
        fc_z1 = data.get("fc_z1")
        fc_z2 = data.get("fc_z2")
        fc_z3 = data.get("fc_z3")
        fc_z4 = data.get("fc_z4")
        fc_z5 = data.get("fc_z5")
        fc_z6 = data.get("fc_z6")
        metodo = (data.get("metodo") or "vam").strip().lower()
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
            INSERT INTO zonas_entrenamiento (atleta_id, vam, z1, z2, z3, z4, z5, z6, fc_z1, fc_z2, fc_z3, fc_z4, fc_z5, fc_z6, fecha_inicio, metodo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (atleta_id, vam, z1, z2, z3, z4, z5, z6, fc_z1, fc_z2, fc_z3, fc_z4, fc_z5, fc_z6, fecha_inicio, metodo)
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

def _fecha_iso(value):
    """
    Devuelve la fecha en ISO string o None si no hay valor.
    Evita que el frontend reciba null y muestre 1970.
    """
    if not value:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    try:
        return datetime.fromisoformat(str(value)).isoformat()
    except Exception:
        return str(value)

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
    data = request.get_json(silent=True)
    if data is None:
        data = {}

    # Aceptamos tanto lista directa como {"pasos":[...]}
    if isinstance(data, list):
        pasos = data
    elif isinstance(data, dict):
        pasos = data.get('pasos') or []
    else:
        pasos = []

    if not isinstance(pasos, list) or not pasos:
        return jsonify({'error': 'Formato de datos inválido (se esperaba una lista de pasos)'}), 400

    # Comprobar que el entrenamiento asignado existe
    asignado = query_db(
        "SELECT id FROM entrenamientos_asignados WHERE id = ?",
        (id,),
        one=True
    )
    if not asignado:
        return jsonify({"error": "Entrenamiento asignado no encontrado"}), 404

    conn = get_db()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        # Borramos detalle anterior
        cur.execute(
            """
            DELETE FROM entrenamientos_asignados_detalle
            WHERE entrenamiento_asignado_id = ?
            """,
            (id,),
        )

        def insertar_paso(paso, parent_id=None, orden=1):
            cur.execute(
                """
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
                   intensidad,
                   descripcion)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
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
                    paso.get('intensidad'),
                    paso.get('descripcion'),
                ),
            )

            nuevo_id = cur.lastrowid
            for idx, sub in enumerate(paso.get('subpasos') or []):
                insertar_paso(sub, parent_id=nuevo_id, orden=idx + 1)

        # Insertamos todos los pasos raíz
        for idx, paso in enumerate(pasos):
            insertar_paso(paso, parent_id=None, orden=idx + 1)

        conn.commit()
        return jsonify({'message': 'Detalle del entrenamiento asignado actualizado correctamente'}), 200

    except Exception as e:
        print("Error al actualizar detalle entrenamiento asignado:", e)
        conn.rollback()
        return jsonify({'error': 'Error al actualizar el detalle del entrenamiento asignado'}), 500


@app.route('/entrenamientos_asignados/<int:id>/pasos', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def actualizar_pasos_entrenamiento_asignado(current_user, id):
    # Alias temporal para compatibilidad. Reusar el handler de /detalle.
    return actualizar_detalle_entrenamiento_asignado(current_user, id)
   
@app.route('/zonas_atleta/<int:atleta_id>', methods=['GET'])
@requires_roles('entrenador', 'atleta')
def obtener_zonas_atleta(current_user, atleta_id):
    try:
        fecha_ref = request.args.get("fecha")
        params = [atleta_id]
        if fecha_ref:
            params.extend([fecha_ref, fecha_ref])
            query = '''
                SELECT vam, z1, z2, z3, z4, z5, z6, fc_z1, fc_z2, fc_z3, fc_z4, fc_z5, fc_z6, metodo, fecha_inicio, fecha_fin
                FROM zonas_entrenamiento
                WHERE atleta_id = ?
                  AND fecha_inicio <= ?
                  AND (fecha_fin IS NULL OR fecha_fin >= ?)
                ORDER BY fecha_inicio DESC
                LIMIT 1
            '''
        else:
            query = '''
                SELECT vam, z1, z2, z3, z4, z5, z6, fc_z1, fc_z2, fc_z3, fc_z4, fc_z5, fc_z6, metodo, fecha_inicio, fecha_fin
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

@app.route('/zonas_atleta/<int:atleta_id>/historial', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_historial_zonas_atleta(current_user, atleta_id):
    try:
        atleta = query_db(
            "SELECT id, rol, entrenador_id FROM usuarios WHERE id = ?",
            (atleta_id,),
            one=True,
        )
        if not atleta or atleta.get('rol') != 'atleta':
            return jsonify({'error': 'Atleta no encontrado'}), 404
        if current_user['rol'] == 'atleta' and current_user['id'] != atleta_id:
            return jsonify({'error': 'Acceso no autorizado'}), 403
        if current_user['rol'] == 'entrenador' and atleta.get('entrenador_id') not in (None, current_user['id']):
            return jsonify({'error': 'No tienes permiso'}), 403

        filas = query_db(
            '''
            SELECT vam, z1, z2, z3, z4, z5, z6,
                   fc_z1, fc_z2, fc_z3, fc_z4, fc_z5, fc_z6,
                   metodo, fecha_inicio, fecha_fin
            FROM zonas_entrenamiento
            WHERE atleta_id = ?
            ORDER BY fecha_inicio DESC
            ''',
            (atleta_id,),
        )
        return jsonify([dict(f) for f in filas]), 200
    except Exception as e:
        print("Error al obtener historial de zonas:", e)
        return jsonify({'error': 'No se pudo obtener el historial de zonas'}), 500


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
            where = "WHERE creador_id = ?"
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
        where_clause = "WHERE creador_id = ?"
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
        if creador != current_user["id"]:
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
            where = "WHERE creador_id = ?"
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
            where = "WHERE creador_id = ?"
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
            if creador != current_user["id"]:
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
            if creador != current_user["id"]:
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
            where = "WHERE creador_id = ?"
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
                f.rpe,
                f.sensacion,
                f.fatiga,
                f.dolor,
                f.zona_dolor,
                f.completado,
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

        payload = []
        for r in rows:
            item = dict(r)
            item["fecha"] = _fecha_iso(item.get("fecha"))
            item["fecha_entreno"] = _fecha_iso(item.get("fecha_entreno"))
            payload.append(item)

        return jsonify(payload), 200

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
        """ , (entrenamiento_id,))
        ent = cur.fetchone()
        if not ent:
            return jsonify({'error': 'Entrenamiento no encontrado'}), 404
        atleta_id = ent['atleta_id'] if isinstance(ent, dict) else ent[0]
        if current_user['rol'] == 'atleta' and current_user['id'] != atleta_id:
            return jsonify({'error': 'No tienes permiso para ver este entrenamiento'}), 403

        cur.execute("""
            SELECT paso_detalle_id, repeticion, tiempo_real_seg, fecha
            FROM resultados_entrenamientos
            WHERE entrenamiento_asignado_id = ?
            ORDER BY fecha
        """ , (entrenamiento_id,))
        filas = cur.fetchall()

        cur.execute("""
            SELECT km_planificados, km_realizados
            FROM km_realizados_entrenamientos
            WHERE entrenamiento_asignado_id = ?
        """ , (entrenamiento_id,))
        km_row = cur.fetchone()
        km_real_total = km_row['km_realizados'] if km_row else None

        payload = []
        for f in filas:
            d = dict(f)
            if km_real_total is not None:
                d['km_realizados_total'] = km_real_total
            payload.append(d)

        if not payload and km_real_total is not None:
            payload.append({'km_realizados_total': km_real_total})

        return jsonify(payload), 200
    except Exception as e:
        print('Error al obtener resultados del entrenamiento:', e)
        return jsonify({'error': 'No se pudieron obtener los resultados'}), 500
    finally:
        cur.close()
        conn.close()


@app.route('/entrenamientos_asignados/<int:entrenamiento_id>/comparativa', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def comparativa_entrenamiento(current_user, entrenamiento_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT ea.*, u.entrenador_id FROM entrenamientos_asignados ea JOIN usuarios u ON u.id = ea.atleta_id WHERE ea.id = ?", (entrenamiento_id,))
        ent = cur.fetchone()
        if not ent:
            return jsonify({'error': 'Entrenamiento no encontrado'}), 404
        atleta_id = ent['atleta_id'] if isinstance(ent, dict) else ent[1]
        entrenador_id = ent['entrenador_id'] if isinstance(ent, dict) else ent[0]
        if current_user['rol'] == 'atleta' and current_user['id'] != atleta_id:
            return jsonify({'error': 'No tienes permiso para ver este entrenamiento'}), 403
        if current_user['rol'] == 'entrenador' and entrenador_id != current_user['id']:
            return jsonify({'error': 'No tienes permiso para ver este entrenamiento'}), 403

        cur.execute("SELECT parent_id, id, tipo_paso, repeticiones, objetivo_tipo, objetivo_valor, unidad, zona, recuperacion_valor, recuperacion_unidad FROM entrenamientos_asignados_detalle WHERE entrenamiento_asignado_id = ?", (entrenamiento_id,))
        pasos = [dict(p) for p in cur.fetchall()]
        dur_plan, zonas_plan = _planificacion_desde_pasos(pasos)

        cur.execute("SELECT km_planificados, km_realizados FROM km_realizados_entrenamientos WHERE entrenamiento_asignado_id = ?", (entrenamiento_id,))
        km_row = cur.fetchone()
        km_plan = None
        km_real = None
        if km_row:
            km_plan = km_row['km_planificados'] if isinstance(km_row, dict) else km_row[0]
            km_real = km_row['km_realizados'] if isinstance(km_row, dict) else km_row[1]
        if km_plan is None:
            km_plan = ent['km_previstos'] if isinstance(ent, dict) else None

        cur.execute("SELECT id, km_real, duracion_real_seg, origen_datos FROM sesiones_realizadas WHERE entrenamiento_asignado_id = ?", (entrenamiento_id,))
        sesion = cur.fetchone()
        sesion_id = sesion['id'] if isinstance(sesion, dict) else (sesion[0] if sesion else None)
        dur_real = sesion['duracion_real_seg'] if isinstance(sesion, dict) else (sesion[2] if sesion else None)
        km_real_sesion = sesion['km_real'] if isinstance(sesion, dict) else (sesion[1] if sesion else None)
        origen = sesion['origen_datos'] if isinstance(sesion, dict) else (sesion[3] if sesion else None)

        metricas = _obtener_metricas_sesion(cur, sesion_id)

        zonas_atleta = None
        try:
            zonas_atleta = obtener_zonas_atleta_por_fecha(cur, atleta_id, ent.get('fecha') if isinstance(ent, dict) else None)
        except Exception:
            zonas_atleta = None
        plan_resumen_guardado = False
        if zonas_atleta:
            _guardar_resumen_plan_zonas(cur, entrenamiento_id, atleta_id, pasos, zonas_atleta)
            _guardar_resumen_plan_zonas_fc(cur, entrenamiento_id, atleta_id, pasos, zonas_atleta)
            plan_resumen_guardado = True
            _guardar_resumen_plan_zonas_fc(cur, entrenamiento_id, atleta_id, pasos, zonas_atleta)


        ritmo_real = metricas.get('ritmo_medio_seg_km')
        if ritmo_real is None and dur_real and km_real_sesion:
            try:
                ritmo_real = float(dur_real) / float(km_real_sesion)
            except Exception:
                ritmo_real = None

        ritmo_plan = None
        if dur_plan and km_plan:
            try:
                ritmo_plan = float(dur_plan) / float(km_plan)
            except Exception:
                ritmo_plan = None

        if plan_resumen_guardado:
            conn.commit()

        payload = {
            'plan': {
                'km': km_plan,
                'duracion_seg': dur_plan,
                'ritmo_seg_km': ritmo_plan,
                'zonas': zonas_plan,
            },
            'real': {
                'km': km_real_sesion if km_real_sesion is not None else km_real,
                'duracion_seg': dur_real,
                'ritmo_seg_km': ritmo_real,
                'fc_media': metricas.get('fc_media'),
                'fc_max': metricas.get('fc_max'),
                'cadencia_media': metricas.get('cadencia_media'),
                'distancia_m': metricas.get('distancia_m'),
            },
            'origen_datos': origen,
        }
        return jsonify(payload), 200
    except Exception as e:
        print('Error en comparativa_entrenamiento:', e)
        return jsonify({'error': 'No se pudo obtener la comparativa'}), 500
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

@app.route('/entrenamientos_asignados/<int:entrenamiento_id>/resumen_zonas', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def resumen_zonas_entrenamiento(current_user, entrenamiento_id):
    fuente = (request.args.get('fuente') or 'ritmo').strip().lower()
    if fuente not in ('ritmo', 'fc'):
        return jsonify({'error': 'Fuente inválida'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT ea.atleta_id, u.entrenador_id FROM entrenamientos_asignados ea JOIN usuarios u ON u.id = ea.atleta_id WHERE ea.id = ?",
            (entrenamiento_id,),
        )
        ent = cur.fetchone()
        if not ent:
            return jsonify({'error': 'Entrenamiento no encontrado'}), 404
        atleta_id = ent['atleta_id'] if isinstance(ent, dict) else ent[0]
        entrenador_id = ent['entrenador_id'] if isinstance(ent, dict) else ent[1]

        if current_user['rol'] == 'atleta' and current_user['id'] != atleta_id:
            return jsonify({'error': 'No tienes permiso para ver este entrenamiento'}), 403
        if current_user['rol'] == 'entrenador' and current_user['id'] != entrenador_id:
            return jsonify({'error': 'No tienes permiso para ver este entrenamiento'}), 403

        cur.execute(
            "SELECT zona, tipo, tiempo_seg FROM zonas_resumen_entrenamiento WHERE entrenamiento_asignado_id = ? AND fuente = ?",
            (entrenamiento_id, fuente),
        )
        rows = cur.fetchall()
        plan_map = {}
        real_map = {}
        for r in rows:
            zona = r['zona'] if isinstance(r, dict) else r[0]
            tipo = r['tipo'] if isinstance(r, dict) else r[1]
            tiempo = r['tiempo_seg'] if isinstance(r, dict) else r[2]
            if not zona:
                continue
            if tipo == 'plan':
                plan_map[zona] = float(tiempo or 0)
            elif tipo == 'real':
                real_map[zona] = float(tiempo or 0)


        if not real_map:
            try:
                cur.execute(
                    "SELECT sr.archivo_principal_id, sa.ruta_storage, ea.fecha FROM sesiones_realizadas sr JOIN entrenamientos_asignados ea ON ea.id = sr.entrenamiento_asignado_id LEFT JOIN sesion_archivos sa ON sa.id = sr.archivo_principal_id WHERE sr.entrenamiento_asignado_id = ?",
                    (entrenamiento_id,),
                )
                row = cur.fetchone()
                ruta = row['ruta_storage'] if isinstance(row, dict) else (row[1] if row else None)
                fecha = row['fecha'] if isinstance(row, dict) else (row[2] if row else None)
                if ruta and os.path.exists(ruta):
                    zonas_atleta = obtener_zonas_atleta_por_fecha(cur, atleta_id, fecha)
                    if zonas_atleta:
                        if fuente == 'ritmo':
                            resumen_real = _resumen_zonas_real_desde_fit(ruta, zonas_atleta)
                        else:
                            resumen_real = _resumen_zonas_real_fc_desde_fit(ruta, zonas_atleta)
                        for zona, valores in (resumen_real or {}).items():
                            _upsert_resumen_zona(
                                cur,
                                entrenamiento_id=entrenamiento_id,
                                atleta_id=atleta_id,
                                tipo='real',
                                fuente=fuente,
                                zona=zona,
                                distancia_km=(valores.get('distancia_km') if fuente == 'ritmo' else None),
                                tiempo_seg=valores.get('tiempo_seg'),
                            )
                            real_map[zona] = float(valores.get('tiempo_seg') or 0)
                        if resumen_real:
                            conn.commit()
            except Exception:
                pass


        zonas = []
        total_plan = 0.0
        total_real = 0.0
        for i in range(1, 7):
            zona = f"Z{i}"
            plan_seg = float(plan_map.get(zona, 0) or 0)
            real_seg = float(real_map.get(zona, 0) or 0)
            total_plan += plan_seg
            total_real += real_seg
            zonas.append({
                'zona': zona,
                'plan_seg': plan_seg,
                'real_seg': real_seg,
            })

        for z in zonas:
            z['plan_pct'] = (z['plan_seg'] / total_plan * 100.0) if total_plan > 0 else None
            z['real_pct'] = (z['real_seg'] / total_real * 100.0) if total_real > 0 else None

        return jsonify({
            'fuente': fuente,
            'totales': {
                'plan_seg': total_plan,
                'real_seg': total_real,
            },
            'zonas': zonas,
        }), 200
    except Exception as e:
        print('Error en resumen_zonas_entrenamiento:', e)
        return jsonify({'error': 'No se pudo obtener el resumen de zonas'}), 500
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass


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

        # Guardar sesion_realizada (V2)
        duracion_real = None
        try:
            tiempos = [r.get('tiempo_real_seg') for r in registros if r.get('tiempo_real_seg') is not None]
            if tiempos:
                duracion_real = int(sum(tiempos))
        except Exception:
            duracion_real = None
        fecha_real = fecha_entrenamiento or now_ts
        upsert_sesion_realizada(
            conn,
            entrenamiento_asignado_id=entrenamiento_id,
            atleta_id=atleta["atleta_id"],
            fecha_real=fecha_real,
            km_real=km_total_guardar,
            duracion_real_seg=duracion_real,
            origen_datos='manual',
        )
    
        conn.commit()
    
        return jsonify({"status": "ok"}), 200



def _parse_fit_metrics_fitparse(file_path):
    try:
        from fitparse import FitFile  # type: ignore
    except Exception as exc:
        raise RuntimeError('fitparse no está instalado') from exc

    fit = FitFile(file_path)

    def _get_value(msg, name):
        try:
            return msg.get_value(name)
        except Exception:
            return None

    metrics = {
        'duracion_seg': None,
        'distancia_m': None,
        'ritmo_medio_seg_km': None,
        'fc_media': None,
        'fc_max': None,
        'cadencia_media': None,
    }

    session_msg = None
    for msg in fit.get_messages('session'):
        session_msg = msg
        break

    if session_msg is not None:
        duracion = _get_value(session_msg, 'total_timer_time')
        distancia = _get_value(session_msg, 'total_distance')
        avg_speed = _get_value(session_msg, 'avg_speed')
        fc_media = _get_value(session_msg, 'avg_heart_rate')
        fc_max = _get_value(session_msg, 'max_heart_rate')
        cadencia = _get_value(session_msg, 'avg_cadence')

        if duracion is not None:
            metrics['duracion_seg'] = float(duracion)
        if distancia is not None:
            metrics['distancia_m'] = float(distancia)
        if avg_speed:
            try:
                avg_speed = float(avg_speed)
                if avg_speed > 0:
                    metrics['ritmo_medio_seg_km'] = 1000.0 / avg_speed
            except Exception:
                pass
        if fc_media is not None:
            metrics['fc_media'] = float(fc_media)
        if fc_max is not None:
            metrics['fc_max'] = float(fc_max)
        if cadencia is not None:
            metrics['cadencia_media'] = float(cadencia)

    needs_fallback = any(metrics[k] is None for k in ('duracion_seg', 'distancia_m', 'fc_media', 'fc_max', 'cadencia_media'))
    if needs_fallback:
        timestamps = []
        distances = []
        hr_values = []
        cad_values = []
        for msg in fit.get_messages('record'):
            ts = _get_value(msg, 'timestamp')
            dist = _get_value(msg, 'distance')
            hr = _get_value(msg, 'heart_rate')
            cad = _get_value(msg, 'cadence')
            if ts is not None:
                timestamps.append(ts)
            if dist is not None:
                distances.append(dist)
            if hr is not None:
                hr_values.append(hr)
            if cad is not None:
                cad_values.append(cad)

        if metrics['duracion_seg'] is None and len(timestamps) >= 2:
            try:
                metrics['duracion_seg'] = (max(timestamps) - min(timestamps)).total_seconds()
            except Exception:
                pass
        if metrics['distancia_m'] is None and distances:
            try:
                metrics['distancia_m'] = float(max(distances))
            except Exception:
                pass
        if metrics['fc_media'] is None and hr_values:
            metrics['fc_media'] = float(sum(hr_values) / len(hr_values))
        if metrics['fc_max'] is None and hr_values:
            metrics['fc_max'] = float(max(hr_values))
        if metrics['cadencia_media'] is None and cad_values:
            metrics['cadencia_media'] = float(sum(cad_values) / len(cad_values))

        if metrics['ritmo_medio_seg_km'] is None:
            dist = metrics['distancia_m']
            dur = metrics['duracion_seg']
            if dist and dur and dist > 0:
                metrics['ritmo_medio_seg_km'] = float(dur) / (float(dist) / 1000.0)

    return metrics


def _parse_fit_metrics_fitdecode(file_path):
    try:
        from fitdecode import FitReader  # type: ignore
        from fitdecode.records import FitDataMessage  # type: ignore
    except Exception as exc:
        raise RuntimeError('fitdecode no está instalado') from exc

    import warnings

    metrics = {
        'duracion_seg': None,
        'distancia_m': None,
        'ritmo_medio_seg_km': None,
        'fc_media': None,
        'fc_max': None,
        'cadencia_media': None,
    }

    def _get_value(msg, name):
        try:
            return msg.get_value(name)
        except Exception:
            return None

    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        session_msg = None
        records = []
        with FitReader(file_path) as fit:
            for frame in fit:
                if not isinstance(frame, FitDataMessage):
                    continue
                if frame.name == 'session' and session_msg is None:
                    session_msg = frame
                if frame.name == 'record':
                    records.append(frame)

        if session_msg is not None:
            duracion = _get_value(session_msg, 'total_timer_time')
            distancia = _get_value(session_msg, 'total_distance')
            avg_speed = _get_value(session_msg, 'avg_speed')
            fc_media = _get_value(session_msg, 'avg_heart_rate')
            fc_max = _get_value(session_msg, 'max_heart_rate')
            cadencia = _get_value(session_msg, 'avg_cadence')

            if duracion is not None:
                metrics['duracion_seg'] = float(duracion)
            if distancia is not None:
                metrics['distancia_m'] = float(distancia)
            if avg_speed:
                try:
                    avg_speed = float(avg_speed)
                    if avg_speed > 0:
                        metrics['ritmo_medio_seg_km'] = 1000.0 / avg_speed
                except Exception:
                    pass
            if fc_media is not None:
                metrics['fc_media'] = float(fc_media)
            if fc_max is not None:
                metrics['fc_max'] = float(fc_max)
            if cadencia is not None:
                metrics['cadencia_media'] = float(cadencia)

        needs_fallback = any(metrics[k] is None for k in ('duracion_seg', 'distancia_m', 'fc_media', 'fc_max', 'cadencia_media'))
        if needs_fallback and records:
            timestamps = []
            distances = []
            hr_values = []
            cad_values = []
            for rec in records:
                ts = _get_value(rec, 'timestamp')
                dist = _get_value(rec, 'distance')
                hr = _get_value(rec, 'heart_rate')
                cad = _get_value(rec, 'cadence')
                if ts is not None:
                    timestamps.append(ts)
                if dist is not None:
                    distances.append(dist)
                if hr is not None:
                    hr_values.append(hr)
                if cad is not None:
                    cad_values.append(cad)

            if metrics['duracion_seg'] is None and len(timestamps) >= 2:
                try:
                    metrics['duracion_seg'] = (max(timestamps) - min(timestamps)).total_seconds()
                except Exception:
                    pass
            if metrics['distancia_m'] is None and distances:
                try:
                    metrics['distancia_m'] = float(max(distances))
                except Exception:
                    pass
            if metrics['fc_media'] is None and hr_values:
                metrics['fc_media'] = float(sum(hr_values) / len(hr_values))
            if metrics['fc_max'] is None and hr_values:
                metrics['fc_max'] = float(max(hr_values))
            if metrics['cadencia_media'] is None and cad_values:
                metrics['cadencia_media'] = float(sum(cad_values) / len(cad_values))

            if metrics['ritmo_medio_seg_km'] is None:
                dist = metrics['distancia_m']
                dur = metrics['duracion_seg']
                if dist and dur and dist > 0:
                    metrics['ritmo_medio_seg_km'] = float(dur) / (float(dist) / 1000.0)

    return metrics


def _parse_fit_metrics(file_path):
    try:
        return _parse_fit_metrics_fitparse(file_path)
    except Exception as exc_fitparse:
        try:
            return _parse_fit_metrics_fitdecode(file_path)
        except Exception as exc_fitdecode:
            raise RuntimeError(f"fitparse: {exc_fitparse}; fitdecode: {exc_fitdecode}")


def _hash_file_sha256(file_path):
    h = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

@app.route('/sesiones/<int:entrenamiento_id>/archivo', methods=['POST'])
@requires_roles('atleta')
def registrar_archivo_sesion(current_user, entrenamiento_id):
    archivo = request.files.get('archivo')
    origen = (request.form.get('origen') or 'manual').strip().lower() or 'manual'

    if not archivo or not archivo.filename:
        return jsonify({'error': 'Archivo FIT requerido'}), 400

    asignado = query_db(
        "SELECT id, atleta_id, fecha, km_previstos FROM entrenamientos_asignados WHERE id = ?",
        (entrenamiento_id,),
        one=True,
    )
    if not asignado:
        return jsonify({'error': 'Entrenamiento asignado no encontrado'}), 404
    if asignado['atleta_id'] != current_user['id']:
        return jsonify({'error': 'No tienes permiso para este entrenamiento'}), 403

    base_dir = os.path.join(os.path.dirname(__file__), 'uploads', 'fit')
    os.makedirs(base_dir, exist_ok=True)

    original_name = secure_filename(archivo.filename)
    stamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    stored_name = f"{current_user['id']}_{entrenamiento_id}_{stamp}_{original_name}"
    stored_path = os.path.join(base_dir, stored_name)

    try:
        archivo.save(stored_path)
        tamano = os.path.getsize(stored_path)
        hash_sha256 = _hash_file_sha256(stored_path)
    except Exception as e:
        return jsonify({'error': 'No se pudo guardar el archivo', 'details': str(e)}), 500

    metrics = {}
    parse_error = None
    try:
        metrics = _parse_fit_metrics(stored_path)
    except Exception as e:
        parse_error = str(e)

    resumen_real = None
    resumen_real_fc = None
    zonas_atleta = None

    conn = get_db()
    cur = conn.cursor()
    try:
        try:
            zonas_atleta = obtener_zonas_atleta_por_fecha(cur, asignado['atleta_id'], asignado.get('fecha'))
        except Exception:
            zonas_atleta = None

        if zonas_atleta:
            resumen_real = _resumen_zonas_real_desde_fit(stored_path, zonas_atleta)
            resumen_real_fc = _resumen_zonas_real_fc_desde_fit(stored_path, zonas_atleta)
        duracion = metrics.get('duracion_seg')
        distancia_m = metrics.get('distancia_m')
        km_real = None
        if distancia_m is not None:
            km_real = float(distancia_m) / 1000.0

        upsert_sesion_realizada(
            conn,
            entrenamiento_asignado_id=entrenamiento_id,
            atleta_id=asignado['atleta_id'],
            fecha_real=datetime.utcnow(),
            km_real=km_real,
            duracion_real_seg=duracion,
            origen_datos='fit',
        )

        cur.execute(
            "SELECT id FROM sesiones_realizadas WHERE entrenamiento_asignado_id = ?",
            (entrenamiento_id,),
        )
        row = cur.fetchone()
        sesion_id = row['id'] if isinstance(row, dict) else (row[0] if row else None)

        cur.execute(
            "INSERT INTO sesion_archivos (sesion_id, atleta_id, origen, filename, mime, tamano, ruta_storage, hash_sha256, procesado, error_procesado) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                sesion_id,
                asignado['atleta_id'],
                origen,
                original_name,
                archivo.mimetype,
                tamano,
                stored_path,
                hash_sha256,
                1 if not parse_error else 0,
                parse_error,
            ),
        )
        archivo_id = cur.lastrowid

        if resumen_real:
            for zona, valores in resumen_real.items():
                _upsert_resumen_zona(
                    cur,
                    entrenamiento_id=entrenamiento_id,
                    atleta_id=asignado['atleta_id'],
                    tipo='real',
                    fuente='ritmo',
                    zona=zona,
                    distancia_km=valores.get('distancia_km'),
                    tiempo_seg=valores.get('tiempo_seg'),
                )

        if resumen_real_fc:
            for zona, valores in resumen_real_fc.items():
                _upsert_resumen_zona(
                    cur,
                    entrenamiento_id=entrenamiento_id,
                    atleta_id=asignado['atleta_id'],
                    tipo='real',
                    fuente='fc',
                    zona=zona,
                    distancia_km=None,
                    tiempo_seg=valores.get('tiempo_seg'),
                )

        if sesion_id:
            cur.execute(
                "UPDATE sesiones_realizadas SET archivo_principal_id = ? WHERE id = ?",
                (archivo_id, sesion_id),
            )

        if sesion_id and metrics and not parse_error:
            metricas = [
                ('duracion_seg', metrics.get('duracion_seg'), 's'),
                ('distancia_m', metrics.get('distancia_m'), 'm'),
                ('ritmo_medio_seg_km', metrics.get('ritmo_medio_seg_km'), 's/km'),
                ('fc_media', metrics.get('fc_media'), 'bpm'),
                ('fc_max', metrics.get('fc_max'), 'bpm'),
                ('cadencia_media', metrics.get('cadencia_media'), 'spm'),
            ]
            keys = [m[0] for m in metricas]
            cur.execute(
                f"DELETE FROM sesion_metricas WHERE sesion_id = ? AND metrica IN ({','.join(['?']*len(keys))})",
                (sesion_id, *keys),
            )
            for metrica, valor, unidad in metricas:
                if valor is None:
                    continue
                cur.execute(
                    "INSERT INTO sesion_metricas (sesion_id, metrica, valor, unidad) VALUES (?, ?, ?, ?)",
                    (sesion_id, metrica, float(valor), unidad),
                )

        if km_real is not None:
            km_plan = asignado.get('km_previstos') if isinstance(asignado, dict) else None
            fecha_entreno = asignado.get('fecha') if isinstance(asignado, dict) else None
            upsert_km_realizados(
                cur,
                entrenamiento_id,
                float(km_plan) if km_plan is not None else None,
                km_real,
                fecha_entreno or datetime.utcnow(),
            )

        conn.commit()

        return jsonify({
            'message': 'Archivo FIT registrado',
            'archivo_id': archivo_id,
            'sesion_id': sesion_id,
            'metricas': metrics,
            'parse_error': parse_error,
        }), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': 'No se pudo registrar el archivo', 'details': str(e)}), 500
    finally:
        cur.close()
        conn.close()

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


def ensure_alertas_table():
    """
    Asegura la tabla de alertas en ambos motores.
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        if DB_ENGINE == "mariadb":
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS alertas_entrenamientos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    entrenamiento_asignado_id INT NOT NULL,
                    atleta_id INT NOT NULL,
                    tipo VARCHAR(10) NOT NULL,
                    codigo VARCHAR(50) NOT NULL,
                    mensaje TEXT NOT NULL,
                    fecha_detectada DATETIME NOT NULL,
                    activo TINYINT DEFAULT 1,
                    UNIQUE KEY uniq_alerta_entreno (entrenamiento_asignado_id, codigo),
                    INDEX idx_alerta_atleta (atleta_id),
                    CONSTRAINT fk_alerta_entrenamiento
                        FOREIGN KEY (entrenamiento_asignado_id)
                        REFERENCES entrenamientos_asignados(id)
                        ON DELETE CASCADE,
                    CONSTRAINT fk_alerta_atleta
                        FOREIGN KEY (atleta_id)
                        REFERENCES usuarios(id)
                        ON DELETE CASCADE
                )
                """
            )
        else:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS alertas_entrenamientos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entrenamiento_asignado_id INTEGER NOT NULL,
                    atleta_id INTEGER NOT NULL,
                    tipo TEXT NOT NULL,
                    codigo TEXT NOT NULL,
                    mensaje TEXT NOT NULL,
                    fecha_detectada TEXT NOT NULL,
                    activo INTEGER DEFAULT 1,
                    UNIQUE(entrenamiento_asignado_id, codigo)
                )
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_alerta_atleta
                ON alertas_entrenamientos(atleta_id)
                """
            )
        conn.commit()
    finally:
        cur.close()
        conn.close()



# ensure_v2_tables()
def _coerce_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _segundos_desde_unidad(valor, unidad):
    if valor is None:
        return None
    try:
        val = float(valor)
    except Exception:
        return None
    if not unidad:
        return None
    unidad = str(unidad).strip().lower()
    if unidad in ("s", "seg", "segundo", "segundos", "sec", "secs"):
        return val
    if unidad in ("min", "mins", "minuto", "minutos", "m"):
        return val * 60
    if unidad in ("h", "hora", "horas"):
        return val * 3600
    return None


def _planificacion_desde_pasos(pasos):
    if not pasos:
        return None, []
    children = {}
    for p in pasos:
        parent = p.get('parent_id')
        children.setdefault(parent, []).append(p)

    def _es_objetivo_tiempo(paso):
        objetivo_tipo = (paso.get('objetivo_tipo') or '').strip().lower()
        if objetivo_tipo in ("tiempo", "duracion", "time"):
            return True
        if objetivo_tipo in ("distancia", "distance", "dist"):
            return False
        unidad = (paso.get('unidad') or '').strip().lower()
        return unidad in ("s", "seg", "segundo", "segundos", "sec", "secs", "min", "mins", "minuto", "minutos", "h", "hora", "horas")

    def _normalizar_zona(zona):
        if zona is None:
            return None
        z = str(zona).strip()
        if not z:
            return None
        if z[0].lower() == 'z':
            z = z[1:]
        return z

    def _calc(parent_id):
        total = 0.0
        zonas = {}
        for paso in children.get(parent_id, []):
            tipo = paso.get('tipo_paso') or paso.get('tipo')
            rep = 1
            try:
                rep = int(paso.get('repeticiones') or 1)
            except Exception:
                rep = 1
            if tipo == 'repeat':
                sub_total, sub_zonas = _calc(paso.get('id'))
                total += sub_total * rep
                for zona, count in sub_zonas.items():
                    zonas[zona] = zonas.get(zona, 0) + count * rep
                continue

            dur = None
            if _es_objetivo_tiempo(paso):
                dur = _segundos_desde_unidad(paso.get('objetivo_valor'), paso.get('unidad'))
            rec = _segundos_desde_unidad(paso.get('recuperacion_valor'), paso.get('recuperacion_unidad'))
            if dur:
                total += dur
            if rec:
                total += rec

            zona = _normalizar_zona(paso.get('zona'))
            if zona:
                zonas[zona] = zonas.get(zona, 0) + 1
        return total, zonas

    dur_total, zonas = _calc(None)
    dur_total = None if dur_total <= 0 else dur_total
    zonas_list = [{'zona': z, 'repeticiones': c} for z, c in sorted(zonas.items())]
    return dur_total, zonas_list




def _ritmo_seg_km_desde_valor(valor):
    if valor is None:
        return None
    try:
        val = float(valor)
    except Exception:
        return None
    if val <= 0:
        return None
    # Heurística: >15 = km/h, si no, min/km
    if val > 15:
        return 3600.0 / val
    return val * 60.0




def _zonas_fc_bounds(zonas):
    if not zonas:
        return []
    bounds = []
    for i in range(1, 7):
        key = f"fc_z{i}"
        val = zonas.get(key)
        try:
            if val is None:
                continue
            bounds.append((i, float(val)))
        except Exception:
            continue
    bounds.sort(key=lambda x: x[1])
    return bounds


def _zona_por_fc(fc, bounds):
    if fc is None or not bounds:
        return None
    try:
        fc_val = float(fc)
    except Exception:
        return None
    zona = None
    for z, max_fc in bounds:
        if fc_val <= max_fc:
            zona = f"Z{z}"
            break
    if zona is None:
        zona = f"Z{bounds[-1][0]}"
    return zona

def _zonas_ritmo_en_segundos(zonas):
    if not zonas:
        return {}
    zonas_seg = {}
    for i in range(1, 7):
        key = f"z{i}"
        if key in zonas:
            ritmo = _ritmo_seg_km_desde_valor(zonas.get(key))
            if ritmo:
                zonas_seg[key.upper()] = ritmo
    return zonas_seg


def _zona_mas_cercana(pace_seg, zonas_seg):
    if pace_seg is None or not zonas_seg:
        return None
    mejor = None
    mejor_diff = None
    for zona, target in zonas_seg.items():
        diff = abs(pace_seg - target)
        if mejor_diff is None or diff < mejor_diff:
            mejor = zona
            mejor_diff = diff
    return mejor


def _resumen_zonas_plan(pasos, zonas_atleta):
    zonas_seg = _zonas_ritmo_en_segundos(zonas_atleta)
    if not pasos:
        return {}
    children = {}
    for p in pasos:
        parent = p.get('parent_id')
        children.setdefault(parent, []).append(p)

    resumen = {}

    def _add(zona, distancia_km=None, tiempo_seg=None):
        if not zona:
            return
        entry = resumen.setdefault(zona, {'distancia_km': 0.0, 'tiempo_seg': 0.0})
        if distancia_km is not None:
            entry['distancia_km'] += float(distancia_km)
        if tiempo_seg is not None:
            entry['tiempo_seg'] += float(tiempo_seg)

    def _calc(parent_id):
        for paso in children.get(parent_id, []):
            tipo = paso.get('tipo_paso') or paso.get('tipo')
            rep = 1
            try:
                rep = int(paso.get('repeticiones') or 1)
            except Exception:
                rep = 1
            if tipo == 'repeat':
                for _ in range(rep):
                    _calc(paso.get('id'))
                continue

            zona_raw = paso.get('zona')
            zona = None
            if zona_raw is not None:
                z = str(zona_raw).strip()
                if z.lower().startswith('z'):
                    z = z[1:]
                if z:
                    zona = f"Z{z}"

            objetivo_tipo = (paso.get('objetivo_tipo') or '').lower()
            unidad = (paso.get('unidad') or '').lower()
            val = paso.get('objetivo_valor')

            # distancia
            distancia_km = None
            if objetivo_tipo in ('distancia', 'distance', 'dist') or unidad in ('km', 'kilometro', 'kilometros', 'm', 'metro', 'metros'):
                try:
                    v = float(val)
                    if unidad in ('m', 'metro', 'metros'):
                        distancia_km = v / 1000.0
                    else:
                        distancia_km = v
                except Exception:
                    distancia_km = None

            # tiempo
            tiempo_seg = None
            if objetivo_tipo in ('tiempo', 'duracion', 'time') or unidad in ('s', 'seg', 'segundo', 'segundos', 'sec', 'secs', 'min', 'mins', 'minuto', 'minutos', 'h', 'hora', 'horas'):
                tiempo_seg = _segundos_desde_unidad(val, unidad)

            # si hay distancia y ritmo, estimar tiempo
            if distancia_km is not None and zona in zonas_seg:
                tiempo_seg = tiempo_seg or (distancia_km * zonas_seg.get(zona))

            # si hay tiempo y ritmo, estimar distancia
            if tiempo_seg is not None and (distancia_km is None) and zona in zonas_seg:
                try:
                    distancia_km = tiempo_seg / zonas_seg.get(zona)
                except Exception:
                    pass

            if distancia_km is not None or tiempo_seg is not None:
                _add(zona, distancia_km, tiempo_seg)

            # recuperacion
            rec_val = paso.get('recuperacion_valor')
            rec_uni = (paso.get('recuperacion_unidad') or '').lower()
            rec_seg = _segundos_desde_unidad(rec_val, rec_uni)
            if rec_seg:
                _add(zona, None, rec_seg)

    _calc(None)
    return resumen




def _resumen_zonas_real_fc_desde_fit(file_path, zonas_atleta):
    bounds = _zonas_fc_bounds(zonas_atleta)
    if not bounds:
        return {}
    resumen = {}

    def _add(zona, tiempo_seg):
        if not zona:
            return
        entry = resumen.setdefault(zona, {'distancia_km': 0.0, 'tiempo_seg': 0.0})
        entry['tiempo_seg'] += float(tiempo_seg or 0)

    try:
        from fitdecode import FitReader  # type: ignore
        from fitdecode.records import FitDataMessage  # type: ignore
    except Exception:
        return {}

    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        last_ts = None
        last_hr = None
        with FitReader(file_path) as fit:
            for frame in fit:
                if not isinstance(frame, FitDataMessage):
                    continue
                if frame.name != 'record':
                    continue
                try:
                    ts = frame.get_value('timestamp')
                    hr = frame.get_value('heart_rate')
                except Exception:
                    continue

                if ts is None or last_ts is None:
                    last_ts = ts
                    last_hr = hr
                    continue

                dt = None
                try:
                    dt = (ts - last_ts).total_seconds()
                except Exception:
                    dt = None
                if not dt or dt <= 0:
                    last_ts = ts
                    last_hr = hr
                    continue

                # usamos el HR del tramo previo
                zona = _zona_por_fc(last_hr, bounds)
                _add(zona, dt)

                last_ts = ts
                last_hr = hr

    return resumen

def _resumen_zonas_real_desde_fit(file_path, zonas_atleta):
    zonas_seg = _zonas_ritmo_en_segundos(zonas_atleta)
    if not zonas_seg:
        return {}
    resumen = {}

    def _add(zona, distancia_km, tiempo_seg):
        if not zona:
            return
        entry = resumen.setdefault(zona, {'distancia_km': 0.0, 'tiempo_seg': 0.0})
        entry['distancia_km'] += float(distancia_km or 0)
        entry['tiempo_seg'] += float(tiempo_seg or 0)

    try:
        from fitdecode import FitReader  # type: ignore
        from fitdecode.records import FitDataMessage  # type: ignore
    except Exception:
        return {}

    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        last_ts = None
        last_dist = None
        with FitReader(file_path) as fit:
            for frame in fit:
                if not isinstance(frame, FitDataMessage):
                    continue
                if frame.name != 'record':
                    continue
                try:
                    ts = frame.get_value('timestamp')
                    dist = frame.get_value('distance')
                    speed = frame.get_value('speed')
                except Exception:
                    continue

                if ts is None or last_ts is None:
                    last_ts = ts
                    last_dist = dist
                    continue

                dt = None
                try:
                    dt = (ts - last_ts).total_seconds()
                except Exception:
                    dt = None
                if not dt or dt <= 0:
                    last_ts = ts
                    last_dist = dist
                    continue

                delta_dist_m = None
                if dist is not None and last_dist is not None:
                    try:
                        delta_dist_m = float(dist) - float(last_dist)
                    except Exception:
                        delta_dist_m = None

                if delta_dist_m is None and speed is not None:
                    try:
                        delta_dist_m = float(speed) * dt
                    except Exception:
                        delta_dist_m = None

                pace_seg = None
                if speed is not None:
                    try:
                        speed = float(speed)
                        if speed > 0:
                            pace_seg = 1000.0 / speed
                    except Exception:
                        pace_seg = None
                if pace_seg is None and delta_dist_m:
                    try:
                        pace_seg = (dt / (delta_dist_m / 1000.0))
                    except Exception:
                        pace_seg = None

                zona = _zona_mas_cercana(pace_seg, zonas_seg)
                distancia_km = (delta_dist_m / 1000.0) if delta_dist_m else 0
                _add(zona, distancia_km, dt)

                last_ts = ts
                last_dist = dist

    return resumen


def _upsert_resumen_zona(cur, *, entrenamiento_id, atleta_id, tipo, fuente, zona, distancia_km, tiempo_seg):
    if DB_ENGINE == 'mariadb':
        cur.execute(
            '''
            INSERT INTO zonas_resumen_entrenamiento (
                entrenamiento_asignado_id, atleta_id, tipo, fuente, zona, distancia_km, tiempo_seg
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                distancia_km = VALUES(distancia_km),
                tiempo_seg = VALUES(tiempo_seg)
            ''',
            (entrenamiento_id, atleta_id, tipo, fuente, zona, distancia_km, tiempo_seg),
        )
    else:
        cur.execute(
            '''
            INSERT INTO zonas_resumen_entrenamiento (
                entrenamiento_asignado_id, atleta_id, tipo, fuente, zona, distancia_km, tiempo_seg
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(entrenamiento_asignado_id, tipo, fuente, zona) DO UPDATE SET
                distancia_km = excluded.distancia_km,
                tiempo_seg = excluded.tiempo_seg
            ''',
            (entrenamiento_id, atleta_id, tipo, fuente, zona, distancia_km, tiempo_seg),
        )


def _guardar_resumen_plan_zonas(cur, entrenamiento_id, atleta_id, pasos, zonas_atleta):
    resumen = _resumen_zonas_plan(pasos, zonas_atleta)
    for zona, valores in resumen.items():
        _upsert_resumen_zona(
            cur,
            entrenamiento_id=entrenamiento_id,
            atleta_id=atleta_id,
            tipo='plan',
            fuente='ritmo',
            zona=zona,
            distancia_km=valores.get('distancia_km'),
            tiempo_seg=valores.get('tiempo_seg'),
        )



def _guardar_resumen_plan_zonas_fc(cur, entrenamiento_id, atleta_id, pasos, zonas_atleta):
    # Si no hay zonas FC, no hacemos nada
    tiene_fc = any(zonas_atleta.get(f"fc_z{i}") for i in range(1, 7)) if zonas_atleta else False
    if not tiene_fc:
        return
    resumen = _resumen_zonas_plan(pasos, zonas_atleta)
    for zona, valores in resumen.items():
        _upsert_resumen_zona(
            cur,
            entrenamiento_id=entrenamiento_id,
            atleta_id=atleta_id,
            tipo='plan',
            fuente='fc',
            zona=zona,
            distancia_km=valores.get('distancia_km'),
            tiempo_seg=valores.get('tiempo_seg'),
        )

def _obtener_metricas_sesion(cur, sesion_id):
    if not sesion_id:
        return {}
    cur.execute(
        "SELECT metrica, valor, unidad FROM sesion_metricas WHERE sesion_id = ?",
        (sesion_id,),
    )
    rows = cur.fetchall()
    metricas = {}
    for r in rows:
        key = r['metrica'] if isinstance(r, dict) else r[0]
        val = r['valor'] if isinstance(r, dict) else r[1]
        metricas[key] = float(val) if val is not None else None
    return metricas




def obtener_zonas_atleta_por_fecha(cur, atleta_id, fecha_ref=None):
    params = [atleta_id]
    if fecha_ref:
        params.extend([fecha_ref, fecha_ref])
        query = '''
            SELECT vam, z1, z2, z3, z4, z5, z6, fc_z1, fc_z2, fc_z3, fc_z4, fc_z5, fc_z6, metodo, fecha_inicio, fecha_fin
            FROM zonas_entrenamiento
            WHERE atleta_id = ?
              AND fecha_inicio <= ?
              AND (fecha_fin IS NULL OR fecha_fin >= ?)
            ORDER BY fecha_inicio DESC
            LIMIT 1
        '''
    else:
        query = '''
            SELECT vam, z1, z2, z3, z4, z5, z6, fc_z1, fc_z2, fc_z3, fc_z4, fc_z5, fc_z6, metodo, fecha_inicio, fecha_fin
            FROM zonas_entrenamiento
            WHERE atleta_id = ?
            ORDER BY fecha_inicio DESC
            LIMIT 1
        '''
    cur.execute(query, tuple(params))
    row = cur.fetchone()
    return dict(row) if row else None

def _fecha_ts(valor):
    try:
        if hasattr(valor, "timestamp"):
            return int(valor.timestamp() * 1000)
    except Exception:
        pass
    try:
        if isinstance(valor, str) and valor:
            return int(datetime.fromisoformat(valor).timestamp() * 1000)
    except Exception:
        pass
    return int(datetime.utcnow().timestamp() * 1000)

def generar_alertas_resultado(item):
    """
    Genera alertas para un entrenamiento asignado según feedback y diferencias km.
    """
    alertas = []
    fb = item.get('feedback') or {}
    asignado_id = item.get('entrenamiento_asignado_id')
    atleta = item.get('atleta') or 'Atleta'
    entrenamiento = item.get('entrenamiento') or 'Entrenamiento'
    fecha_ts = _fecha_ts(item.get('fecha'))

    dolor = fb.get('dolor')
    if dolor:
        zona = fb.get('zona_dolor')
        alertas.append({
            'tipo': 'danger',
            'codigo': 'DOLOR',
            'texto': f"{atleta}: dolor{(' en ' + zona) if zona else ''} tras {entrenamiento}",
            'id': asignado_id,
            'ts': fecha_ts,
        })

    rpe_val = _coerce_float(fb.get('rpe'))
    if rpe_val is not None and rpe_val >= 8:
        tipo = 'danger' if rpe_val >= 9 else 'warning'
        nivel = 'muy alto' if rpe_val >= 9 else 'alto'
        codigo = 'RPE_MUY_ALTO' if rpe_val >= 9 else 'RPE_ALTO'
        alertas.append({
            'tipo': tipo,
            'codigo': codigo,
            'texto': f"{atleta}: RPE {nivel} ({int(rpe_val)}) en {entrenamiento}",
            'id': asignado_id,
            'ts': fecha_ts,
        })

    sensacion = (fb.get('sensacion') or '').strip().lower()
    if sensacion == 'mal':
        alertas.append({
            'tipo': 'warning',
            'codigo': 'SENSACION_MAL',
            'texto': f"{atleta}: malas sensaciones en {entrenamiento}",
            'id': asignado_id,
            'ts': fecha_ts,
        })

    fatiga = (fb.get('fatiga') or '').strip().lower()
    if fatiga == 'alta':
        alertas.append({
            'tipo': 'warning',
            'codigo': 'FATIGA_ALTA',
            'texto': f"{atleta}: fatiga alta reportada",
            'id': asignado_id,
            'ts': fecha_ts,
        })

    km_plan = _coerce_float(item.get('km_planificados'))
    km_real = _coerce_float(item.get('km_realizados'))
    if km_plan is not None and km_real is not None:
        delta = round(km_real - km_plan, 1)
        if abs(delta) >= 3:
            alertas.append({
                'tipo': 'info',
                'codigo': 'DELTA_KM',
                'texto': f"{atleta}: diferencia de {delta:+g} km vs plan en {entrenamiento}",
                'id': asignado_id,
                'ts': fecha_ts,
            })

    return alertas

def ensure_v2_tables():
    conn = get_db()
    cur = conn.cursor()
    try:
        if DB_ENGINE == "mariadb":
            cur.execute(
                '''
                CREATE TABLE IF NOT EXISTS sesiones_realizadas (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    entrenamiento_asignado_id INT NOT NULL UNIQUE,
                    atleta_id INT NOT NULL,
                    fecha_real DATETIME NULL,
                    km_real DOUBLE DEFAULT 0,
                    duracion_real_seg INT NULL,
                    rpe INT NULL,
                    sensacion VARCHAR(20) NULL,
                    fatiga VARCHAR(20) NULL,
                    dolor TINYINT DEFAULT 0,
                    zona_dolor VARCHAR(50) NULL,
                    completado TINYINT DEFAULT 1,
                    comentario TEXT,
                    origen_datos VARCHAR(20) DEFAULT 'manual',
                    archivo_principal_id INT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_sesion_atleta (atleta_id),
                    CONSTRAINT fk_sesion_entrenamiento FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id) ON DELETE CASCADE,
                    CONSTRAINT fk_sesion_atleta FOREIGN KEY (atleta_id) REFERENCES usuarios(id) ON DELETE CASCADE
                )
                '''
            )
            cur.execute(
                '''
                CREATE TABLE IF NOT EXISTS sesion_metricas (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    sesion_id INT NOT NULL,
                    metrica VARCHAR(50) NOT NULL,
                    valor DOUBLE NOT NULL,
                    unidad VARCHAR(20),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_metricas_sesion (sesion_id),
                    CONSTRAINT fk_metricas_sesion FOREIGN KEY (sesion_id) REFERENCES sesiones_realizadas(id) ON DELETE CASCADE
                )
                '''
            )
            cur.execute(
                '''
                CREATE TABLE IF NOT EXISTS sesion_archivos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    sesion_id INT NULL,
                    atleta_id INT NOT NULL,
                    origen VARCHAR(20) DEFAULT 'manual',
                    filename VARCHAR(255),
                    mime VARCHAR(100),
                    tamano INT NULL,
                    ruta_storage TEXT,
                    hash_sha256 VARCHAR(64),
                    fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP,
                    procesado TINYINT DEFAULT 0,
                    error_procesado TEXT,
                    INDEX idx_archivo_sesion (sesion_id),
                    INDEX idx_archivo_atleta (atleta_id),
                    CONSTRAINT fk_archivo_sesion FOREIGN KEY (sesion_id) REFERENCES sesiones_realizadas(id) ON DELETE SET NULL,
                    CONSTRAINT fk_archivo_atleta FOREIGN KEY (atleta_id) REFERENCES usuarios(id) ON DELETE CASCADE
                )
                '''
            )
            cur.execute(
                '''
                CREATE TABLE IF NOT EXISTS alertas_reglas (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    entrenador_id INT NOT NULL,
                    codigo VARCHAR(50) NOT NULL,
                    parametros_json JSON NULL,
                    activo TINYINT DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_reglas_entrenador (entrenador_id),
                    CONSTRAINT fk_regla_entrenador FOREIGN KEY (entrenador_id) REFERENCES usuarios(id) ON DELETE CASCADE
                )
                '''
            )
            cur.execute(
                '''
                CREATE TABLE IF NOT EXISTS zonas_resumen_entrenamiento (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    entrenamiento_asignado_id INT NOT NULL,
                    atleta_id INT NOT NULL,
                    tipo VARCHAR(10) NOT NULL,
                    fuente VARCHAR(10) NOT NULL DEFAULT 'ritmo',
                    zona VARCHAR(4) NOT NULL,
                    distancia_km DOUBLE NULL,
                    tiempo_seg INT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_zona_resumen (entrenamiento_asignado_id, tipo, fuente, zona),
                    INDEX idx_zona_resumen_atleta (atleta_id),
                    CONSTRAINT fk_zona_resumen_entreno FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id) ON DELETE CASCADE,
                    CONSTRAINT fk_zona_resumen_atleta FOREIGN KEY (atleta_id) REFERENCES usuarios(id) ON DELETE CASCADE
                )
                '''
            )
        else:
            cur.execute(
                '''
                CREATE TABLE IF NOT EXISTS sesiones_realizadas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entrenamiento_asignado_id INTEGER NOT NULL UNIQUE,
                    atleta_id INTEGER NOT NULL,
                    fecha_real TEXT,
                    km_real REAL DEFAULT 0,
                    duracion_real_seg INTEGER,
                    rpe INTEGER,
                    sensacion TEXT,
                    fatiga TEXT,
                    dolor INTEGER DEFAULT 0,
                    zona_dolor TEXT,
                    completado INTEGER DEFAULT 1,
                    comentario TEXT,
                    origen_datos TEXT DEFAULT 'manual',
                    archivo_principal_id INTEGER,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                '''
            )
            cur.execute(
                '''
                CREATE TABLE IF NOT EXISTS sesion_metricas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sesion_id INTEGER NOT NULL,
                    metrica TEXT NOT NULL,
                    valor REAL NOT NULL,
                    unidad TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                '''
            )
            cur.execute(
                '''
                CREATE TABLE IF NOT EXISTS sesion_archivos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sesion_id INTEGER,
                    atleta_id INTEGER NOT NULL,
                    origen TEXT DEFAULT 'manual',
                    filename TEXT,
                    mime TEXT,
                    tamano INTEGER,
                    ruta_storage TEXT,
                    hash_sha256 TEXT,
                    fecha_subida TEXT DEFAULT CURRENT_TIMESTAMP,
                    procesado INTEGER DEFAULT 0,
                    error_procesado TEXT
                )
                '''
            )
            cur.execute(
                '''
                CREATE TABLE IF NOT EXISTS alertas_reglas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entrenador_id INTEGER NOT NULL,
                    codigo TEXT NOT NULL,
                    parametros_json TEXT,
                    activo INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                '''
            )
        conn.commit()
    finally:
        cur.close()
        conn.close()




ensure_v2_tables()

def upsert_sesion_realizada(conn, *, entrenamiento_asignado_id, atleta_id, fecha_real=None, km_real=None, duracion_real_seg=None, origen_datos='manual'):
    cur = conn.cursor()
    try:
        if DB_ENGINE == 'mariadb':
            cur.execute(
                '''
                INSERT INTO sesiones_realizadas (
                    entrenamiento_asignado_id, atleta_id, fecha_real, km_real, duracion_real_seg, origen_datos
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    atleta_id = VALUES(atleta_id),
                    fecha_real = VALUES(fecha_real),
                    km_real = VALUES(km_real),
                    duracion_real_seg = VALUES(duracion_real_seg),
                    origen_datos = VALUES(origen_datos)
                ''',
                (entrenamiento_asignado_id, atleta_id, fecha_real, km_real, duracion_real_seg, origen_datos),
            )
        else:
            cur.execute(
                '''
                INSERT INTO sesiones_realizadas (
                    entrenamiento_asignado_id, atleta_id, fecha_real, km_real, duracion_real_seg, origen_datos
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(entrenamiento_asignado_id) DO UPDATE SET
                    atleta_id = excluded.atleta_id,
                    fecha_real = excluded.fecha_real,
                    km_real = excluded.km_real,
                    duracion_real_seg = excluded.duracion_real_seg,
                    origen_datos = excluded.origen_datos
                ''',
                (entrenamiento_asignado_id, atleta_id, fecha_real, km_real, duracion_real_seg, origen_datos),
            )
    finally:
        cur.close()

def actualizar_sesion_feedback(conn, *, entrenamiento_asignado_id, atleta_id, comentario, rpe, sensacion, fatiga, dolor, zona_dolor, completado):
    cur = conn.cursor()
    try:
        if DB_ENGINE == 'mariadb':
            cur.execute(
                '''
                INSERT INTO sesiones_realizadas (
                    entrenamiento_asignado_id, atleta_id, comentario, rpe, sensacion, fatiga, dolor, zona_dolor, completado
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    comentario = VALUES(comentario),
                    rpe = VALUES(rpe),
                    sensacion = VALUES(sensacion),
                    fatiga = VALUES(fatiga),
                    dolor = VALUES(dolor),
                    zona_dolor = VALUES(zona_dolor),
                    completado = VALUES(completado)
                ''',
                (entrenamiento_asignado_id, atleta_id, comentario, rpe, sensacion, fatiga, dolor, zona_dolor, completado),
            )
        else:
            cur.execute(
                '''
                INSERT INTO sesiones_realizadas (
                    entrenamiento_asignado_id, atleta_id, comentario, rpe, sensacion, fatiga, dolor, zona_dolor, completado
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(entrenamiento_asignado_id) DO UPDATE SET
                    comentario = excluded.comentario,
                    rpe = excluded.rpe,
                    sensacion = excluded.sensacion,
                    fatiga = excluded.fatiga,
                    dolor = excluded.dolor,
                    zona_dolor = excluded.zona_dolor,
                    completado = excluded.completado
                ''',
                (entrenamiento_asignado_id, atleta_id, comentario, rpe, sensacion, fatiga, dolor, zona_dolor, completado),
            )
    finally:
        cur.close()


def _persistir_alertas(conn, alertas, atleta_id):
    if not alertas:
        return 0

    cur = conn.cursor()
    try:
        now_str = datetime.utcnow().isoformat(" ", "seconds")
        count = 0
        for alerta in alertas:
            asignado_id = alerta.get("id")
            if not asignado_id:
                continue
            codigo = alerta.get("codigo") or "ALERTA"
            mensaje = alerta.get("texto") or ""
            tipo = alerta.get("tipo") or "info"

            if DB_ENGINE == "mariadb":
                cur.execute(
                    """
                    INSERT INTO alertas_entrenamientos
                        (entrenamiento_asignado_id, atleta_id, tipo, codigo, mensaje, fecha_detectada, activo)
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                    ON DUPLICATE KEY UPDATE
                        atleta_id = VALUES(atleta_id),
                        tipo = VALUES(tipo),
                        mensaje = VALUES(mensaje),
                        fecha_detectada = VALUES(fecha_detectada),
                        activo = 1
                    """,
                    (asignado_id, atleta_id, tipo, codigo, mensaje, now_str),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO alertas_entrenamientos
                        (entrenamiento_asignado_id, atleta_id, tipo, codigo, mensaje, fecha_detectada, activo)
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                    ON CONFLICT(entrenamiento_asignado_id, codigo) DO UPDATE SET
                        atleta_id = excluded.atleta_id,
                        tipo = excluded.tipo,
                        mensaje = excluded.mensaje,
                        fecha_detectada = excluded.fecha_detectada,
                        activo = 1
                    """,
                    (asignado_id, atleta_id, tipo, codigo, mensaje, now_str),
                )
            count += 1
        return count
    finally:
        cur.close()

@app.route('/estadisticas/entrenador/atletas', methods=['GET'])
@app.route('/atletas/estadisticas', methods=['GET'])
@requires_roles('entrenador', 'admin')
def estadisticas_listar_atletas(current_user):
    try:
        if current_user.get('rol') == 'entrenador':
            filas = query_db("""
                SELECT id, nombre, apellidos, email
                FROM usuarios
                WHERE rol = 'atleta' AND entrenador_id = ?
                ORDER BY nombre
            """, (current_user['id'],))
        else:
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
        # --- MariaDB: kms por semana (CORREGIDO) ---

            base_fecha = "ea.fecha"
            lunes_semana = f"DATE_SUB(DATE({base_fecha}), INTERVAL WEEKDAY({base_fecha}) DAY)"

            # Km PLANIFICADOS (siempre desde entrenamientos_asignados)
            plan_rows = query_db(f"""
                SELECT
                {lunes_semana} AS lunes_semana,
                SUM(COALESCE(ea.km_previstos, 0)) AS km_planificados
                FROM entrenamientos_asignados ea
                WHERE ea.atleta_id = ?
                GROUP BY lunes_semana
                ORDER BY lunes_semana
            """, (atleta_id,))

        
            # Km REALIZADOS (desde km_realizados_entrenamientos)

            real_rows = query_db(f"""
                SELECT
                    {lunes_semana} AS lunes_semana,
                    SUM(km_por_entreno.km_realizados) AS km_realizados
                FROM entrenamientos_asignados ea
                LEFT JOIN (
                    SELECT
                        entrenamiento_asignado_id,
                        SUM(km_realizados) AS km_realizados
                    FROM km_realizados_entrenamientos
                    GROUP BY entrenamiento_asignado_id
                ) km_por_entreno
                ON km_por_entreno.entrenamiento_asignado_id = ea.id
                WHERE ea.atleta_id = ?
                GROUP BY lunes_semana
                ORDER BY lunes_semana
            """, (atleta_id,))

        plan_dict = {
            row["lunes_semana"]: round(row["km_planificados"] or 0, 2)
            for row in plan_rows
            if row["lunes_semana"]
        }
        # Rellenamos semanas sin km_planificados usando km_previstos de entrenamientos_asignados
        if DB_ENGINE == "mariadb":
            plan_prev_rows = query_db(f"""
                SELECT
                  {lunes_semana} AS lunes_semana,
                  SUM(COALESCE(ea.km_previstos, 0)) AS km_planificados
                FROM entrenamientos_asignados ea
                WHERE ea.atleta_id = ?
                GROUP BY lunes_semana
                ORDER BY lunes_semana
            """, (atleta_id,))
        else:
            plan_prev_rows = query_db("""
                SELECT
                  date(ea.fecha, 'weekday 1', '-7 days') AS lunes_semana,
                  SUM(COALESCE(ea.km_previstos, 0)) AS km_planificados
                FROM entrenamientos_asignados ea
                WHERE ea.atleta_id = ?
                GROUP BY lunes_semana
                ORDER BY lunes_semana
            """, (atleta_id,))
        for row in plan_prev_rows:
            semana = row.get("lunes_semana")
            if not semana:
                continue
            if semana not in plan_dict or plan_dict.get(semana, 0) == 0:
                plan_dict[semana] = round(row["km_planificados"] or 0, 2)
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

        # 3bis) Resumen de tiempo en zonas (plan vs real) de la semana actual
        zonas_semana = {
            "ritmo": {"zonas": [], "totales": {"plan_seg": 0.0, "real_seg": 0.0}},
            "fc": {"zonas": [], "totales": {"plan_seg": 0.0, "real_seg": 0.0}},
        }
        try:
            hoy = datetime.now().date()
            inicio_semana = hoy - timedelta(days=hoy.weekday())
            fin_semana = inicio_semana + timedelta(days=6)
            inicio_str = inicio_semana.isoformat()
            fin_str = fin_semana.isoformat()

            conn_z = get_db()
            cur_z = conn_z.cursor()

            cur_z.execute(
                """
                SELECT id, fecha
                FROM entrenamientos_asignados
                WHERE atleta_id = ?
                  AND DATE(fecha) BETWEEN ? AND ?
                """,
                (atleta_id, inicio_str, fin_str),
            )
            asignados_semana = cur_z.fetchall()

            for a in asignados_semana:
                ent_id = a["id"] if isinstance(a, dict) else a[0]
                fecha_ent = a["fecha"] if isinstance(a, dict) else a[1]
                zonas_atleta = None
                try:
                    zonas_atleta = obtener_zonas_atleta_por_fecha(cur_z, atleta_id, fecha_ent)
                except Exception:
                    zonas_atleta = None
                if zonas_atleta:
                    cur_z.execute(
                        """
                        SELECT parent_id, id, tipo_paso, repeticiones, objetivo_tipo, objetivo_valor, unidad,
                               zona, recuperacion_valor, recuperacion_unidad
                        FROM entrenamientos_asignados_detalle
                        WHERE entrenamiento_asignado_id = ?
                        """,
                        (ent_id,),
                    )
                    pasos = [dict(p) for p in cur_z.fetchall()]
                    if pasos:
                        _guardar_resumen_plan_zonas(cur_z, ent_id, atleta_id, pasos, zonas_atleta)
                        _guardar_resumen_plan_zonas_fc(cur_z, ent_id, atleta_id, pasos, zonas_atleta)

                cur_z.execute(
                    """
                    SELECT sa.ruta_storage
                    FROM sesiones_realizadas sr
                    LEFT JOIN sesion_archivos sa ON sa.id = sr.archivo_principal_id
                    WHERE sr.entrenamiento_asignado_id = ?
                    """,
                    (ent_id,),
                )
                row = cur_z.fetchone()
                ruta = row["ruta_storage"] if isinstance(row, dict) else (row[0] if row else None)
                if ruta and os.path.exists(ruta) and zonas_atleta:
                    resumen_real = _resumen_zonas_real_desde_fit(ruta, zonas_atleta)
                    resumen_real_fc = _resumen_zonas_real_fc_desde_fit(ruta, zonas_atleta)
                    for zona, valores in (resumen_real or {}).items():
                        _upsert_resumen_zona(
                            cur_z,
                            entrenamiento_id=ent_id,
                            atleta_id=atleta_id,
                            tipo="real",
                            fuente="ritmo",
                            zona=zona,
                            distancia_km=valores.get("distancia_km"),
                            tiempo_seg=valores.get("tiempo_seg"),
                        )
                    for zona, valores in (resumen_real_fc or {}).items():
                        _upsert_resumen_zona(
                            cur_z,
                            entrenamiento_id=ent_id,
                            atleta_id=atleta_id,
                            tipo="real",
                            fuente="fc",
                            zona=zona,
                            distancia_km=None,
                            tiempo_seg=valores.get("tiempo_seg"),
                        )

            conn_z.commit()

            cur_z.execute(
                """
                SELECT fuente, tipo, zona, SUM(tiempo_seg) AS tiempo_seg
                FROM zonas_resumen_entrenamiento zr
                JOIN entrenamientos_asignados ea ON ea.id = zr.entrenamiento_asignado_id
                WHERE ea.atleta_id = ?
                  AND DATE(ea.fecha) BETWEEN ? AND ?
                GROUP BY fuente, tipo, zona
                """,
                (atleta_id, inicio_str, fin_str),
            )
            rows = cur_z.fetchall()

            def build_resumen(fuente):
                plan_map = {}
                real_map = {}
                for r in rows:
                    r_fuente = r["fuente"] if isinstance(r, dict) else r[0]
                    if r_fuente != fuente:
                        continue
                    tipo = r["tipo"] if isinstance(r, dict) else r[1]
                    zona = r["zona"] if isinstance(r, dict) else r[2]
                    tiempo = r["tiempo_seg"] if isinstance(r, dict) else r[3]
                    if not zona:
                        continue
                    if tipo == "plan":
                        plan_map[zona] = float(tiempo or 0)
                    elif tipo == "real":
                        real_map[zona] = float(tiempo or 0)

                zonas = []
                total_plan = 0.0
                total_real = 0.0
                for i in range(1, 7):
                    z = f"Z{i}"
                    plan_seg = float(plan_map.get(z, 0) or 0)
                    real_seg = float(real_map.get(z, 0) or 0)
                    total_plan += plan_seg
                    total_real += real_seg
                    zonas.append(
                        {
                            "zona": z,
                            "plan_seg": plan_seg,
                            "real_seg": real_seg,
                            "plan_pct": None,
                            "real_pct": None,
                        }
                    )
                for item in zonas:
                    if total_plan > 0:
                        item["plan_pct"] = (item["plan_seg"] / total_plan * 100.0)
                    if total_real > 0:
                        item["real_pct"] = (item["real_seg"] / total_real * 100.0)
                return {"zonas": zonas, "totales": {"plan_seg": total_plan, "real_seg": total_real}}

            zonas_semana = {
                "ritmo": build_resumen("ritmo"),
                "fc": build_resumen("fc"),
            }
        except Exception as e:
            print("Error calculando zonas semana:", e)
            zonas_semana = {
                "ritmo": {"zonas": [], "totales": {"plan_seg": 0.0, "real_seg": 0.0}},
                "fc": {"zonas": [], "totales": {"plan_seg": 0.0, "real_seg": 0.0}},
            }
        finally:
            try:
                cur_z.close()
                conn_z.close()
            except Exception:
                pass

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
            "zonas_semana": zonas_semana,
            "tipos": tipos_resumen
        }
        return jsonify(respuesta), 200

    except Exception as e:
        print("Error en análisis de atleta:", e)
        return jsonify({"error": "No se pudieron obtener las estadísticas."}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
