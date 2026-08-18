def row_get(row, key, default=None):
    if row is None:
        return default
    try:
        return row.get(key, default)
    except AttributeError:
        try:
            return row[key]
        except Exception:
            return default


def row_to_dict(row):
    return dict(row) if row is not None else None


def atleta_pertenece_a_entrenador(cur, atleta_id, entrenador_id):
    cur.execute(
        """
        SELECT 1
        FROM usuarios
        WHERE id = ?
          AND entrenador_id = ?
          AND rol = 'atleta'
        """,
        (atleta_id, entrenador_id),
    )
    return cur.fetchone() is not None


def entrenador_puede_acceder_atleta(cur, current_user, atleta_id):
    if row_get(current_user, "rol") == "admin":
        return True
    if row_get(current_user, "rol") == "entrenador":
        return atleta_pertenece_a_entrenador(cur, atleta_id, row_get(current_user, "id"))
    return row_get(current_user, "rol") == "atleta" and row_get(current_user, "id") == atleta_id


def obtener_atleta_autorizado(cur, current_user, atleta_id):
    cur.execute(
        'SELECT * FROM usuarios WHERE id = ? AND rol = "atleta"',
        (atleta_id,),
    )
    atleta = cur.fetchone()
    if not atleta:
        return None, {"error": "Atleta no encontrado", "status": 404}
    if row_get(current_user, "rol") == "entrenador" and row_get(atleta, "entrenador_id") != row_get(current_user, "id"):
        return None, {"error": "No tienes permiso para gestionar este atleta", "status": 403}
    if row_get(current_user, "rol") == "atleta" and row_get(current_user, "id") != atleta_id:
        return None, {"error": "Acceso no autorizado", "status": 403}
    return atleta, None


def obtener_entrenamiento_asignado_autorizado(cur, current_user, asignado_id, *, escritura=False):
    cur.execute(
        """
        SELECT ea.*, u.entrenador_id, u.telefono AS atleta_telefono
        FROM entrenamientos_asignados ea
        JOIN usuarios u ON u.id = ea.atleta_id
        WHERE ea.id = ?
        """,
        (asignado_id,),
    )
    row = cur.fetchone()
    if not row:
        return None, {"error": "Entrenamiento asignado no encontrado", "status": 404}

    data = row_to_dict(row)
    if escritura and row_get(current_user, "rol") == "atleta":
        return None, {"error": "No autorizado", "status": 403}
    if row_get(current_user, "rol") == "entrenador" and data.get("entrenador_id") != row_get(current_user, "id"):
        return None, {"error": "No autorizado", "status": 403}
    if row_get(current_user, "rol") == "atleta" and data.get("atleta_id") != row_get(current_user, "id"):
        return None, {"error": "No autorizado", "status": 403}
    return data, None


def obtener_entrenamiento_plantilla_autorizado(cur, current_user, entrenamiento_id):
    cur.execute(
        "SELECT * FROM entrenamientos WHERE id = ?",
        (entrenamiento_id,),
    )
    entrenamiento = cur.fetchone()
    if not entrenamiento:
        return None, {"error": "Entrenamiento no encontrado", "status": 404}
    data = row_to_dict(entrenamiento)
    if row_get(current_user, "rol") == "entrenador" and data.get("creador_id") not in (None, row_get(current_user, "id")):
        return None, {"error": "No autorizado", "status": 403}
    if row_get(current_user, "rol") == "atleta":
        return None, {"error": "No autorizado", "status": 403}
    return data, None
