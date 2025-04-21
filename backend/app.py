from flask import Flask, jsonify, request, session
from flask import redirect, url_for
from flask_cors import CORS
from flask_session import Session
import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

app = Flask(__name__, static_folder='../frontend/static')  # Configuración correcta de static_folder
CORS(app)
app.config["SESSION_PERMANENT"] = False  # Las sesiones expiran cuando se cierra el navegador
app.config["SESSION_TYPE"] = "filesystem"  # Almacena las sesiones en el sistema de archivos (para desarrollo)
app.config["SESSION_FILE_DIR"] = "flask_session"  # Directorio para almacenar archivos de sesión
app.config["SECRET_KEY"] = "b3f9a7c1e2d048a915b67e3f890214c56a7d890123456789abcdef"  # ¡Reemplaza con una clave segura!
app.config["SESSION_COOKIE_NAME"] = "my_session"  # Nombre de la cookie de sesión
app.config["SESSION_COOKIE_HTTPONLY"] = True  # Recomendado por seguridad
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"  # Recomendado por seguridad
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
            if "user_id" not in session:  # Verifica si el usuario ha iniciado sesión
                return jsonify({'error': 'Autenticación requerida'}), 401

            user = query_db('SELECT id, rol, email FROM usuarios WHERE id = ?',
                            (session["user_id"],), one=True)  # Obtiene el usuario por ID de sesión
            if not user or user['rol'] not in roles:
                return jsonify({'error': 'Acceso no autorizado'}), 403
            return f(user, *args, **kwargs)  # Pasa el objeto 'user' a la función

        return decorated_function

    return wrapper


