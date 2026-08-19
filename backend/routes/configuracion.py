from flask import Blueprint, jsonify, request


def create_configuracion_blueprint(
    *,
    requires_roles,
    query_db,
    execute_db,
    get_db,
    obtener_filtros_atletas_entrenador,
    obtener_atleta_configurable,
    atleta_tiene_historial,
    row_get,
    generar_password_temporal,
    crear_hash_password,
    resetear_password_usuario,
    temporary_password_response,
):
    bp = Blueprint("configuracion", __name__)

    @bp.route('/configuracion/atletas', methods=['GET'])
    @requires_roles('admin', 'entrenador')
    def configuracion_listar_atletas(current_user):
        busqueda = (request.args.get("q") or "").strip()
        grupo = (request.args.get("grupo") or "").strip()
        subgrupo = (request.args.get("subgrupo") or "").strip()
        categoria = (request.args.get("categoria") or "").strip()
        activo = (request.args.get("activo") or "").strip()

        where = ['rol = "atleta"']
        params = []
        if current_user["rol"] == "entrenador":
            where.append("entrenador_id = ?")
            params.append(current_user["id"])
        if busqueda:
            where.append("(nombre LIKE ? OR apellidos LIKE ? OR email LIKE ?)")
            like = f"%{busqueda}%"
            params.extend([like, like, like])
        if grupo:
            where.append("grupo = ?")
            params.append(grupo)
        if subgrupo:
            where.append("subgrupo = ?")
            params.append(subgrupo)
        if categoria:
            where.append("categoria = ?")
            params.append(categoria)
        if activo in ("0", "1"):
            where.append("COALESCE(activo, 1) = ?")
            params.append(int(activo))

        atletas = query_db(
            f"""
            SELECT id, nombre, apellidos, email, telefono, fecha_nacimiento, categoria,
                   grupo, subgrupo, entrenador_id, foto_url, force_password_change,
                   COALESCE(activo, 1) AS activo, vdot_val, vdot_fecha
            FROM usuarios
            WHERE {' AND '.join(where)}
            ORDER BY COALESCE(activo, 1) DESC, apellidos, nombre, id
            """,
            tuple(params),
        )
        return jsonify({
            "atletas": [dict(a) for a in atletas],
            "filtros": obtener_filtros_atletas_entrenador(current_user),
        }), 200

    @bp.route('/configuracion/atletas', methods=['POST'])
    @requires_roles('admin', 'entrenador')
    def configuracion_crear_atleta(current_user):
        data = request.get_json(silent=True) or {}
        nombre = (data.get("nombre") or "").strip()
        apellidos = (data.get("apellidos") or "").strip()
        email = (data.get("email") or "").strip().lower()
        telefono = (data.get("telefono") or "").strip() or None
        fecha_nacimiento = (data.get("fecha_nacimiento") or "").strip() or None
        categoria = (data.get("categoria") or "").strip() or None
        grupo = (data.get("grupo") or "").strip() or None
        subgrupo = (data.get("subgrupo") or "").strip() or None
        password_temporal = generar_password_temporal()
        entrenador_id = current_user["id"] if current_user["rol"] == "entrenador" else data.get("entrenador_id")

        if not nombre or not apellidos or not email:
            return jsonify({"error": "Nombre, apellidos y email son obligatorios"}), 400
        if entrenador_id is not None:
            try:
                entrenador_id = int(entrenador_id)
            except (TypeError, ValueError):
                return jsonify({"error": "Entrenador inválido"}), 400
        if query_db("SELECT id FROM usuarios WHERE email = ?", (email,), one=True):
            return jsonify({"error": "Ese correo ya está en uso"}), 409

        try:
            nuevo_id = execute_db(
                """
                INSERT INTO usuarios (
                    nombre, apellidos, email, password_hash, telefono, fecha_nacimiento,
                    categoria, grupo, subgrupo, rol, entrenador_id, aprobado,
                    force_password_change, activo
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'atleta', ?, 1, 1, 1)
                """,
                (
                    nombre,
                    apellidos,
                    email,
                    crear_hash_password(password_temporal),
                    telefono,
                    fecha_nacimiento,
                    categoria,
                    grupo,
                    subgrupo,
                    entrenador_id,
                ),
            )
            return jsonify({
                "message": "Atleta creado correctamente",
                "atleta_id": nuevo_id,
                **temporary_password_response(password_temporal),
            }), 201
        except Exception as e:
            print("Error al crear atleta desde configuración:", e)
            return jsonify({"error": "No se pudo crear el atleta"}), 500

    @bp.route('/configuracion/atletas/<int:atleta_id>', methods=['GET'])
    @requires_roles('admin', 'entrenador')
    def configuracion_obtener_atleta(current_user, atleta_id):
        atleta, error = obtener_atleta_configurable(current_user, atleta_id)
        if error:
            return error
        data = dict(atleta)
        data["activo"] = row_get(atleta, "activo", 1)
        data["tiene_historial"] = atleta_tiene_historial(atleta_id)
        data.pop("password_hash", None)
        return jsonify(data), 200

    @bp.route('/configuracion/atletas/<int:atleta_id>', methods=['PUT'])
    @requires_roles('admin', 'entrenador')
    def configuracion_actualizar_atleta(current_user, atleta_id):
        atleta, error = obtener_atleta_configurable(current_user, atleta_id)
        if error:
            return error
        data = request.get_json(silent=True) or {}
        nombre = (data.get("nombre") or "").strip()
        apellidos = (data.get("apellidos") or "").strip()
        email = (data.get("email") or "").strip().lower()
        telefono = (data.get("telefono") or "").strip() or None
        fecha_nacimiento = (data.get("fecha_nacimiento") or "").strip() or None
        categoria = (data.get("categoria") or "").strip() or None
        grupo = (data.get("grupo") or "").strip() or None
        subgrupo = (data.get("subgrupo") or "").strip() or None

        if not nombre or not apellidos or not email:
            return jsonify({"error": "Nombre, apellidos y email son obligatorios"}), 400
        if query_db("SELECT id FROM usuarios WHERE email = ? AND id != ?", (email, atleta_id), one=True):
            return jsonify({"error": "Ese correo ya está en uso"}), 409

        execute_db(
            """
            UPDATE usuarios
            SET nombre = ?, apellidos = ?, email = ?, telefono = ?, fecha_nacimiento = ?,
                categoria = ?, grupo = ?, subgrupo = ?
            WHERE id = ?
            """,
            (nombre, apellidos, email, telefono, fecha_nacimiento, categoria, grupo, subgrupo, atleta_id),
        )
        return jsonify({"message": "Atleta actualizado correctamente"}), 200

    @bp.route('/configuracion/atletas/<int:atleta_id>/estado', methods=['PUT'])
    @requires_roles('admin', 'entrenador')
    def configuracion_estado_atleta(current_user, atleta_id):
        atleta, error = obtener_atleta_configurable(current_user, atleta_id)
        if error:
            return error
        data = request.get_json(silent=True) or {}
        activo = 1 if data.get("activo") in (True, 1, "1", "true", "activo") else 0
        execute_db("UPDATE usuarios SET activo = ? WHERE id = ?", (activo, atleta_id))
        return jsonify({
            "message": "Atleta activado" if activo else "Atleta desactivado",
            "activo": activo,
        }), 200

    @bp.route('/configuracion/atletas/<int:atleta_id>/reset-password', methods=['POST'])
    @requires_roles('admin', 'entrenador')
    def configuracion_reset_password_atleta(current_user, atleta_id):
        atleta, error = obtener_atleta_configurable(current_user, atleta_id)
        if error:
            return error
        conn = get_db()
        cur = conn.cursor()
        try:
            password_temporal = resetear_password_usuario(cur, atleta_id)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
            conn.close()
        return jsonify({
            "message": "Contraseña temporal generada",
            **temporary_password_response(password_temporal),
        }), 200

    return bp
