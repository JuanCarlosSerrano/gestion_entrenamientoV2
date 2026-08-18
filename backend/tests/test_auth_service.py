import sqlite3

from werkzeug.security import check_password_hash

from backend.services.auth_service import (
    cambiar_password_usuario,
    crear_hash_password,
    generar_password_temporal,
    resetear_password_usuario,
)


def _conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE usuarios (
            id INTEGER PRIMARY KEY,
            password_hash TEXT,
            force_password_change INTEGER DEFAULT 0
        )
        """
    )
    conn.execute(
        "INSERT INTO usuarios (id, password_hash, force_password_change) VALUES (1, ?, 0)",
        (crear_hash_password("anterior"),),
    )
    return conn


def test_password_temporal_no_es_fija_y_tiene_longitud_razonable():
    primera = generar_password_temporal()
    segunda = generar_password_temporal()

    assert primera != segunda
    assert len(primera) >= 12
    assert len(segunda) >= 12


def test_hash_no_contiene_password_en_claro():
    password_hash = crear_hash_password("cambiame")

    assert "cambiame" not in password_hash
    assert check_password_hash(password_hash, "cambiame")


def test_reset_cambia_hash_y_activa_cambio_obligatorio():
    conn = _conn()
    try:
        cur = conn.cursor()
        anterior = conn.execute("SELECT password_hash FROM usuarios WHERE id = 1").fetchone()[0]

        temporal = resetear_password_usuario(cur, 1, password_temporal="temporal-segura")
        conn.commit()
        row = conn.execute("SELECT password_hash, force_password_change FROM usuarios WHERE id = 1").fetchone()

        assert temporal == "temporal-segura"
        assert row["password_hash"] != anterior
        assert check_password_hash(row["password_hash"], "temporal-segura")
        assert row["force_password_change"] == 1
    finally:
        conn.close()


def test_cambio_definitivo_desactiva_cambio_obligatorio():
    conn = _conn()
    try:
        cur = conn.cursor()
        resetear_password_usuario(cur, 1, password_temporal="temporal-segura")
        cambiar_password_usuario(cur, 1, "definitiva")
        conn.commit()
        row = conn.execute("SELECT password_hash, force_password_change FROM usuarios WHERE id = 1").fetchone()

        assert check_password_hash(row["password_hash"], "definitiva")
        assert row["force_password_change"] == 0
    finally:
        conn.close()
