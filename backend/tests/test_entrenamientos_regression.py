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
CREATE TABLE entrenamientos_asignados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atleta_id INTEGER NOT NULL,
    entrenamiento_id INTEGER,
    fecha TEXT,
    nombre TEXT,
    objetivo TEXT,
    notas TEXT,
    km_previstos REAL DEFAULT 0,
    visible INTEGER DEFAULT 0
);
CREATE TABLE entrenamientos_asignados_detalle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_asignado_id INTEGER NOT NULL,
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
CREATE TABLE resultados_entrenamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_asignado_id INTEGER NOT NULL,
    paso_detalle_id INTEGER NOT NULL,
    repeticion INTEGER,
    tiempo_real_seg INTEGER,
    km_realizados REAL,
    fecha TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE km_realizados_entrenamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_asignado_id INTEGER UNIQUE,
    km_planificados REAL,
    km_realizados REAL,
    fecha TEXT
);
CREATE TABLE sesiones_realizadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_asignado_id INTEGER NOT NULL UNIQUE,
    atleta_id INTEGER NOT NULL,
    fecha_real TEXT,
    km_real REAL,
    duracion_real_seg INTEGER,
    origen_datos TEXT,
    comentario TEXT,
    rpe INTEGER,
    sensacion TEXT,
    fatiga TEXT,
    dolor INTEGER,
    zona_dolor TEXT,
    completado INTEGER
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
        INSERT INTO usuarios (id, nombre, apellidos, email, password_hash, rol, entrenador_id)
        VALUES (4, 'Athlete', 'Principal', 'athlete@example.com', '', 'atleta', 2)
        """
    )
    conn.execute(
        """
        INSERT INTO entrenamientos (id, nombre, objetivo, notas, bloque_principal, km_totales, creador_id)
        VALUES (3, 'Entreno base', 'Objetivo', 'Notas', 'Bloque', 10.0, 2)
        """
    )
    conn.execute(
        """
        INSERT INTO entrenamientos_asignados
            (id, atleta_id, entrenamiento_id, fecha, nombre, objetivo, notas, km_previstos, visible)
        VALUES (8, 4, 3, '2026-08-18', 'Asignado base', 'Objetivo', 'Notas', 3.5, 1)
        """
    )
    conn.executemany(
        """
        INSERT INTO entrenamientos_asignados_detalle
            (id, entrenamiento_asignado_id, parent_id, orden, tipo_paso,
             objetivo_tipo, objetivo_valor, unidad, zona, descripcion)
        VALUES (?, 8, NULL, ?, 'interval', 'distancia', ?, 'km', ?, ?)
        """,
        [
            (10, 1, 2.0, "Z2", "Bloque uno"),
            (11, 2, 1.5, "Z3", "Bloque dos"),
        ],
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


def test_resultados_guardan_km_por_bloque_y_total(client):
    _set_session(client, user_id=4, rol="atleta")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.post(
        "/entrenamientos_asignados/8/resultados",
        json={
            "series": [
                {"paso_detalle_id": 10, "repeticion": 1, "tiempo_real_seg": 620, "km_realizados": 2.05},
                {"paso_detalle_id": 11, "repeticion": 1, "tiempo_real_seg": 450, "km_realizados": 1.45},
            ],
        },
        headers={"X-CSRF-Token": token},
    )

    assert resp.status_code == 200
    assert resp.get_json()["km_realizados"] == pytest.approx(3.5)

    rows = client.get("/entrenamientos_asignados/8/resultados").get_json()
    assert [row["km_realizados"] for row in rows] == [2.05, 1.45]
    assert rows[0]["km_realizados_total"] == pytest.approx(3.5)