# --- Rutas para Usuarios (Registro e Inicio de Sesión) ---
@app.route('/registro', methods=['POST'])
def register_user():
    data = request.get_json()
    nombre = data.get('nombre')
    apellidos = data.get('apellidos')
    email = data.get('email')
    password = data.get('password')
    rol = data.get('rol')
    fecha_nacimiento = data.get('fecha_nacimiento')
    telefono = data.get('telefono')
    entrenador_id = data.get('entrenador_id')  # opcional
    categoria = data.get('categoria')  # solo atletas

    if not nombre or not apellidos or not email or not password or not rol:
        return jsonify({'error': 'Todos los campos son obligatorios'}), 400

    if rol not in ('admin', 'entrenador', 'atleta'):
        return jsonify({'error': 'Rol inválido'}), 400

    existing_user = query_db('SELECT * FROM usuarios WHERE email = ?', (email,), one=True)
    if existing_user:
        return jsonify({'error': 'El correo electrónico ya está registrado'}), 409

    password_hash = generate_password_hash(password)

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            '''INSERT INTO usuarios (
                nombre, apellidos, email, password_hash, rol,
                fecha_nacimiento, telefono, entrenador_id, categoria
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                nombre, apellidos, email, password_hash, rol,
                fecha_nacimiento if rol == 'atleta' else None,
                telefono if rol == 'atleta' else None,
                entrenador_id if rol == 'atleta' else None,
                categoria if rol == 'atleta' else None
            )
        )

        conn.commit()
        return jsonify({'message': 'Usuario registrado exitosamente'}), 201

    except sqlite3.IntegrityError as e:
        print("Error al registrar:", e)
        return jsonify({'error': 'Error al registrar el usuario (problema de integridad)'}), 500

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
        atletas = query_db('SELECT * FROM usuarios')
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


@app.route('/atletas', methods=['POST'])
@requires_roles('admin')  # Solo admin puede crear atletas
def create_atleta(current_user):
    data = request.get_json()
    nombre = data.get('nombre')
    apellidos = data.get('apellidos')
    fecha_nacimiento = data.get('fecha_nacimiento')
    email = data.get('email')
    telefono = data.get('telefono')
    entrenador_id = data.get('entrenador_id')

    if not nombre or not apellidos:
        return jsonify({'error': 'Nombre y apellidos son obligatorios'}), 400

    execute_db(
        'INSERT INTO atletas (nombre, apellidos, fecha_nacimiento, email, telefono, entrenador_id) VALUES (?, ?, ?, ?, ?, ?)',
        (nombre, apellidos, fecha_nacimiento, email, telefono, entrenador_id)
    )
    conn = get_db()
    atleta_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
    conn.close()

    conn_read = get_db()
    atleta = query_db('SELECT * FROM usuarios WHERE id = ?', (atleta_id,), one=True)
    conn_read.close()

    if atleta:
        return jsonify(dict(atleta)), 201
    else:
        return jsonify({'error': 'Error al recuperar el atleta creado (ID: {})'.format(atleta_id)}), 500


@app.route('/atletas/<int:id>', methods=['PUT'])
@requires_roles('admin')  # Solo admin puede editar atletas
def update_atleta(current_user, id):
    data = request.get_json()
    nombre = data.get('nombre')
    apellidos = data.get('apellidos')
    fecha_nacimiento = data.get('fecha_nacimiento')
    email = data.get('email')
    telefono = data.get('telefono')
    entrenador_id = data.get('entrenador_id')

    atleta = query_db('SELECT * FROM usuarios WHERE id = ?', (id,), one=True)
    if atleta is None:
        return jsonify({'error': 'Atleta no encontrado'}), 404

    execute_db(
        'UPDATE atletas SET nombre = ?, apellidos = ?, fecha_nacimiento = ?, email = ?, telefono = ?, entrenador_id = ? WHERE id = ?',
        (nombre, apellidos, fecha_nacimiento, email, telefono, entrenador_id, id)
    )
    atleta_actualizado = query_db('SELECT * FROM usuarios WHERE id = ?', (id,), one=True)
    return jsonify(dict(atleta_actualizado))


@app.route('/atletas/<int:id>', methods=['DELETE'])
@requires_roles('admin')  # Solo admin puede eliminar atletas
def delete_atleta(current_user, id):
    execute_db('DELETE FROM usuarios WHERE id = ?', (id,))
    return jsonify({'message': 'Atleta eliminado correctamente'}), 200


# --- Rutas para Entrenamientos ---

@app.route('/entrenamientos', methods=['POST'])
@requires_roles('admin', 'entrenador')  # Admin y Entrenador pueden crear entrenamientos
def crear_entrenamiento(current_user):
    data = request.get_json()
    nombre = data.get('nombre')
    duracion_valor = data.get('duracion_valor')
    duracion_tipo = data.get('duracion_tipo')
    calentamiento_tipo = data.get('calentamiento_tipo')
    calentamiento_valor = data.get('calentamiento_valor')
    bloque_activacion = data.get('bloque_activacion')
    bloque_principal = data.get('bloque_principal')
    enfriamiento_tipo = data.get('enfriamiento_tipo')
    enfriamiento_valor = data.get('enfriamiento_valor')

    if not nombre or not bloque_principal:
        return jsonify({'error': 'Nombre y bloque_principal son obligatorios'}), 400

    try:
        execute_db(
            'INSERT INTO entrenamientos (nombre, duracion_valor, duracion_tipo, calentamiento_tipo, calentamiento_valor, bloque_activacion, bloque_principal, enfriamiento_tipo, enfriamiento_valor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (nombre, duracion_valor, duracion_tipo, calentamiento_tipo, calentamiento_valor, bloque_activacion,
             bloque_principal, enfriamiento_tipo, enfriamiento_valor)
        )
        return jsonify({'message': 'Entrenamiento creado exitosamente'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Error al crear el entrenamiento'}), 500


@app.route('/entrenamientos', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamientos(current_user):
    entrenamientos = query_db('SELECT * FROM entrenamientos')
    return jsonify([dict(entrenamiento) for entrenamiento in entrenamientos])


@app.route('/entrenamientos/<int:id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamiento(current_user, id):
    entrenamiento = query_db('SELECT * FROM entrenamientos WHERE id = ?', (id,), one=True)
    if entrenamiento is None:
        return jsonify({'error': 'Entrenamiento no encontrado'}), 404
    return jsonify(dict(entrenamiento))


@app.route('/entrenamientos/<int:id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')  # Admin y Entrenador pueden editar
def actualizar_entrenamiento(current_user, id):
    data = request.get_json()
    nombre = data.get('nombre')
    duracion_valor = data.get('duracion_valor')
    duracion_tipo = data.get('duracion_tipo')
    calentamiento_tipo = data.get('calentamiento_tipo')
    calentamiento_valor = data.get('calentamiento_valor')
    bloque_activacion = data.get('bloque_activacion')
    bloque_principal = data.get('bloque_principal')
    enfriamiento_tipo = data.get('enfriamiento_tipo')
    enfriamiento_valor = data.get('enfriamiento_valor')

    if not nombre or not bloque_principal:
        return jsonify({'error': 'Nombre y bloque_principal son obligatorios'}), 400

    try:
        execute_db(
            'UPDATE entrenamientos SET nombre = ?, duracion_valor = ?, duracion_tipo = ?, calentamiento_tipo = ?, calentamiento_valor = ?, bloque_activacion = ?, bloque_principal = ?, enfriamiento_tipo = ?, enfriamiento_valor = ? WHERE id = ?',
            (nombre, duracion_valor, duracion_tipo, calentamiento_tipo, calentamiento_valor, bloque_activacion,
             bloque_principal, enfriamiento_tipo, enfriamiento_valor, id)
        )
        return jsonify({'message': 'Entrenamiento actualizado exitosamente'}), 200
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Error al actualizar el entrenamiento'}), 500


@app.route('/entrenamientos/<int:id>', methods=['DELETE'])
@requires_roles('admin', 'entrenador')  # Admin y Entrenador pueden eliminar
def eliminar_entrenamiento(current_user, id):
    execute_db('DELETE FROM entrenamientos WHERE id = ?', (id,))
    return jsonify({'message': 'Entrenamiento eliminado exitosamente'}), 200

# --- Rutas para Feedback (Ejemplo) ---

@app.route('/feedback', methods=['POST'])
@requires_roles('atleta')
def create_feedback(current_user):
    data = request.get_json()
    entrenamiento_id = data.get('entrenamiento_id')
    comentario = data.get('comentario')

    if not entrenamiento_id or not comentario:
        return jsonify({'error': 'Entrenamiento_id y comentario son obligatorios'}), 400

    try:
        execute_db(
            'INSERT INTO feedback (entrenamiento_id, atleta_id, comentario) VALUES (?, ?, ?)',
            (entrenamiento_id, session.get("user_id"), comentario)
        )
        return jsonify({'message': 'Feedback enviado exitosamente'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Error al enviar el feedback'}), 500


@app.route('/feedback/<int:entrenamiento_id>', methods=['GET'])
@requires_roles('admin', 'entrenador')
def get_feedback_for_entrenamiento(current_user, entrenamiento_id):
    # Obtener los IDs de los atletas que entrena el entrenador actual
    atletas_ids = [row['id'] for row in
                   query_db('SELECT id FROM usuarios WHERE entrenador_id = ?', (session.get("user_id"),))]
    if atletas_ids:
        feedback = query_db(
            'SELECT u.nombre, u.apellidos, f.comentario FROM feedback f JOIN usuarios u ON f.atleta_id = u.id WHERE f.entrenamiento_id = ? AND f.atleta_id IN ({})',
            (entrenamiento_id, ','.join('?' * len(atletas_ids))), atletas_ids
        )
    else:
        feedback = []
    return jsonify([dict(row) for row in feedback])

@app.route('/calendario/<int:atleta_id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def get_calendario(current_user, atleta_id):
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
            events.append({
                'id': entrenamiento['id'],
                'title': entrenamiento['nombre'],
                'start': entrenamiento['fecha']
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
        print(e)
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


@app.route('/')
def index():
    return redirect(url_for('static', filename='login.html'))


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')