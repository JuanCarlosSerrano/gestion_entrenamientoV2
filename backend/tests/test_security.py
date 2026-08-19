import importlib
import io
import os
import sqlite3

import pytest
from werkzeug.security import check_password_hash, generate_password_hash


SCHEMA_SQL = """
CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    nombre TEXT,
    apellidos TEXT,
    email TEXT,
    telefono TEXT,
    fecha_nacimiento TEXT,
    password_hash TEXT,
    rol TEXT,
    entrenador_id INTEGER,
    force_password_change INTEGER DEFAULT 0,
    aprobado INTEGER DEFAULT 1,
    categoria TEXT,
    grupo TEXT,
    subgrupo TEXT,
    activo INTEGER DEFAULT 1,
    foto_url TEXT
);
CREATE TABLE entrenamientos_asignados (
    id INTEGER PRIMARY KEY,
    atleta_id INTEGER,
    fecha TEXT,
    visible INTEGER,
    franja TEXT DEFAULT 'manana',
    publicar_en TEXT,
    publicado_en TEXT,
    entrenamiento_id INTEGER,
    ciclo_tipo TEXT,
    ciclo_id INTEGER,
    macrociclo_id INTEGER,
    mesociclo_id INTEGER,
    microciclo_id INTEGER,
    nombre TEXT,
    objetivo TEXT,
    notas TEXT,
    km_previstos REAL,
    vdot_usado REAL,
    zonas_metodo TEXT,
    estado_envio TEXT DEFAULT 'pendiente',
    fecha_envio TEXT,
    plantilla_version INTEGER,
    canal_comunicacion TEXT,
    personalizado INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);
CREATE TABLE entrenamientos (
    id INTEGER PRIMARY KEY,
    nombre TEXT,
    objetivo TEXT,
    notas TEXT,
    bloque_principal TEXT,
    km_totales REAL,
    creador_id INTEGER
);
CREATE TABLE entrenamientos_detalle (
    id INTEGER PRIMARY KEY,
    entrenamiento_id INTEGER,
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
CREATE TABLE IF NOT EXISTS entrenamientos_envios (
    id INTEGER PRIMARY KEY,
    entrenamiento_asignado_id INTEGER,
    atleta_id INTEGER,
    entrenador_id INTEGER,
    canal TEXT DEFAULT 'whatsapp',
    telefono_destino TEXT,
    mensaje_generado TEXT,
    estado TEXT DEFAULT 'pendiente',
    provider_message_id TEXT,
    error TEXT,
    url_publica TEXT,
    created_at TEXT,
    sent_at TEXT
);
"""


