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
    subgrupo TEXT,
    vdot_val REAL,
    vdot_fecha TEXT
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
    url_datos TEXT,
    rpe INTEGER,
    sensacion TEXT,
    fatiga TEXT,
    dolor INTEGER DEFAULT 0,
    zona_dolor TEXT,
    completado INTEGER
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
    visible INTEGER DEFAULT 0,
    ciclo_tipo TEXT,
    ciclo_id INTEGER,
    macrociclo_id INTEGER,
    mesociclo_id INTEGER,
    microciclo_id INTEGER,
    created_at TEXT,
    updated_at TEXT
);
CREATE TABLE zonas_entrenamiento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atleta_id INTEGER,
    vam REAL,
    vdot_val REAL,
    z1 TEXT, z2 TEXT, z3 TEXT, z4 TEXT, z5 TEXT, z6 TEXT,
    fc_z1 REAL, fc_z2 REAL, fc_z3 REAL, fc_z4 REAL, fc_z5 REAL, fc_z6 REAL,
    metodo TEXT,
    fecha_inicio TEXT,
    fecha_fin TEXT
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


def test_km_totales_personalizado_convierte_bloques_por_tiempo(client):
    # Mismo ejemplo que describió el usuario: calentamiento de 20' en Z1,
    # el atleta tiene Z1 a 5:00 min/km -> 4 km. Se suma con un bloque por
    # distancia (5 km) tal cual, sin conversión.
    import backend.app as app_module

    pasos = [
        {
            "id": 1, "parent_id": None, "tipo_paso": "warmup",
            "objetivo_tipo": "tiempo", "objetivo_valor": 20, "unidad": "min", "zona": "Z1",
        },
        {
            "id": 2, "parent_id": None, "tipo_paso": "interval",
            "objetivo_tipo": "distancia", "objetivo_valor": 5, "unidad": "km", "zona": "Z3",
        },
    ]
    zonas_atleta = {"z1": 5.0}  # zonas_entrenamiento.z1 guarda minutos/km en decimal, 5.0 = 5:00/km

    total = app_module._km_totales_personalizado(pasos, zonas_atleta)
    assert total == pytest.approx(9.0)  # 4 km (20'/5:00) + 5 km


def test_km_totales_personalizado_multiplica_por_repeticiones(client):
    import backend.app as app_module

    pasos = [
        {
            "id": 1, "parent_id": None, "tipo_paso": "repeat", "repeticiones": 4,
        },
        {
            "id": 2, "parent_id": 1, "tipo_paso": "interval",
            "objetivo_tipo": "tiempo", "objetivo_valor": 3, "unidad": "min", "zona": "Z2",
        },
    ]
    zonas_atleta = {"z2": 3.0}  # 3' a ritmo 3:00/km = 1 km por repetición

    total = app_module._km_totales_personalizado(pasos, zonas_atleta)
    assert total == pytest.approx(4.0)  # 4 repeticiones × 1 km


def test_km_totales_personalizado_sin_zonas_devuelve_none(client):
    # Sin zonas registradas no hay ritmo con el que convertir tiempo a km;
    # el llamador debe caer al km_totales genérico de la plantilla.
    import backend.app as app_module

    pasos = [{"id": 1, "parent_id": None, "tipo_paso": "warmup", "objetivo_tipo": "tiempo", "objetivo_valor": 20, "unidad": "min", "zona": "Z1"}]
    assert app_module._km_totales_personalizado(pasos, None) is None
    assert app_module._km_totales_personalizado(pasos, {}) is None


