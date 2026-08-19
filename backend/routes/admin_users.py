from flask import Blueprint, jsonify, request


def create_admin_users_blueprint(
    *,
    requires_roles,
    query_db,
    execute_db,
    atleta_tiene_historial,
    generar_password_temporal,
    crear_hash_password,
    temporary_password_response,
    db_integrity_errors,
):
    bp = Blueprint("admin_users", __name__)

    @bp.route('/usuarios', methods=['GET'])
    @requires_roles('admin')
    def get_all_users(current_user):
        users = query_db('SELECT id, nombre, apellidos, email, rol FROM usuarios')
        return jsonify([dict(user) for user in users])

    @bp.route('/usuarios/<int:id>', methods=['GET'])
    @requires_roles('admin')
    def get_user(current_user, id):
        user = query_db('SELECT id, nombre, apellidos, email, rol FROM usuarios WHERE id = ?', (id,), one=True)
        if not user:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        return jsonify(dict(user))

    @bp.route('/usuarios', methods=['POST'])
    @requires_roles('admin')
    def create_user(current_user):
        data = request.get_json() or {}
        nombre = (data.get('nombre') or '').strip()
        apellidos = (data.get('apellidos') or '').strip()
        email = (data.get('email') or '').strip().lower()
        rol = data.get('rol')
        entrenador_id = data.get('entrenador_id')

        if not nombre or not apellidos or not email or not rol:
            return jsonify({'error': 'Todos los campos son obligatorios'}), 400

        if rol not in ('admin', 'entrenador', 'atleta'):
            return jsonify({'error': 'Rol inválido'}), 400
        if rol == "atleta" and entrenador_id is not None:
            try:
                entrenador_id = int(entrenador_id)
            except (TypeError, ValueError):
                return jsonify({'error': 'Entrenador inválido'}), 400

        existing_user = query_db('SELECT * FROM usuarios WHERE email = ?', (email,), one=True)
        if existing_user:
            return jsonify({'error': 'El correo electrónico ya está registrado'}), 409

        password_temporal = generar_password_temporal()

        try:
            execute_db(
                'INSERT INTO usuarios (nombre, apellidos, email, password_hash, rol, entrenador_id, force_password_change) VALUES (?, ?, ?, ?, ?, ?, 1)',
                (nombre, apellidos, email, crear_hash_password(password_temporal), rol, entrenador_id if rol == "atleta" else None),
            )
            return jsonify({
                'message': 'Usuario creado exitosamente',
                **temporary_password_response(password_temporal),
            }), 201
        except db_integrity_errors:
            return jsonify({'error': 'Error al crear el usuario'}), 500

    @bp.route('/usuarios/<int:id>', methods=['PUT'])
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
            password_temporal = generar_password_temporal()
            password_hash = crear_hash_password(password_temporal)
            execute_db(
                '''
                UPDATE usuarios
                SET nombre = ?, apellidos = ?, email = ?, rol = ?, password_hash = ?, force_password_change = 1
                WHERE id = ?
                ''',
                (nombre, apellidos, email, rol, password_hash, id),
            )
            return jsonify({
                'message': 'Usuario actualizado exitosamente',
                **temporary_password_response(password_temporal),
            }), 200

        execute_db(
            'UPDATE usuarios SET nombre = ?, apellidos = ?, email = ?, rol = ? WHERE id = ?',
            (nombre, apellidos, email, rol, id),
        )
        return jsonify({'message': 'Usuario actualizado exitosamente'}), 200

    @bp.route('/usuarios/<int:id>', methods=['DELETE'])
    @requires_roles('admin')
    def delete_user(current_user, id):
        user = query_db('SELECT id, rol FROM usuarios WHERE id = ?', (id,), one=True)
        if not user:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        if user['rol'] == 'atleta' and atleta_tiene_historial(id):
            execute_db('UPDATE usuarios SET activo = 0 WHERE id = ?', (id,))
            return jsonify({'message': 'Atleta archivado correctamente', 'archivado': True, 'eliminado': False}), 200
        execute_db('DELETE FROM usuarios WHERE id = ?', (id,))
        return jsonify({'message': 'Usuario eliminado exitosamente'}), 200

    return bp
