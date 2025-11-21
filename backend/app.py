from flask import Flask, jsonify, request, session
from flask import redirect, url_for
from flask_cors import CORS
from flask_session import Session
import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import os
from werkzeug.utils import secure_filename
import secrets

app = Flask(__name__, static_folder='../frontend/static')  # Configuración correcta de static_folder
CORS(app)
app.config["SESSION_PERMANENT"] = False  # Las sesiones expiran cuando se cierra el navegador
app.config["SESSION_TYPE"] = "filesystem"  # Almacena las sesiones en el sistema de archivos (para desarrollo)
app.config["SESSION_FILE_DIR"] = "flask_session"  # Directorio para almacenar archivos de sesión
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "DEV_KEY_CAMBIALA")  # ¡Reemplaza con una clave segura!
app.config["SESSION_COOKIE_NAME"] = "my_session"  # Nombre de la cookie de sesión
app.config["SESSION_COOKIE_HTTPONLY"] = True  # Recomendado por seguridad
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"  # Recomendado por seguridad
app.config["SESSION_COOKIE_SECURE"] = True  # 1 hora de duración de la sesión
Session(app)
DATABASE = 'atletas.db'


def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def query_db(query, args=(), one=False):
    conn = get_db()
    cur = conn.execute(query, args)
    rv = cur.fetchall()
    cur.close()
    conn.close()
    return (rv[0] if rv else None) if one else rv


def execute_db(query, args=()):
    conn = get_db()
    cur = conn.execute(query, args)
    conn.commit()
    cur.close()
    conn.close()


def init_db():
    with app.app_context():
        db = get_db()
        with open('schema.sql', 'r') as f:
            db.cursor().executescript(f.read())
        db.commit()


