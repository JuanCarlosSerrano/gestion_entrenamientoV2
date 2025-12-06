import importlib
import os
import sqlite3

import pytest


SCHEMA_SQL = """
CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    nombre TEXT,
    apellidos TEXT,
    email TEXT,
    password_hash TEXT,
    rol TEXT,
    entrenador_id INTEGER,
    force_password_change INTEGER DEFAULT 0,
    aprobado INTEGER DEFAULT 1,
    categoria TEXT,
    grupo TEXT,
    subgrupo TEXT
);
CREATE TABLE entrenamientos_asignados (
    id INTEGER PRIMARY KEY,
    atleta_id INTEGER,
    fecha TEXT,
    visible INTEGER,
    entrenamiento_id INTEGER,
    nombre TEXT,
    objetivo TEXT,
    notas TEXT,
    km_previstos REAL,
    created_at TEXT,
    updated_at TEXT
);
CREATE TABLE entrenamientos_asignados_detalle (
    id INTEGER PRIMARY KEY,
    entrenamiento_asignado_id INTEGER,
    parent_id INTEGER,
    orden INTEGER,
    tipo_paso TEXT,
    repeticiones INTEGER,
    objetivo_tipo TEXT,
    objetivo_valor REAL,
    unidad TEXT,
    zona TEXT,
    recuperacion_valor REAL,
    recuperacion_unidad TEXT,
    intensidad TEXT,
    descripcion TEXT
);
CREATE TABLE feedbacks (
    id INTEGER PRIMARY KEY,
    entrenamiento_asignado_id INTEGER,
    atleta_id INTEGER,
    comentario TEXT,
    fecha TEXT DEFAULT CURRENT_TIMESTAMP,
    leido INTEGER DEFAULT 0,
    respuesta TEXT,
    url_datos TEXT
);
"""


def _seed_data(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_SQL)
    conn.executemany(
        """
        INSERT INTO usuarios (id, nombre, apellidos, email, password_hash, rol, entrenador_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (1, "Coach", "Uno", "coach1@example.com", "", "entrenador", None),
            (2, "Coach", "Dos", "coach2@example.com", "", "entrenador", None),
            (3, "Athlete", "Uno", "athlete1@example.com", "", "atleta", 1),
            (4, "Athlete", "Dos", "athlete2@example.com", "", "atleta", 2),
        ],
    )
    conn.execute(
        """
        INSERT INTO entrenamientos_asignados (id, atleta_id, fecha, visible, entrenamiento_id, nombre)
        VALUES (10, 4, '2024-01-01', 1, 1, 'Rodaje')
        """
    )
    conn.execute(
        """
        INSERT INTO feedbacks (id, entrenamiento_asignado_id, atleta_id, comentario)
        VALUES (5, 10, 4, 'Hola')
        """
    )
    conn.commit()
    conn.close()


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DB_ENGINE", "sqlite")
    monkeypatch.setenv("DB_PATH", str(db_path))
    # Recargar el módulo para que tome la configuración de test
    import backend.app as app_module

    importlib.reload(app_module)
    _seed_data(app_module.DATABASE)

    app_module.app.config["TESTING"] = True
    client = app_module.app.test_client()
    return client


def _set_session(client, user_id, rol):
    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["user_rol"] = rol


def test_entrenador_no_puede_ver_calendario_de_otro(client):
    _set_session(client, user_id=1, rol="entrenador")
    resp = client.get("/calendario/4")
    assert resp.status_code == 403


def test_entrenador_no_puede_modificar_visibilidad_de_atleta_ajeno(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.post(
        "/entrenamientos_asignados/visibilidad",
        json={"atletas": [4], "visible": 1, "fecha": "2024-01-01"},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 403


def test_csrf_bloquea_feedback_sin_header(client):
    _set_session(client, user_id=3, rol="atleta")
    client.get("/csrf-token")  # genera token en sesión
    resp = client.post(
        "/feedback",
        json={"entrenamiento_id": 10, "comentario": "sin token"},
    )
    assert resp.status_code == 403


def test_entrenador_no_puede_marcar_feedback_de_atleta_ajeno(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.put(
        "/feedbacks/5/leer",
        json={"leido": 1},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 403
