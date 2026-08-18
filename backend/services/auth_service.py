import secrets

from werkzeug.security import check_password_hash, generate_password_hash


def generar_password_temporal(longitud=12):
    return secrets.token_urlsafe(longitud)


def temporary_password_response(password_temporal):
    return {
        "temporary_password": password_temporal,
        "password_temporal": password_temporal,
        "force_password_change": 1,
    }


def crear_hash_password(password):
    return generate_password_hash(password)


def verificar_password(password_hash, password):
    return check_password_hash(password_hash, password)


def resetear_password_usuario(cur, user_id, password_temporal=None):
    password_temporal = password_temporal or generar_password_temporal()
    cur.execute(
        "UPDATE usuarios SET password_hash = ?, force_password_change = 1 WHERE id = ?",
        (crear_hash_password(password_temporal), user_id),
    )
    return password_temporal


def cambiar_password_usuario(cur, user_id, nueva_password):
    cur.execute(
        "UPDATE usuarios SET password_hash = ?, force_password_change = 0 WHERE id = ?",
        (crear_hash_password(nueva_password), user_id),
    )