def _seed_data(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_SQL)
    conn.executemany(
        """
        INSERT INTO usuarios (id, nombre, apellidos, email, telefono, password_hash, rol, entrenador_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (1, "Coach", "Uno", "coach1@example.com", None, generate_password_hash("coach"), "entrenador", None),
            (2, "Coach", "Dos", "coach2@example.com", None, generate_password_hash("coach"), "entrenador", None),
            (3, "Athlete", "Uno", "athlete1@example.com", "+34 626 899 379", generate_password_hash("athlete"), "atleta", 1),
            (4, "Athlete", "Dos", "athlete2@example.com", "+34 600 000 000", generate_password_hash("athlete"), "atleta", 2),
        ],
    )
    conn.execute(
        """
        INSERT INTO entrenamientos (id, nombre, objetivo, notas, bloque_principal, km_totales, creador_id)
        VALUES (1, 'Rodaje base', 'Base', 'Notas plantilla', 'Rodaje', 8, 1)
        """
    )
    conn.execute(
        """
        INSERT INTO entrenamientos_detalle
          (id, entrenamiento_id, parent_id, orden, tipo_paso, repeticiones, objetivo_tipo,
           objetivo_valor, unidad, zona, recuperacion_valor, recuperacion_unidad, intensidad, descripcion)
        VALUES (1, 1, NULL, 1, 'interval', 1, 'distancia', 8, 'km', 'Z2', NULL, NULL, NULL, 'Rodaje')
        """
    )
    conn.execute(
        """
        INSERT INTO entrenamientos_asignados (id, atleta_id, fecha, visible, franja, entrenamiento_id, nombre, objetivo, notas)
        VALUES (9, 3, '2024-01-01', 0, 'manana', 1, 'Rodaje propio', 'Base propia', 'Notas asignadas')
        """
    )
    conn.execute(
        """
        INSERT INTO entrenamientos_asignados (id, atleta_id, fecha, visible, franja, entrenamiento_id, nombre)
        VALUES (10, 4, '2024-01-01', 1, 'manana', 1, 'Rodaje')
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


def _csrf(client):
    return client.get("/csrf-token").get_json()["csrf_token"]


def test_registro_publico_no_permite_crear_admin_entrenador_ni_atleta(client):
    for rol in ("admin", "entrenador", "atleta"):
        resp = client.post(
            "/register",
            json={
                "nombre": "Anon",
                "apellidos": "User",
                "email": f"anon-{rol}@example.com",
                "password": "cambiame",
                "rol": rol,
            },
        )
        assert resp.status_code in (401, 403)


def test_admin_crea_entrenador_con_password_temporal_no_fijo(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = _csrf(client)
    # El entrenador no puede usar el endpoint administrativo.
    forbidden = client.post(
        "/usuarios",
        json={"nombre": "No", "apellidos": "Permiso", "email": "nop@example.com", "rol": "admin"},
        headers={"X-CSRF-Token": token},
    )
    assert forbidden.status_code == 403

    _set_session(client, user_id=99, rol="admin")
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute(
        "INSERT INTO usuarios (id, nombre, apellidos, email, password_hash, rol) VALUES (99, 'Admin', 'Root', 'admin@example.com', ?, 'admin')",
        (generate_password_hash("admin"),),
    )
    conn.commit()
    conn.close()
    token = _csrf(client)

    resp = client.post(
        "/usuarios",
        json={"nombre": "Coach", "apellidos": "Nuevo", "email": "coach-new@example.com", "rol": "entrenador", "password": "cambiame"},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 201
    body = resp.get_json()
    temp = body["temporary_password"]
    assert temp
    assert temp != "cambiame"
    assert body["password_temporal"] == temp

    conn = sqlite3.connect(os.environ["DB_PATH"])
    password_hash, force = conn.execute(
        "SELECT password_hash, force_password_change FROM usuarios WHERE email = 'coach-new@example.com'"
    ).fetchone()
    conn.close()
    assert check_password_hash(password_hash, temp)
    assert not check_password_hash(password_hash, "cambiame")
    assert force == 1


def test_entrenador_crea_atleta_propio_sin_aceptar_password_cliente(client):
    _set_session(client, user_id=1, rol="entrenador")
    resp = client.post(
        "/configuracion/atletas",
        json={
            "nombre": "Nuevo",
            "apellidos": "Seguro",
            "email": "nuevo-seguro@example.com",
            "entrenador_id": 2,
            "password_temporal": "cambiame",
        },
        headers={"X-CSRF-Token": _csrf(client)},
    )
    assert resp.status_code == 201
    temp = resp.get_json()["temporary_password"]
    assert temp != "cambiame"

    conn = sqlite3.connect(os.environ["DB_PATH"])
    entrenador_id, password_hash, force = conn.execute(
        "SELECT entrenador_id, password_hash, force_password_change FROM usuarios WHERE email = 'nuevo-seguro@example.com'"
    ).fetchone()
    conn.close()
    assert entrenador_id == 1
    assert check_password_hash(password_hash, temp)
    assert not check_password_hash(password_hash, "cambiame")
    assert force == 1


def test_reset_password_respeta_permisos_y_genera_temporal_distinta(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = _csrf(client)
    forbidden = client.post("/usuarios/4/reset-password", headers={"X-CSRF-Token": token})
    assert forbidden.status_code == 403

    resp = client.post("/usuarios/3/reset-password", headers={"X-CSRF-Token": token})
    assert resp.status_code == 200
    temp_1 = resp.get_json()["temporary_password"]

    resp_2 = client.post("/usuarios/3/reset-password", headers={"X-CSRF-Token": token})
    assert resp_2.status_code == 200
    temp_2 = resp_2.get_json()["temporary_password"]
    assert temp_1 != temp_2

    conn = sqlite3.connect(os.environ["DB_PATH"])
    password_hash, force = conn.execute("SELECT password_hash, force_password_change FROM usuarios WHERE id = 3").fetchone()
    conn.close()
    assert check_password_hash(password_hash, temp_2)
    assert force == 1

    _set_session(client, user_id=3, rol="atleta")
    forbidden = client.post("/usuarios/3/reset-password", headers={"X-CSRF-Token": _csrf(client)})
    assert forbidden.status_code == 403


def test_force_password_change_bloquea_funciones_hasta_cambiar_password(client):
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("UPDATE usuarios SET force_password_change = 1 WHERE id = 3")
    conn.commit()
    conn.close()

    _set_session(client, user_id=3, rol="atleta")
    assert client.get("/atletas").status_code == 403

    resp = client.post(
        "/usuarios/password",
        json={"current_password": "athlete", "new_password": "nueva-clave-segura"},
        headers={"X-CSRF-Token": _csrf(client)},
    )
    assert resp.status_code == 200

    conn = sqlite3.connect(os.environ["DB_PATH"])
    force = conn.execute("SELECT force_password_change FROM usuarios WHERE id = 3").fetchone()[0]
    conn.close()
    assert force == 0
    assert client.get("/atletas").status_code == 200


def test_login_no_imprime_password_en_stdout(client, capsys):
    resp = client.post("/login", json={"email": "athlete1@example.com", "password": "athlete"})
    assert resp.status_code == 200
    captured = capsys.readouterr()
    assert "athlete" not in captured.out
    assert "password" not in captured.out.lower()


def test_upload_foto_rechaza_extension_no_permitida(client):
    _set_session(client, user_id=3, rol="atleta")
    resp = client.post(
        "/actualizar_perfil",
        data={
            "nombre": "Athlete",
            "apellidos": "Uno",
            "email": "athlete1@example.com",
            "foto": (io.BytesIO(b"<svg></svg>"), "avatar.svg"),
        },
        content_type="multipart/form-data",
        headers={"X-CSRF-Token": _csrf(client)},
    )
    assert resp.status_code == 400


def test_upload_fit_rechaza_extension_no_fit(client):
    _set_session(client, user_id=3, rol="atleta")
    resp = client.post(
        "/sesiones/9/archivo",
        data={"archivo": (io.BytesIO(b"not-fit"), "track.txt"), "origen": "manual"},
        content_type="multipart/form-data",
        headers={"X-CSRF-Token": _csrf(client)},
    )
    assert resp.status_code == 400


def test_entrenador_no_puede_ver_calendario_de_otro(client):
    _set_session(client, user_id=1, rol="entrenador")
    resp = client.get("/calendario/4")
    assert resp.status_code == 403


def test_entrenador_puede_consultar_planificacion_de_atleta_propio(client):
    _set_session(client, user_id=1, rol="entrenador")
    resp = client.get("/planificacion/atleta/3/calendario?mes=2024-01")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["atleta"]["id"] == 3
    assert data["sesiones"][0]["id"] == 9


def test_entrenador_no_puede_consultar_planificacion_de_atleta_ajeno(client):
    _set_session(client, user_id=1, rol="entrenador")
    resp = client.get("/planificacion/atleta/4/calendario?mes=2024-01")
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


def test_entrenador_puede_modificar_entrenamiento_asignado_propio(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.put(
        "/planificacion/sesiones/9",
        json={"fecha": "2024-01-02", "nombre": "Rodaje editado", "franja": "tarde", "visible": 1},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 200
    data = client.get("/planificacion/atleta/3/dia?fecha=2024-01-02").get_json()
    assert data["sesiones"][0]["nombre"] == "Rodaje editado"
    assert data["sesiones"][0]["franja"] == "tarde"


def test_entrenador_no_puede_modificar_asignacion_de_atleta_ajeno(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.put(
        "/planificacion/sesiones/10",
        json={"fecha": "2024-01-02", "nombre": "No permitido"},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 403


def test_editar_asignacion_no_modifica_plantilla(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.put(
        "/planificacion/sesiones/9",
        json={"fecha": "2024-01-01", "nombre": "Asignado cambiado", "objetivo": "Objetivo asignado"},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 200

    conn = sqlite3.connect(os.environ["DB_PATH"])
    plantilla = conn.execute("SELECT nombre, objetivo FROM entrenamientos WHERE id = 1").fetchone()
    conn.close()
    assert plantilla == ("Rodaje base", "Base")


def test_anadir_entrenamiento_a_dia_crea_copia_oculta(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.post(
        "/planificacion/atleta/3/sesiones",
        json={"fecha": "2024-01-03", "entrenamiento_id": 1, "franja": "manana"},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 201
    new_id = resp.get_json()["id"]
    data = client.get("/planificacion/atleta/3/dia?fecha=2024-01-03").get_json()
    created = next(s for s in data["sesiones"] if s["id"] == new_id)
    assert created["visible"] == 0
    assert created["estado_visibilidad"] == "oculto"


def test_entrenador_puede_publicar_entrenamiento_propio_y_genera_envio(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.post(
        "/planificacion/publicacion/publicar",
        json={"ids": [9]},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 200

    conn = sqlite3.connect(os.environ["DB_PATH"])
    asignado = conn.execute("SELECT visible, publicado_en, estado_envio FROM entrenamientos_asignados WHERE id = 9").fetchone()
    envios = conn.execute("SELECT mensaje_generado, estado, telefono_destino FROM entrenamientos_envios WHERE entrenamiento_asignado_id = 9").fetchall()
    conn.close()

    assert asignado[0] == 1
    assert asignado[1] is not None
    assert asignado[2] == "deshabilitado"
    assert len(envios) == 1
    assert "Rodaje propio" in envios[0][0]
    assert "Consulta el entrenamiento completo en MindPace." in envios[0][0]
    assert "http" not in envios[0][0].lower()
    assert envios[0][1] == "deshabilitado"
    assert envios[0][2] == "34626899379"


def test_entrenador_no_puede_publicar_atleta_ajeno(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.post(
        "/planificacion/publicacion/publicar",
        json={"ids": [10]},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 403


def test_programacion_guarda_fecha_y_no_publica_antes(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.post(
        "/planificacion/publicacion/programar",
        json={"ids": [9], "publicar_en": "2099-01-01T20:00"},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 200

    conn = sqlite3.connect(os.environ["DB_PATH"])
    asignado = conn.execute("SELECT visible, publicar_en, publicado_en FROM entrenamientos_asignados WHERE id = 9").fetchone()
    envios = conn.execute("SELECT COUNT(*) FROM entrenamientos_envios WHERE entrenamiento_asignado_id = 9").fetchone()[0]
    conn.close()

    assert asignado[0] == 0
    assert asignado[1].startswith("2099-01-01")
    assert asignado[2] is None
    assert envios == 0


def test_publicar_dos_veces_no_duplica_aviso(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    for _ in range(2):
        resp = client.post(
            "/planificacion/publicacion/publicar",
            json={"ids": [9]},
            headers={"X-CSRF-Token": token},
        )
        assert resp.status_code == 200

    conn = sqlite3.connect(os.environ["DB_PATH"])
    envios = conn.execute("SELECT COUNT(*) FROM entrenamientos_envios WHERE entrenamiento_asignado_id = 9").fetchone()[0]
    conn.close()
    assert envios == 1


def test_servicio_normaliza_telefono_y_mensaje_sin_enlace():
    from backend.services.whatsapp_service import (
        FINAL_MESSAGE,
        generar_mensaje_entrenamiento,
        normalizar_telefono_whatsapp,
    )

    assert normalizar_telefono_whatsapp("+34 626 899 379") == "34626899379"
    mensaje = generar_mensaje_entrenamiento("Martes 18", "Series 6x800 Z4", "Z4 · Rec 2'")
    assert FINAL_MESSAGE in mensaje
    assert "http" not in mensaje.lower()


def test_whatsapp_deshabilitado_no_hace_peticion_externa(monkeypatch):
    from backend.services import whatsapp_service

    monkeypatch.setenv("WHATSAPP_ENABLED", "false")

    def fail_post(*args, **kwargs):
        raise AssertionError("No debe llamarse a Meta si WhatsApp está deshabilitado")

    monkeypatch.setattr(whatsapp_service.requests, "post", fail_post)
    result = whatsapp_service.enviar_whatsapp("+34 626 899 379", "Mensaje")
    assert result["disabled"] is True
    assert result["ok"] is False


def test_respuesta_meta_guarda_wamid(client, monkeypatch):
    import backend.app as app_module

    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    monkeypatch.setattr(
        app_module,
        "enviar_whatsapp",
        lambda numero, mensaje: {
            "ok": True,
            "provider_message_id": "wamid.test123",
            "status_code": 200,
            "response": {"messages": [{"id": "wamid.test123"}]},
            "error": None,
        },
    )

    resp = client.post(
        "/planificacion/publicacion/publicar",
        json={"ids": [9]},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["publicados"][0]["envio"]["provider_message_id"] == "wamid.test123"

    conn = sqlite3.connect(os.environ["DB_PATH"])
    envio = conn.execute(
        "SELECT estado, provider_message_id FROM entrenamientos_envios WHERE entrenamiento_asignado_id = 9"
    ).fetchone()
    conn.close()
    assert envio == ("enviado", "wamid.test123")


def test_error_meta_queda_registrado_y_no_revierte_publicacion(client, monkeypatch):
    import backend.app as app_module

    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    monkeypatch.setattr(
        app_module,
        "enviar_whatsapp",
        lambda numero, mensaje: {
            "ok": False,
            "provider_message_id": None,
            "status_code": 400,
            "response": {"error": {"message": "Bad request"}},
            "error": "Bad request",
        },
    )

    resp = client.post(
        "/planificacion/publicacion/publicar",
        json={"ids": [9]},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 200

    conn = sqlite3.connect(os.environ["DB_PATH"])
    asignado = conn.execute("SELECT visible FROM entrenamientos_asignados WHERE id = 9").fetchone()
    envio = conn.execute(
        "SELECT estado, error FROM entrenamientos_envios WHERE entrenamiento_asignado_id = 9"
    ).fetchone()
    conn.close()
    assert asignado[0] == 1
    assert envio[0] == "error"
    assert "Bad request" in envio[1]


def test_timeout_meta_devuelve_error_controlado(monkeypatch):
    from backend.services import whatsapp_service

    monkeypatch.setenv("WHATSAPP_ENABLED", "true")
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "token-test")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "phone-id-test")

    def timeout_post(*args, **kwargs):
        raise whatsapp_service.requests.Timeout()

    monkeypatch.setattr(whatsapp_service.requests, "post", timeout_post)
    result = whatsapp_service.enviar_whatsapp("+34 626 899 379", "Mensaje")
    assert result["ok"] is False
    assert "Timeout" in result["error"]


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


# --- Regresión: fugas de propiedad entrenador-atleta detectadas en la
# revisión de 2026-08-19 (asignación de entrenamientos/ciclos, lectura de
# historial, edición/borrado de plantillas y borrado de asignaciones). ---


def test_entrenador_no_puede_asignar_entrenamiento_a_atleta_ajeno(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.post(
        "/entrenamientos_asignados",
        json={"atletas_ids": [4], "entrenamiento_id": 1, "fecha": "2024-01-05"},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 403


def test_entrenador_no_puede_asignar_por_lote_a_atleta_ajeno(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.post(
        "/asignar_entrenamiento_lote",
        json={"atletas_ids": [4], "entrenamiento_id": 1, "fecha": "2024-01-05"},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 403


def test_entrenador_no_puede_leer_historial_de_atleta_ajeno(client):
    _set_session(client, user_id=1, rol="entrenador")
    resp = client.get("/entrenamientos_asignados/4")
    assert resp.status_code == 403


def test_entrenador_puede_leer_historial_de_su_propio_atleta(client):
    _set_session(client, user_id=1, rol="entrenador")
    resp = client.get("/entrenamientos_asignados/3")
    assert resp.status_code == 200


def test_entrenador_no_puede_editar_plantilla_de_otro_entrenador(client):
    _set_session(client, user_id=2, rol="entrenador")  # entrenamiento 1 es de coach 1
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.put(
        "/entrenamientos/1",
        json={
            "nombre": "Plantilla modificada",
            "pasos": [{"tipo_paso": "interval", "objetivo_valor": 5, "unidad": "km"}],
        },
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 403


def test_entrenador_no_puede_borrar_plantilla_de_otro_entrenador(client):
    _set_session(client, user_id=2, rol="entrenador")  # entrenamiento 1 es de coach 1
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.delete("/entrenamientos/1", headers={"X-CSRF-Token": token})
    assert resp.status_code == 403

    # La plantilla debe seguir existiendo para su dueño real
    _set_session(client, user_id=1, rol="entrenador")
    assert client.get("/entrenamientos/1").status_code == 200


def test_editar_entrenamiento_asignado_sin_mandar_visible_no_lo_oculta(client):
    # Regresión: calendario.js reutilizaba el mismo payload de "crear"
    # (visible=0) también al editar, re-ocultando sesiones ya publicadas.
    # El contrato correcto es: si el payload no incluye "visible", el
    # backend debe conservar el estado de publicación actual.
    _set_session(client, user_id=2, rol="entrenador")  # asignación 10 es del atleta 4 (coach 2), visible=1
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.put(
        "/entrenamientos_asignados/10",
        json={"fecha": "2024-01-02", "nombre": "Rodaje editado desde calendario"},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 200

    data = client.get("/entrenamientos_asignados/uno/10").get_json()
    assert data["nombre"] == "Rodaje editado desde calendario"
    assert data["visible"] == 1


def test_publicar_visibilidad_masiva_genera_envio_whatsapp(client):
    # Regresión: el endpoint bulk de visibilidad (usado desde calendario.js
    # y grupo_entrenamiento.js) hacía un UPDATE directo sin pasar por
    # publication_service, así que publicar desde ahí no generaba aviso de
    # WhatsApp ni registro de envío. Debe comportarse igual que el
    # publicar individual.
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.post(
        "/entrenamientos_asignados/visibilidad",
        json={"atletas": [3], "asignacion_id": 9, "visible": 1},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 200
    assert resp.get_json()["updated"] == 1

    conn = sqlite3.connect(os.environ["DB_PATH"])
    asignado = conn.execute(
        "SELECT visible, publicado_en FROM entrenamientos_asignados WHERE id = 9"
    ).fetchone()
    envios = conn.execute(
        "SELECT estado FROM entrenamientos_envios WHERE entrenamiento_asignado_id = 9"
    ).fetchall()
    conn.close()

    assert asignado[0] == 1
    assert asignado[1] is not None
    assert len(envios) == 1


def test_entrenador_no_puede_asignar_ciclo_a_atleta_ajeno(client):
    _set_session(client, user_id=1, rol="entrenador")
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.post(
        "/ciclos/asignar",
        json={"tipo": "micro", "ciclo_id": 1, "atletas": [4], "fecha_inicio": "2024-01-05"},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 403


def test_entrenador_no_puede_borrar_asignacion_de_atleta_ajeno_ni_deja_huella(client):
    _set_session(client, user_id=1, rol="entrenador")  # asignación 10 es del atleta 4 (coach 2)
    token = client.get("/csrf-token").get_json()["csrf_token"]

    resp = client.delete("/entrenamientos_asignados/10", headers={"X-CSRF-Token": token})
    assert resp.status_code == 403

    # La asignación no debe haberse borrado (ni parcialmente) pese al 403
    _set_session(client, user_id=2, rol="entrenador")
    assert client.get("/entrenamientos_asignados/uno/10").status_code == 200