def test_asignar_entrenamiento_calcula_km_previstos_personalizado(client):
    # Extremo a extremo: asignar una plantilla con un bloque por tiempo a
    # un atleta con zonas registradas debe guardar km_previstos calculado
    # con su ritmo, no el km_totales genérico de la plantilla (10.0).
    import backend.app as app_module

    conn = sqlite3.connect(app_module.DATABASE)
    conn.execute(
        """
        INSERT INTO entrenamientos_detalle
            (id, entrenamiento_id, parent_id, orden, tipo_paso, objetivo_tipo, objetivo_valor, unidad, zona)
        VALUES (20, 3, NULL, 1, 'warmup', 'tiempo', 20, 'min', 'Z1')
        """
    )
    conn.execute(
        """
        INSERT INTO zonas_entrenamiento (atleta_id, vam, z1, fecha_inicio, fecha_fin)
        VALUES (4, 18.0, 5.0, '2024-01-01', NULL)
        """
    )
    conn.commit()
    conn.close()

    _set_session(client, user_id=2, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]
    resp = client.post(
        "/entrenamientos_asignados",
        json={"atleta_id": 4, "entrenamiento_id": 3, "fecha": "2026-08-20"},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 201

    conn = sqlite3.connect(app_module.DATABASE)
    row = conn.execute(
        "SELECT km_previstos FROM entrenamientos_asignados WHERE entrenamiento_id = 3 AND fecha = '2026-08-20'"
    ).fetchone()
    conn.close()
    assert row[0] == pytest.approx(4.0)  # 20' en Z1 a 5:00/km, no los 10.0 de la plantilla


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


def test_resultados_no_duplica_sesion_realizada_al_reenviar(client, tmp_path):
    # Regresión de un fallo real en producción: el mismo entrenamiento
    # del atleta aparecía repetido varias veces en su registro. Causa:
    # sesiones_realizadas.entrenamiento_asignado_id no tenía UNIQUE en
    # schema.sql/schema_mariadb.sql (sí lo tenía la definición de este
    # mismo archivo de test, por eso nunca se detectó), así que el
    # upsert de upsert_sesion_realizada/actualizar_sesion_feedback
    # (INSERT ... ON DUPLICATE KEY UPDATE / ON CONFLICT) no tenía nada
    # que hiciera de clave para detectar el duplicado: cada envío
    # insertaba una fila nueva en vez de actualizar la existente.
    _set_session(client, user_id=4, rol="atleta")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    for km in (2.05, 2.5):
        resp = client.post(
            "/entrenamientos_asignados/8/resultados",
            json={"series": [{"paso_detalle_id": 10, "repeticion": 1, "tiempo_real_seg": 600, "km_realizados": km}]},
            headers={"X-CSRF-Token": token},
        )
        assert resp.status_code == 200

    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(str(db_path))
    filas = conn.execute(
        "SELECT km_real FROM sesiones_realizadas WHERE entrenamiento_asignado_id = 8"
    ).fetchall()
    conn.close()
    assert len(filas) == 1
    assert filas[0][0] == pytest.approx(2.5)


def test_feedback_acepta_fatiga_como_texto(client):
    # Regresión de un fallo real en producción: el frontend siempre
    # envía "fatiga" como una etiqueta de texto ("normal", "alta"...),
    # igual que "sensacion", pero la columna feedbacks.fatiga (y
    # sesiones_realizadas.fatiga) se creó como INTEGER en
    # schema.sql/schema_mariadb.sql en vez de VARCHAR/TEXT como su
    # columna hermana "sensacion". SQLite no lo detecta (tipado débil),
    # pero MariaDB rechazaba el INSERT con "Incorrect integer value" y
    # el atleta no podía terminar el feedback. Este test no puede
    # reproducir el rechazo de MariaDB (limitación de correr contra
    # SQLite), pero sí evita una regresión en el propio código Python
    # si alguien reintrodujera un int(fatiga).
    _set_session(client, user_id=4, rol="atleta")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.post(
        "/feedback",
        json={
            "entrenamiento_id": 8,
            "completado": True,
            "rpe": 6,
            "sensacion": "bien",
            "fatiga": "normal",
            "dolor": False,
        },
        headers={"X-CSRF-Token": token},
    )

    assert resp.status_code == 200
