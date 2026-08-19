import importlib
import sqlite3

import pytest

from backend.services.auth_service import crear_hash_password


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "admin-users.db"
    monkeypatch.setenv("DB_ENGINE", "sqlite")
    monkeypatch.setenv("DB_PATH", str(db_path))
    import backend.app as app_module

    importlib.reload(app_module)
    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
        CREATE TABLE usuarios (
            id INTEGER PRIMARY KEY,
            nombre TEXT,
            apellidos TEXT,
            email TEXT UNIQUE,
            password_hash TEXT,
            rol TEXT,
            entrenador_id INTEGER,
            force_password_change INTEGER DEFAULT 0,
            activo INTEGER DEFAULT 1
        );
        CREATE TABLE entrenamientos_asignados (
            id INTEGER PRIMARY KEY,
            atleta_id INTEGER
        );
        """
    )
    conn.executemany(
        """
        INSERT INTO usuarios (
            id, nombre, apellidos, email, password_hash, rol,
            entrenador_id, force_password_change, activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (1, "Admin", "Principal", "admin@example.com", crear_hash_password("admin"), "admin", None, 0, 1),
            (2, "Coach", "Demo", "coach@example.com", crear_hash_password("coach"), "entrenador", None, 0, 1),
            (3, "Atleta", "Demo", "athlete@example.com", crear_hash_password("athlete"), "atleta", 2, 0, 1),
        ],
    )
    conn.commit()
    conn.close()

    app_module.app.config["TESTING"] = True
    return app_module.app.test_client(), str(db_path)


def _set_session(client, user_id, rol):
    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["user_rol"] = rol


def _csrf(client):
    return client.get("/csrf-token").get_json()["csrf_token"]


def test_admin_lista_usuarios_sin_password_hash(client):
    client, _ = client
    _set_session(client, 1, "admin")

    response = client.get("/usuarios")

    assert response.status_code == 200
    data = response.get_json()
    assert {user["email"] for user in data} >= {"admin@example.com", "coach@example.com"}
    assert all("password_hash" not in user for user in data)


def test_admin_crea_entrenador_y_devuelve_password_temporal(client):
    client, db_path = client
    _set_session(client, 1, "admin")

    response = client.post(
        "/usuarios",
        json={"nombre": "Nuevo", "apellidos": "Coach", "email": "nuevo@example.com", "rol": "entrenador"},
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["message"] == "Usuario creado exitosamente"
    assert data["temporary_password"]
    assert data["force_password_change"] == 1

    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute("SELECT rol, force_password_change FROM usuarios WHERE email = 'nuevo@example.com'").fetchone()
        assert row == ("entrenador", 1)
    finally:
        conn.close()


def test_admin_rechaza_email_duplicado(client):
    client, _ = client
    _set_session(client, 1, "admin")

    response = client.post(
        "/usuarios",
        json={"nombre": "Otro", "apellidos": "Coach", "email": "coach@example.com", "rol": "entrenador"},
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert response.status_code == 409
    assert response.get_json()["error"] == "El correo electrónico ya está registrado"


def test_entrenador_no_accede_a_rutas_admin_usuarios(client):
    client, _ = client
    _set_session(client, 2, "entrenador")

    response = client.get("/usuarios")

    assert response.status_code == 403
    assert response.get_json()["error"] == "Acceso no autorizado"


def test_admin_actualiza_usuario(client):
    client, db_path = client
    _set_session(client, 1, "admin")

    response = client.put(
        "/usuarios/2",
        json={"nombre": "Coach", "apellidos": "Actualizado", "email": "coach-updated@example.com", "rol": "entrenador"},
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert response.status_code == 200
    assert response.get_json()["message"] == "Usuario actualizado exitosamente"

    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute("SELECT apellidos, email FROM usuarios WHERE id = 2").fetchone()
        assert row == ("Actualizado", "coach-updated@example.com")
    finally:
        conn.close()


def test_admin_elimina_usuario_sin_historial(client):
    client, db_path = client
    _set_session(client, 1, "admin")

    response = client.delete("/usuarios/2", headers={"X-CSRF-Token": _csrf(client)})

    assert response.status_code == 200
    assert response.get_json()["message"] == "Usuario eliminado exitosamente"

    conn = sqlite3.connect(db_path)
    try:
        assert conn.execute("SELECT id FROM usuarios WHERE id = 2").fetchone() is None
    finally:
        conn.close()
