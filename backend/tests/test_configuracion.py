import importlib
import io
import sqlite3

from werkzeug.security import check_password_hash, generate_password_hash


SCHEMA_SQL = """
CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    apellidos TEXT,
    email TEXT UNIQUE,
    telefono TEXT,
    fecha_nacimiento TEXT,
    password_hash TEXT,
    rol TEXT,
    entrenador_id INTEGER,
    force_password_change INTEGER DEFAULT 0,
    aprobado INTEGER DEFAULT 1,
    activo INTEGER DEFAULT 1,
    categoria TEXT,
    grupo TEXT,
    subgrupo TEXT,
    foto_url TEXT,
    vdot_val REAL,
    vdot_fecha TEXT,
    vdot_distancia_m REAL,
    vdot_tiempo_seg INTEGER
);
CREATE TABLE entrenamientos_asignados (
    id INTEGER PRIMARY KEY,
    atleta_id INTEGER,
    fecha TEXT,
    visible INTEGER DEFAULT 1,
    nombre TEXT,
    km_previstos REAL
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
    atleta_id INTEGER,
    entrenamiento_asignado_id INTEGER,
    comentario TEXT
);
CREATE TABLE sesiones_realizadas (
    id INTEGER PRIMARY KEY,
    atleta_id INTEGER,
    entrenamiento_asignado_id INTEGER
);
CREATE TABLE entrenamientos_envios (
    id INTEGER PRIMARY KEY,
    atleta_id INTEGER,
    entrenamiento_asignado_id INTEGER
);
CREATE TABLE alertas_entrenamientos (
    id INTEGER PRIMARY KEY,
    atleta_id INTEGER,
    entrenamiento_asignado_id INTEGER,
    activo INTEGER DEFAULT 1
);
CREATE TABLE zonas_entrenamiento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atleta_id INTEGER,
    vam REAL,
    vdot_val REAL,
    z1 REAL,
    z2 REAL,
    z3 REAL,
    z4 REAL,
    z5 REAL,
    z6 REAL,
    fc_z1 REAL,
    fc_z2 REAL,
    fc_z3 REAL,
    fc_z4 REAL,
    fc_z5 REAL,
    fc_z6 REAL,
    metodo TEXT,
    fecha_inicio TEXT,
    fecha_fin TEXT
);
"""


