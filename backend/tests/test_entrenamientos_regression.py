import importlib
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
CREATE TABLE entrenamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    objetivo TEXT,
    notas TEXT,
    bloque_principal TEXT,
    km_totales REAL DEFAULT 0,
    creador_id INTEGER
);
CREATE TABLE entrenamientos_detalle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_id INTEGER NOT NULL,
    parent_id INTEGER,
    orden INTEGER NOT NULL,
    tipo_paso TEXT NOT NULL,
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
    conn.execute(
        """
        INSERT INTO usuarios (id, nombre, apellidos, email, password_hash, rol, entrenador_id)
        VALUES (2, 'Coach', 'Principal', 'coach@example.com', '', 'entrenador', NULL)
        """
    )
    conn.execute(
        """
        INSERT INTO entrenamientos (id, nombre, objetivo, notas, bloque_principal, km_totales, creador_id)
        VALUES (3, 'Entreno base', 'Objetivo', 'Notas', 'Bloque', 10.0, 2)
        """
    )
    conn.commit()
    conn.close()


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DB_ENGINE", "sqlite")

    import backend.app as app_module

    importlib.reload(app_module)
    app_module.DATABASE = str(db_path)
    _seed_data(str(db_path))

    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


def _set_session(client, user_id, rol):
    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["user_rol"] = rol


def _pasos_payload():
    return [
        {
            "tipo_paso": "warmup",
            "objetivo_tipo": "duracion",
            "objetivo_valor": "15",
            "unidad": "min",
            "descripcion": "Calentamiento",
        },
        {
            "tipo_paso": "interval",
            "objetivo_tipo": "distancia",
            "objetivo_valor": "1000",
            "unidad": "m",
            "zona": "Z3",
            "recuperacion_valor": "1'",
            "recuperacion_unidad": "min",
            "descripcion": "Serie",
        },
    ]


def test_crear_entrenamiento_acepta_valores_normalizables(client):
    _set_session(client, user_id=2, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    payload = {
        "nombre": "Test create",
        "objetivo": "Objetivo",
        "notas": "Notas",
        "pasos": _pasos_payload(),
    }
    resp = client.post(
        "/entrenamientos",
        json=payload,
        headers={"X-CSRF-Token": token},
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["id"] > 0


def test_actualizar_entrenamiento_no_trunca_objetivo_valor(client):
    _set_session(client, user_id=2, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    payload = {
        "nombre": "Entreno actualizado",
        "objetivo": "Objetivo actualizado",
        "notas": "Notas actualizadas",
        "pasos": [
            {
                "tipo_paso": "interval",
                "objetivo_tipo": "distancia",
                "objetivo_valor": "400m",
                "unidad": "m",
                "zona": "Z4",
                "recuperacion_valor": "1:30",
                "recuperacion_unidad": "min",
                "descripcion": "Bloque principal",
            }
        ],
    }
    resp = client.put(
        "/entrenamientos/3",
        json=payload,
        headers={"X-CSRF-Token": token},
    )

    assert resp.status_code == 200
    assert resp.get_json()["message"] == "Entrenamiento actualizado"


def test_actualizar_entrenamiento_rechaza_sin_pasos(client):
    _set_session(client, user_id=2, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    payload = {
        "nombre": "Sin pasos",
        "objetivo": "x",
        "notas": "x",
        "pasos": [],
    }
    resp = client.put(
        "/entrenamientos/3",
        json=payload,
        headers={"X-CSRF-Token": token},
    )

    assert resp.status_code == 400
    assert "al menos un bloque" in resp.get_json()["error"]
