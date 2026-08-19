from flask import Blueprint, jsonify, request, session


def create_auth_blueprint(
    *,
    requires_roles,
    query_db,
    get_db,
    login_rate_limited,
    login_attempts,
    logger,
    verificar_password,
    cambiar_password_usuario,
):
    bp = Blueprint("auth", __name__)

    @bp.route('/register', methods=['POST'])
    @requires_roles('admin', 'entrenador')
    def register_user(current_user):
        return jsonify({'error': 'El registro público está deshabilitado. Usa el alta desde administración o configuración.'}), 403

    @bp.route('/login', methods=['POST'])
    def login_user():
        data = request.get_json()
        data = data or {}
        email = (data.get('email') or '').strip().lower()
        password = data.get('password')

        if not email or not password:
            logger.info("Login incompleto email=%s", email or "-")
            return jsonify({'error': 'Correo electrónico y contraseña son obligatorios'}), 400

        ip = request.remote_addr or "unknown"
        if login_rate_limited(ip):
            logger.warning("Login bloqueado por rate limit email=%s ip=%s", email, request.remote_addr)
            return jsonify({'error': 'Demasiados intentos. Inténtalo de nuevo en un minuto.'}), 429

        user = query_db(
            'SELECT id, rol, email, nombre, apellidos, password_hash, force_password_change FROM usuarios WHERE email = ?',
            (email,),
            one=True,
        )

        if user and verificar_password(user['password_hash'], password):
            logger.info("Login correcto user_id=%s rol=%s", user["id"], user["rol"])
            login_attempts.pop(ip, None)
            session.clear()
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
                'nombre': user['nombre'],
                'apellidos': user['apellidos'],
                'force_password_change': force_change,
            }

            if user['rol'] == 'atleta':
                response['atleta_id'] = user['id']

            return jsonify(response), 200

        logger.info("Login fallido email=%s", email)
        return jsonify({'error': 'Credenciales inválidas'}), 401

    @bp.route('/usuarios/password', methods=['POST'])
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

            if password_actual:
                if not verificar_password(stored_hash, password_actual):
                    return jsonify({'error': 'Contraseña actual incorrecta'}), 400
            else:
                if not force_flag:
                    return jsonify({'error': 'Debes indicar tu contraseña actual'}), 400

            cambiar_password_usuario(cur, current_user['id'], password_nueva)
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

    return bp
