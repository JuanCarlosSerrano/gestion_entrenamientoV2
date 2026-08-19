import importlib
import sqlite3

import pytest

from backend.services.auth_service import crear_hash_password


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "auth-routes.db"
    monkeypatch.setenv("DB_ENGINE", "sqlite")
    monkeypatch.setenv("DB_PATH", str(db_path))
    import backend.app as app_module

    importlib.reload(app_module)
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """
        CREATE TABLE usuarios (
            id INTEGER PRIMARY KEY,
            nombre TEXT,
            apellidos TEXT,
            email TEXT,
            password_hash TEXT,
            rol TEXT,
            force_password_change INTEGER DEFAULT 0
        )
        """
    )
    conn.execute(
        "INSERT INTO usuarios (id, nombre, apellidos, email, password_hash, rol, force_password_change) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (1, "Pedro", "Rodrigo", "coach@example.com", crear_hash_password("coach"), "entrenador", 0),
    )
    conn.execute(
        "INSERT INTO usuarios (id, nombre, apellidos, email, password_hash, rol, force_password_change) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (2, "Ana", "Atleta", "athlete@example.com", crear_hash_password("athlete"), "atleta", 1),
    )
    conn.commit()
    conn.close()

    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


def _csrf(client):
    return client.get("/csrf-token").get_json()["csrf_token"]


def test_login_route_mantiene_respuesta_atleta(client):
    response = client.post("/login", json={"email": "athlete@example.com", "password": "athlete"})

    assert response.status_code == 200
    data = response.get_json()
    assert data["rol"] == "atleta"
    assert data["user_id"] == 2
    assert data["atleta_id"] == 2
    assert data["force_password_change"] == 1


def test_login_route_devuelve_nombre_del_usuario_que_inicia_sesion(client):
    # Regresión de un fallo real: el frontend no pedía el nombre en ningún
    # momento del login y acababa mostrando un valor de otra sesión (o un
    # nombre hardcodeado) en el saludo y la barra lateral, sin relación
    # con quien realmente había iniciado sesión.
    response = client.post("/login", json={"email": "coach@example.com", "password": "coach"})

    assert response.status_code == 200
    data = response.get_json()
    assert data["nombre"] == "Pedro"
    assert data["apellidos"] == "Rodrigo"


def test_register_route_sigue_deshabilitada(client):
    client.post("/login", json={"email": "coach@example.com", "password": "coach"})
    response = client.post("/register", json={}, headers={"X-CSRF-Token": _csrf(client)})

    assert response.status_code == 403
    assert "registro público" in response.get_json()["error"]


def test_password_route_permite_cambio_forzado_sin_password_actual(client):
    client.post("/login", json={"email": "athlete@example.com", "password": "athlete"})
    response = client.post(
        "/usuarios/password",
        json={"password_nueva": "nueva"},
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert response.status_code == 200
    assert response.get_json()["message"] == "Contraseña actualizada"