def _seed(db_path):
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_SQL)
    conn.executemany(
        """
        INSERT INTO usuarios
          (id, nombre, apellidos, email, telefono, password_hash, rol, entrenador_id,
           categoria, grupo, subgrupo, activo, force_password_change)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (1, "Coach", "Uno", "coach1@example.com", None, generate_password_hash("coach"), "entrenador", None, None, None, None, 1, 0),
            (2, "Coach", "Dos", "coach2@example.com", None, generate_password_hash("coach"), "entrenador", None, None, None, None, 1, 0),
            (3, "Athlete", "Uno", "athlete1@example.com", "+341", generate_password_hash("old"), "atleta", 1, "Senior", "A", "A1", 1, 0),
            (4, "Athlete", "Dos", "athlete2@example.com", "+342", generate_password_hash("old"), "atleta", 2, "Senior", "B", "B1", 1, 0),
            (5, "Sin", "Historial", "clean@example.com", None, generate_password_hash("old"), "atleta", 1, None, None, None, 1, 0),
        ],
    )
    conn.execute("INSERT INTO entrenamientos_asignados (id, atleta_id, fecha, visible, nombre) VALUES (20, 3, '2026-01-01', 1, 'Visible')")
    conn.execute("INSERT INTO entrenamientos_asignados (id, atleta_id, fecha, visible, nombre) VALUES (21, 3, '2026-01-02', 0, 'Oculto')")
    conn.execute(
        "INSERT INTO entrenamientos_asignados_detalle (id, entrenamiento_asignado_id, orden, tipo_paso, objetivo_valor, unidad) VALUES (1, 20, 1, 'warmup', 2, 'km')"
    )
    conn.execute(
        "INSERT INTO entrenamientos_asignados_detalle (id, entrenamiento_asignado_id, orden, tipo_paso, objetivo_valor, unidad) VALUES (2, 21, 1, 'warmup', 2, 'km')"
    )
    conn.execute(
        """
        INSERT INTO zonas_entrenamiento
          (id, atleta_id, vam, vdot_val, z1, z2, z3, z4, z5, z6, metodo, fecha_inicio, fecha_fin)
        VALUES (1, 3, 18, 52, 5.5, 5.0, 4.5, 4.0, 3.8, 3.5, 'vdot', '2026-01-01', NULL)
        """
    )
    conn.commit()
    conn.close()


def _client(tmp_path, monkeypatch):
    db_path = tmp_path / "config.db"
    monkeypatch.setenv("DB_ENGINE", "sqlite")
    monkeypatch.setenv("DB_PATH", str(db_path))
    import backend.app as app_module

    importlib.reload(app_module)
    db_path.unlink(missing_ok=True)
    _seed(str(db_path))
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client(), str(db_path)


def _set_session(client, user_id, rol):
    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["user_rol"] = rol


def _csrf(client):
    return client.get("/csrf-token").get_json()["csrf_token"]


def test_entrenador_lista_solo_sus_atletas(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    _set_session(client, 1, "entrenador")

    data = client.get("/configuracion/atletas").get_json()
    emails = {a["email"] for a in data["atletas"]}

    assert "athlete1@example.com" in emails
    assert "clean@example.com" in emails
    assert "athlete2@example.com" not in emails


def test_entrenador_no_puede_editar_atleta_ajeno(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    _set_session(client, 1, "entrenador")

    resp = client.put(
        "/configuracion/atletas/4",
        json={"nombre": "No", "apellidos": "Permiso", "email": "no@example.com"},
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert resp.status_code == 403


def test_alta_crea_atleta_asociado_al_entrenador(tmp_path, monkeypatch):
    client, db_path = _client(tmp_path, monkeypatch)
    _set_session(client, 1, "entrenador")

    resp = client.post(
        "/configuracion/atletas",
        json={"nombre": "Nuevo", "apellidos": "Atleta", "email": "nuevo@example.com"},
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["password_temporal"]
    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT entrenador_id, force_password_change, activo FROM usuarios WHERE email = 'nuevo@example.com'").fetchone()
    conn.close()
    assert row == (1, 1, 1)


def test_email_duplicado_se_rechaza(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    _set_session(client, 1, "entrenador")

    resp = client.post(
        "/configuracion/atletas",
        json={"nombre": "Dup", "apellidos": "Email", "email": "athlete1@example.com"},
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert resp.status_code == 409


def test_reset_password_cambia_hash_y_fuerza_cambio(tmp_path, monkeypatch):
    client, db_path = _client(tmp_path, monkeypatch)
    _set_session(client, 1, "entrenador")
    conn = sqlite3.connect(db_path)
    old_hash = conn.execute("SELECT password_hash FROM usuarios WHERE id = 3").fetchone()[0]
    conn.close()

    resp = client.post(
        "/configuracion/atletas/3/reset-password",
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert resp.status_code == 200
    temp = resp.get_json()["password_temporal"]
    conn = sqlite3.connect(db_path)
    new_hash, force = conn.execute("SELECT password_hash, force_password_change FROM usuarios WHERE id = 3").fetchone()
    conn.close()
    assert new_hash != old_hash
    assert check_password_hash(new_hash, temp)
    assert force == 1


def test_atleta_con_historial_no_se_borra_y_se_desactiva(tmp_path, monkeypatch):
    client, db_path = _client(tmp_path, monkeypatch)
    _set_session(client, 1, "entrenador")

    resp = client.delete("/atletas/3", headers={"X-CSRF-Token": _csrf(client)})

    assert resp.status_code == 200
    assert resp.get_json()["archivado"] is True
    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT activo FROM usuarios WHERE id = 3").fetchone()
    entrenos = conn.execute("SELECT COUNT(*) FROM entrenamientos_asignados WHERE atleta_id = 3").fetchone()[0]
    conn.close()
    assert row[0] == 0
    assert entrenos == 2


def test_atleta_sin_historial_puede_borrarse(tmp_path, monkeypatch):
    client, db_path = _client(tmp_path, monkeypatch)
    _set_session(client, 1, "entrenador")

    resp = client.delete("/atletas/5", headers={"X-CSRF-Token": _csrf(client)})

    assert resp.status_code == 200
    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT id FROM usuarios WHERE id = 5").fetchone()
    conn.close()
    assert row is None


def test_desactivar_atleta_conserva_historial(tmp_path, monkeypatch):
    client, db_path = _client(tmp_path, monkeypatch)
    _set_session(client, 1, "entrenador")

    resp = client.put(
        "/configuracion/atletas/3/estado",
        json={"activo": 0},
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert resp.status_code == 200
    conn = sqlite3.connect(db_path)
    activo = conn.execute("SELECT activo FROM usuarios WHERE id = 3").fetchone()[0]
    entrenos = conn.execute("SELECT COUNT(*) FROM entrenamientos_asignados WHERE atleta_id = 3").fetchone()[0]
    conn.close()
    assert activo == 0
    assert entrenos == 2


def test_atleta_solo_lista_entrenamientos_visibles(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    _set_session(client, 3, "atleta")

    resp = client.get("/entrenamientos_asignados/3")

    assert resp.status_code == 200
    ids = {item["id"] for item in resp.get_json()}
    assert 20 in ids
    assert 21 not in ids


def test_atleta_no_puede_ver_detalle_oculto(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    _set_session(client, 3, "atleta")

    resp = client.get("/entrenamientos_asignados/21/detalle")

    assert resp.status_code == 404


def test_entrenador_puede_ver_detalle_oculto_de_su_atleta(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    _set_session(client, 1, "entrenador")

    resp = client.get("/entrenamientos_asignados/21/detalle")

    assert resp.status_code == 200
    assert resp.get_json()[0]["entrenamiento_asignado_id"] == 21


def test_atleta_no_puede_enviar_feedback_a_entrenamiento_oculto(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    _set_session(client, 3, "atleta")

    resp = client.post(
        "/feedback",
        json={"entrenamiento_id": 21, "completado": True, "rpe": 5},
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert resp.status_code == 404


def test_atleta_no_puede_guardar_resultados_en_entrenamiento_oculto(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    _set_session(client, 3, "atleta")

    resp = client.post(
        "/entrenamientos_asignados/21/resultados",
        json={"series": [], "km_realizados": 5},
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert resp.status_code == 404


def test_atleta_no_puede_subir_fit_a_entrenamiento_oculto(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    _set_session(client, 3, "atleta")

    resp = client.post(
        "/sesiones/21/archivo",
        data={"archivo": (io.BytesIO(b"fit"), "test.fit"), "origen": "manual"},
        content_type="multipart/form-data",
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert resp.status_code == 404


def test_nueva_zona_cierra_anterior_y_conserva_historico(tmp_path, monkeypatch):
    client, db_path = _client(tmp_path, monkeypatch)
    _set_session(client, 1, "entrenador")

    resp = client.post(
        "/guardar_zonas",
        json={
            "atleta_id": 3,
            "vam": 19,
            "vdot_val": 55,
            "z1": 5.2,
            "z2": 4.8,
            "z3": 4.4,
            "z4": 4.0,
            "z5": 3.7,
            "z6": 3.4,
            "metodo": "vdot",
            "fecha_inicio": "2026-02-01",
        },
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert resp.status_code == 200
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT vdot_val, fecha_inicio, fecha_fin FROM zonas_entrenamiento WHERE atleta_id = 3 ORDER BY fecha_inicio"
    ).fetchall()
    conn.close()
    assert rows == [(52, "2026-01-01", "2026-01-31"), (55, "2026-02-01", None)]


def test_entrenador_no_puede_modificar_zonas_de_atleta_ajeno(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    _set_session(client, 1, "entrenador")

    resp = client.post(
        "/guardar_zonas",
        json={"atleta_id": 4, "vam": 18, "z1": 5, "z2": 4, "z3": 3, "z4": 2, "z5": 1, "z6": 1, "fecha_inicio": "2026-01-01"},
        headers={"X-CSRF-Token": _csrf(client)},
    )

    assert resp.status_code == 403