@app.cli.command('initdb')
def initdb_command():
    """Initializes the database."""
    init_db()
    print('Initialized the database.')


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

    # Lógica de aprobado:
    # - atletas: pendiente (0)
    # - resto: aprobado directamente (1) -> ajusta si quieres validar también
    aprobado = 0 if rol == 'atleta' else 1

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

    except sqlite3.IntegrityError as e:
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

    user = query_db('SELECT id, rol, email, password_hash FROM usuarios WHERE email = ?', (email,), one=True)
    print(f'Usuario recuperado: {user}')

    if user and check_password_hash(user['password_hash'], password):
        print(f'Inicio de sesión exitoso. Rol: {user["rol"]}')
        session["user_id"] = user["id"]
        session["user_rol"] = user["rol"]
        session["user_email"] = user["email"]

        response = {
            'message': 'Inicio de sesión exitoso',
            'rol': user['rol'],
            'user_id': user['id']
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
            'INSERT INTO usuarios (nombre, apellidos, email, password_hash, rol) VALUES (?, ?, ?, ?, ?)',
            (nombre, apellidos, email, password_hash, rol)
        )
        return jsonify({'message': 'Usuario creado exitosamente'}), 201
    except sqlite3.IntegrityError:
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

    if not nombre or not apellidos or not email or not rol:
        return jsonify({'error': 'Todos los campos son obligatorios'}), 400

    if rol not in ('admin', 'entrenador', 'atleta'):
        return jsonify({'error': 'Rol inválido'}), 400

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
        foto = request.files.get('foto')
        foto_url = None

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
                "UPDATE usuarios SET nombre = ?, apellidos = ?, foto_url = ? WHERE id = ?",
                (nombre, apellidos, foto_url, usuario_id)
            )
        else:
            # Actualizar sin imagen
            execute_db(
                "UPDATE usuarios SET nombre = ?, apellidos = ? WHERE id = ?",
                (nombre, apellidos, usuario_id)
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
    pasos = data.get('pasos') or []

    if not nombre:
        return jsonify({'error': 'El nombre del entrenamiento es obligatorio'}), 400
    if not isinstance(pasos, list) or not pasos:
        return jsonify({'error': 'Debe incluir al menos un bloque (paso) en el entrenamiento'}), 400

    conn = get_db()
    conn.row_factory = sqlite3.Row
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
            INSERT INTO entrenamientos (nombre, objetivo, notas, bloque_principal)
            VALUES (?, ?, ?, ?)
            """,
            (nombre, objetivo, notas, bloque_principal)
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


@app.route('/entrenamientos', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamientos(current_user):
    entrenamientos = query_db('SELECT * FROM entrenamientos')
    return jsonify([dict(entrenamiento) for entrenamiento in entrenamientos])

def get_entrenamiento_con_pasos(entrenamiento_id: int):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # 1) Datos básicos del entrenamiento
    cur.execute("""
        SELECT id, nombre, objetivo, notas, bloque_principal
        FROM entrenamientos
        WHERE id = ?
    """, (entrenamiento_id,))
    row = cur.fetchone()

    if not row:
        cur.close()
        conn.close()
        return None

    entrenamiento = {
        "id": row["id"],
        "nombre": row["nombre"],
        "objetivo": row["objetivo"],
        "notas": row["notas"],
        "bloque_principal": row["bloque_principal"],
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
        entrenamiento = get_entrenamiento_con_pasos(id)
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

        # 3) Actualizar tabla principal de entrenamientos
        cur.execute(
            """
            UPDATE entrenamientos
            SET nombre = ?, objetivo = ?, notas = ?, bloque_principal = ?
            WHERE id = ?
            """,
            (nombre, objetivo, notas, bloque_principal, entrenamiento_id)
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
                "start": e["fecha"],
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


from flask import redirect, url_for

@app.route('/entrenamientos_asignados', methods=['POST'])
@requires_roles('admin', 'entrenador')
def asignar_entrenamiento_completo(current_user):
    data = request.get_json()
    required_fields = ['atleta_id', 'fecha', 'nombre', 'bloque_principal']

    if not all(data.get(field) for field in required_fields):
        return jsonify({'error': 'Faltan campos obligatorios'}), 400

    try:
        execute_db('''
            INSERT INTO entrenamientos_asignados (
                atleta_id, fecha, nombre, duracion_valor, duracion_tipo,
                calentamiento_tipo, calentamiento_valor, bloque_activacion,
                bloque_principal, enfriamiento_tipo, enfriamiento_valor
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['atleta_id'], data['fecha'], data['nombre'], data.get('duracion_valor'),
            data.get('duracion_tipo'), data.get('calentamiento_tipo'), data.get('calentamiento_valor'),
            data.get('bloque_activacion'), data['bloque_principal'], data.get('enfriamiento_tipo'),
            data.get('enfriamiento_valor')
        ))
        return jsonify({'message': 'Entrenamiento asignado correctamente'}), 201
    except Exception as e:
        print("Error en asignar_entrenamiento_completo:", e)
        return jsonify({'error': 'Error al asignar entrenamiento'}), 500


@app.route('/entrenamientos_asignados/<int:atleta_id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamientos_asignados(current_user, atleta_id):
    try:
        # Validación de permisos si el rol es atleta
        if session["user_rol"] == "atleta" and session["user_id"] != atleta_id:
            return jsonify({'error': 'Acceso no autorizado'}), 403

        entrenamientos = query_db(
            '''SELECT * FROM entrenamientos_asignados 
               WHERE atleta_id = ? ORDER BY fecha ASC''', 
            (atleta_id,)
        )
        return jsonify([dict(e) for e in entrenamientos]), 200
    except Exception as e:
        print(e)
        return jsonify({'error': 'Error al obtener entrenamientos asignados'}), 500

@app.route('/entrenamientos_asignados/uno/<int:id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamiento_asignado(current_user, id):
    entrenamiento = query_db('SELECT * FROM entrenamientos_asignados WHERE id = ?', (id,), one=True)
    if not entrenamiento:
        return jsonify({'error': 'Entrenamiento no encontrado'}), 404
    return jsonify(dict(entrenamiento)), 200

@app.route('/entrenamientos_asignados/<int:id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def editar_entrenamiento_asignado(current_user, id):
    data = request.get_json()
    required_fields = ['nombre', 'bloque_principal', 'fecha']  # atleta_id no se suele cambiar

    if not all(data.get(field) for field in required_fields):
        return jsonify({'error': 'Faltan campos obligatorios'}), 400

    try:
        execute_db('''
            UPDATE entrenamientos_asignados SET
                nombre = ?, duracion_valor = ?, duracion_tipo = ?, 
                calentamiento_tipo = ?, calentamiento_valor = ?, 
                bloque_activacion = ?, bloque_principal = ?, 
                enfriamiento_tipo = ?, enfriamiento_valor = ?, 
                fecha = ?
            WHERE id = ?
        ''', (
            data['nombre'], data.get('duracion_valor'), data.get('duracion_tipo'),
            data.get('calentamiento_tipo'), data.get('calentamiento_valor'),
            data.get('bloque_activacion'), data['bloque_principal'],
            data.get('enfriamiento_tipo'), data.get('enfriamiento_valor'),
            data['fecha'], id
        ))

        return jsonify({'message': 'Entrenamiento actualizado correctamente'}), 200
    except Exception as e:
        print(e)
        return jsonify({'error': 'Error al actualizar entrenamiento asignado'}), 500

@app.route('/entrenamientos_asignados/<int:id>', methods=['DELETE'])
@requires_roles('admin', 'entrenador')
def eliminar_entrenamiento_asignado(current_user, id):
    execute_db('DELETE FROM entrenamientos_asignados WHERE id = ?', (id,))
    return jsonify({'message': 'Entrenamiento asignado eliminado correctamente'}), 200

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

# --- Obtener atletas pendientes de aprobación ---
@app.route('/atletas_pendientes', methods=['GET'])
@requires_roles('entrenador')
def obtener_atletas_pendientes(current_user):
    try:
        atletas = query_db(
            '''SELECT * FROM usuarios 
               WHERE rol = 'atleta' AND entrenador_id = ? AND aprobado = 0''',
            (current_user['id'],)
        )
        return jsonify([dict(a) for a in atletas]), 200
    except Exception as e:
        print("Error al obtener atletas pendientes:", e)
        return jsonify({'error': 'Error al obtener atletas pendientes'}), 500

# --- Aprobar atleta y asignar grupo/subgrupo ---
@app.route('/atletas/aprobar/<int:atleta_id>', methods=['PUT'])
@requires_roles('entrenador')
def aprobar_atleta(current_user, atleta_id):
    data = request.get_json()
    grupo = data.get('grupo')
    subgrupo = data.get('subgrupo')

    try:
        execute_db(
            '''UPDATE usuarios SET aprobado = 1, grupo = ?, subgrupo = ? 
               WHERE id = ? AND entrenador_id = ? AND rol = 'atleta' ''',
            (grupo, subgrupo, atleta_id, current_user['id'])
        )
        return jsonify({'message': 'Atleta aprobado correctamente'}), 200
    except Exception as e:
        print("Error al aprobar atleta:", e)
        return jsonify({'error': 'Error al aprobar atleta'}), 500
        
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
    data = request.get_json()
    fecha = data.get("fecha")
    entrenamiento_id = data.get("entrenamiento_id")
    atletas_ids = data.get("atletas_ids", [])

    if not fecha or not entrenamiento_id or not atletas_ids:
        return jsonify({"error": "Faltan datos requeridos"}), 400

    try:
        # Obtener el entrenamiento tipo a copiar
        entrenamiento_base = query_db(
            "SELECT * FROM entrenamientos WHERE id = ?", (entrenamiento_id,), one=True
        )
        if not entrenamiento_base:
            return jsonify({"error": "Entrenamiento no encontrado"}), 404

        # Insertar para cada atleta
        for atleta_id in atletas_ids:
            execute_db(
                '''
                INSERT INTO entrenamientos_asignados (
                    atleta_id, fecha, nombre, duracion_valor, duracion_tipo,
                    calentamiento_tipo, calentamiento_valor, bloque_activacion,
                    bloque_principal, enfriamiento_tipo, enfriamiento_valor
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    atleta_id,
                    fecha,
                    entrenamiento_base["nombre"],
                    entrenamiento_base["duracion_valor"],
                    entrenamiento_base["duracion_tipo"],
                    entrenamiento_base["calentamiento_tipo"],
                    entrenamiento_base["calentamiento_valor"],
                    entrenamiento_base["bloque_activacion"],
                    entrenamiento_base["bloque_principal"],
                    entrenamiento_base["enfriamiento_tipo"],
                    entrenamiento_base["enfriamiento_valor"],
                ),
            )

        return jsonify({"message": "Entrenamiento asignado correctamente"}), 200

    except Exception as e:
        print("Error al asignar entrenamiento por lote:", e)
        return jsonify({"error": "Error interno al asignar entrenamiento"}), 500

@app.route('/feedback', methods=['POST'])
@requires_roles('atleta')
def enviar_feedback(current_user):
    data = request.get_json()
    entrenamiento_id = data.get("entrenamiento_id")
    comentario = data.get("comentario")
    atleta_id = current_user['id']

    if not entrenamiento_id or not comentario:
        return jsonify({"error": "Entrenamiento y comentario requeridos"}), 400

    try:
        execute_db(
            '''INSERT INTO feedbacks (entrenamiento_asignado_id, atleta_id, comentario) 
               VALUES (?, ?, ?)''',
            (entrenamiento_id, atleta_id, comentario)
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
                u.nombre || ' ' || u.apellidos AS atleta,
                ea.fecha AS fecha_entreno
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
                   u.nombre || ' ' || u.apellidos AS atleta,
                   ea.fecha AS fecha_entreno
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
@app.route('/feedbacks', methods=['GET'])
@requires_roles('entrenador')
def obtener_todos_los_feedbacks(current_user):
    try:
        query = '''
            SELECT f.id, f.comentario, f.fecha, f.leido, f.respuesta,
                   u.nombre || ' ' || u.apellidos AS atleta,
                   ea.fecha AS fecha_entreno
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

        execute_db('''
            INSERT INTO zonas_entrenamiento (atleta_id, vam, z1, z2, z3, z4, z5, z6)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (atleta_id, vam, zonas['z1'], zonas['z2'], zonas['z3'], zonas['z4'], zonas['z5'], zonas['z6']))

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

        if not all([atleta_id, vam, z1, z2, z3, z4, z5, z6]):
            return jsonify({"error": "Datos incompletos"}), 400

        # Eliminar zonas anteriores si existen
        execute_db("DELETE FROM zonas_entrenamiento WHERE atleta_id = ?", (atleta_id,))

        # Insertar las nuevas zonas
        execute_db('''
            INSERT INTO zonas_entrenamiento (atleta_id, vam, z1, z2, z3, z4, z5, z6)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (atleta_id, vam, z1, z2, z3, z4, z5, z6))

        return jsonify({"message": "Zonas guardadas correctamente"}), 200

    except Exception as e:
        print("Error al guardar zonas:", e)
        return jsonify({"error": "No se pudieron guardar las zonas"}), 500

from datetime import datetime, timedelta  # asegúrate de tener esto arriba del todo

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
        conn = sqlite3.connect(DATABASE)
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
            # actualizar por fecha, con soporte para "dia" o "semana"
            if modo == 'semana':
                # calcular lunes–domingo de la semana de 'fecha'
                try:
                    fecha_dt = datetime.strptime(fecha, "%Y-%m-%d").date()
                except ValueError:
                    return jsonify({'error': 'Fecha inválida'}), 400

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
                params.append(fecha)
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
        if updated is None or updated < 0:
            updated = conn.total_changes

        return jsonify({'ok': True, 'updated': updated}), 200

    except Exception as e:
        app.logger.exception('Error actualizando visibilidad grupal')
        return jsonify({'error': 'No se pudo actualizar la visibilidad'}), 500

    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

    """
    Acepta JSON:
      { "atletas": [3,4], "fecha": "2025-11-21", "visible": 1 }
    o:
      { "asignacion_id": 12, "atletas": [3,4], "visible": 1 }
    Devuelve: { ok: True, updated: N } o { error: '...' }
    """
    data = request.get_json(silent=True) or {}
    atletas = data.get('atletas') or []
    asignacion_id = data.get('asignacion_id')
    fecha = data.get('fecha')
    visible = data.get('visible')

    if not isinstance(atletas, list) or len(atletas) == 0:
        return jsonify({'error': 'Faltan atletas'}), 400
    if visible is None:
        return jsonify({'error': 'Falta campo visible'}), 400

    try:
        visible_val = 1 if int(visible) else 0
    except Exception:
        visible_val = 1 if bool(visible) else 0

    try:
        conn = sqlite3.connect(DATABASE)
        cur = conn.cursor()

        placeholders = ','.join(['?'] * len(atletas))
        params = [visible_val]

        if asignacion_id:
            query = f"""
                UPDATE entrenamientos_asignados
                   SET visible = ?
                 WHERE asignacion_id = ?
                   AND atleta_id IN ({placeholders})
            """
            params.append(asignacion_id)
            params.extend(atletas)
        elif fecha:
            query = f"""
                UPDATE entrenamientos_asignados
                   SET visible = ?
                 WHERE DATE(fecha) = DATE(?)
                   AND atleta_id IN ({placeholders})
            """
            params.append(fecha)
            params.extend(atletas)
        else:
            query = f"""
                UPDATE entrenamientos_asignados
                   SET visible = ?
                 WHERE atleta_id IN ({placeholders})
            """
            params.extend(atletas)

        cur.execute(query, tuple(params))
        conn.commit()
        updated = cur.rowcount if hasattr(cur, 'rowcount') else None
        if updated is None or updated < 0:
            updated = conn.total_changes
        return jsonify({'ok': True, 'updated': updated}), 200
    except Exception as e:
        app.logger.exception('Error actualizando visibilidad grupal')
        return jsonify({'error': 'No se pudo actualizar la visibilidad'}), 500
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

@app.route('/zonas_atleta/<int:atleta_id>', methods=['GET'])
@requires_roles('entrenador', 'atleta')
def obtener_zonas_atleta(current_user, atleta_id):
    try:
        resultado = query_db(
            '''SELECT vam, z1, z2, z3, z4, z5, z6
               FROM zonas_entrenamiento
               WHERE atleta_id = ?
               ORDER BY fecha_creacion DESC
               LIMIT 1''',
            (atleta_id,),
            one=True
        )
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
        filas = query_db(
            "SELECT id, nombre, objetivo FROM microciclos ORDER BY id DESC"
        )
        return jsonify([dict(f) for f in filas]), 200
    except Exception as e:
        print("Error en listar_microciclos_plantillas:", e)
        return jsonify({'error': 'Error al obtener microciclos'}), 500


@app.route("/microciclos", methods=["GET"])
@requires_roles("entrenador", "admin")
def listar_microciclos(current_user):
    db = get_db()

    micros = db.execute(
        """
        SELECT id, mesociclo_id, nombre, objetivo, created_at
        FROM microciclos
        ORDER BY created_at DESC
        """
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
            INSERT INTO microciclos (mesociclo_id, nombre, objetivo, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (None, nombre, objetivo, now)
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
        cur.execute("SELECT id FROM microciclos WHERE id = ?", (micro_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Microciclo no encontrado'}), 404

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
    db = get_db()

    # Comprobamos que el microciclo existe
    micro = db.execute(
        """
        SELECT id, mesociclo_id, nombre, objetivo, created_at
        FROM microciclos
        WHERE id = ?
        """,
        (micro_id,),
    ).fetchone()

    if micro is None:
        return jsonify({"error": "Microciclo no encontrado"}), 404

    rows = db.execute(
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
    ).fetchall()

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

    # Respuesta con el microciclo + sus entrenamientos
    return jsonify(
        {
            "id": micro["id"],
            "mesociclo_id": micro["mesociclo_id"],
            "nombre": micro["nombre"],
            "objetivo": micro["objetivo"],
            "created_at": micro["created_at"],
            "detalles": detalles,
        }
    )

# ---------- MESO CICLOS ----------

@app.route('/mesociclos', methods=['GET'])
@requires_roles('admin', 'entrenador')
def listar_mesociclos(current_user):
    try:
        filas = query_db(
            "SELECT id, nombre, objetivo FROM mesociclos ORDER BY id DESC"
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
        # Datos base de mesociclos
        meso_rows = query_db(
            "SELECT id, nombre, objetivo FROM mesociclos ORDER BY id DESC"
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
            "SELECT id, nombre, objetivo FROM mesociclos WHERE id = ?",
            (meso_id,),
            one=True
        )
        if not meso:
            return jsonify({'error': 'Mesociclo no encontrado'}), 404

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
    """
    Crea mesociclo.

    JSON esperado:
    {
      "nombre": "...",
      "objetivo": "...",
      "microciclos": [
        { "microciclo_id": 2, "orden": 1, "notas": "" },
        ...
      ]
    }
    """
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    objetivo = (data.get('objetivo') or '').strip() or None
    microciclos = data.get('microciclos') or []

    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        now = datetime.now().isoformat(' ')

        cur.execute(
            """
            INSERT INTO mesociclos (macrociclo_id, nombre, fecha_inicio, fecha_fin, objetivo, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (None, nombre, None, None, objetivo, now)
        )
        meso_id = cur.lastrowid

        for m in microciclos:
            micro_id = m.get('microciclo_id')
            orden = m.get('orden')
            notas = m.get('notas')
            cur.execute(
                """
                INSERT INTO mesociclos_microciclos
                    (mesociclo_id, microciclo_id, orden, notas, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (meso_id, micro_id, orden, notas, now)
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

    try:
        conn = get_db()
        cur = conn.cursor()

        cur.execute("SELECT id FROM mesociclos WHERE id = ?", (meso_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Mesociclo no encontrado'}), 404

        now = datetime.now().isoformat(' ')

        cur.execute(
            "UPDATE mesociclos SET nombre = ?, objetivo = ? WHERE id = ?",
            (nombre, objetivo, meso_id)
        )

        cur.execute("DELETE FROM mesociclos_microciclos WHERE mesociclo_id = ?", (meso_id,))

        for m in microciclos:
            micro_id = m.get('microciclo_id')
            orden = m.get('orden')
            notas = m.get('notas')
            cur.execute(
                """
                INSERT INTO mesociclos_microciclos
                    (mesociclo_id, microciclo_id, orden, notas, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (meso_id, micro_id, orden, notas, now)
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

        cur.execute("DELETE FROM mesociclos_microciclos WHERE mesociclo_id = ?", (meso_id,))
        cur.execute("DELETE FROM mesociclos WHERE id = ?", (meso_id,))

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'message': 'Mesociclo eliminado'}), 200

    except Exception as e:
        print("Error en borrar_mesociclo:", e)
        return jsonify({'error': 'Error al eliminar el mesociclo'}), 500


# ---------- MACRO CICLOS ----------

# @app.route('/macrociclos', methods=['GET'])
# @requires_roles('admin', 'entrenador')
# def listar_macrociclos(current_user):
#    try:
#        filas = query_db(
#            "SELECT id, nombre, objetivo FROM macrociclos ORDER BY id DESC"
#        )
#        return jsonify([dict(f) for f in filas]), 200
#    except Exception as e:
#        print("Error en listar_macrociclos:", e)
#        return jsonify({'error': 'Error al obtener macrociclos'}), 500

@app.route('/macrociclos/<int:macro_id>', methods=['GET'])
@requires_roles('admin', 'entrenador')
def obtener_macrociclo(current_user, macro_id):
    """
    Detalle de macrociclo, con sus mesociclos.
    """
    try:
        macro = query_db(
            "SELECT id, nombre, fecha_inicio, fecha_fin FROM macrociclos WHERE id = ?",
            (macro_id,),
            one=True
        )
        if not macro:
            return jsonify({'error': 'Macrociclo no encontrado'}), 404

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
    """
    Lista simple de macrociclos.
    El frontend solo necesita id, nombre y fechas.
    """
    try:
        filas = query_db(
            "SELECT id, nombre, fecha_inicio, fecha_fin FROM macrociclos ORDER BY id DESC"
        )
        return jsonify([dict(f) for f in filas]), 200

    except Exception as e:
        print("Error en listar_macrociclos:", e)

        # Si aún no existe tabla, devolvemos lista vacía (para evitar errores)
        if "no such table: macrociclos" in str(e):
            return jsonify([]), 200

        return jsonify({'error': 'Error al obtener macrociclos'}), 500

@app.route('/macrociclos', methods=['POST'])
@requires_roles('admin', 'entrenador')
def crear_macrociclo(current_user):
    """
    Crea un macrociclo.

    JSON:
    {
      "nombre": "...",
      "fecha_inicio": "2025-11-01" (opcional),
      "fecha_fin": "2026-03-01"   (opcional),
      "mesociclos": [
        { "mesociclo_id": 1, "orden": 1, "notas": "" },
        ...
      ]
    }
    """
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    fecha_inicio = data.get('fecha_inicio')
    fecha_fin = data.get('fecha_fin')
    mesociclos = data.get('mesociclos') or []

    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        now = datetime.now().isoformat(' ')

        cur.execute(
            """
            INSERT INTO macrociclos (nombre, fecha_inicio, fecha_fin, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (nombre, fecha_inicio, fecha_fin, now)
        )
        macro_id = cur.lastrowid

        for m in mesociclos:
            meso_id = m.get('mesociclo_id')
            orden = m.get('orden')
            notas = m.get('notas')
            cur.execute(
                """
                INSERT INTO macrociclos_mesociclos
                    (macrociclo_id, mesociclo_id, orden, notas, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (macro_id, meso_id, orden, notas, now)
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
    fecha_inicio = data.get('fecha_inicio')
    fecha_fin = data.get('fecha_fin')
    mesociclos = data.get('mesociclos') or []

    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()

        cur.execute("SELECT id FROM macrociclos WHERE id = ?", (macro_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Macrociclo no encontrado'}), 404

        now = datetime.now().isoformat(' ')

        cur.execute(
            """
            UPDATE macrociclos
               SET nombre = ?, fecha_inicio = ?, fecha_fin = ?
             WHERE id = ?
            """,
            (nombre, fecha_inicio, fecha_fin, macro_id)
        )

        cur.execute("DELETE FROM macrociclos_mesociclos WHERE macrociclo_id = ?", (macro_id,))

        for m in mesociclos:
            meso_id = m.get('mesociclo_id')
            orden = m.get('orden')
            notas = m.get('notas')
            cur.execute(
                """
                INSERT INTO macrociclos_mesociclos
                    (macrociclo_id, mesociclo_id, orden, notas, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (macro_id, meso_id, orden, notas, now)
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

        cur.execute("DELETE FROM macrociclos_mesociclos WHERE macrociclo_id = ?", (macro_id,))
        cur.execute("DELETE FROM macrociclos WHERE id = ?", (macro_id,))

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'message': 'Macrociclo eliminado'}), 200

    except Exception as e:
        print("Error en borrar_macrociclo:", e)
        return jsonify({'error': 'Error al eliminar el macrociclo'}), 500

@app.route('/')
def index():
    return redirect(url_for('static', filename='login.html'))


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')