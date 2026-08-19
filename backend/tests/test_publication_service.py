import sqlite3

from flask import Flask

from backend.services import publication_service


def _conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE usuarios (
            id INTEGER PRIMARY KEY,
            nombre TEXT,
            rol TEXT,
            entrenador_id INTEGER,
            telefono TEXT
        );
        CREATE TABLE entrenamientos_asignados (
            id INTEGER PRIMARY KEY,
            atleta_id INTEGER,
            fecha TEXT,
            visible INTEGER DEFAULT 0,
            publicar_en TEXT,
            publicado_en TEXT,
            estado_envio TEXT,
            fecha_envio TEXT,
            canal_comunicacion TEXT,
            updated_at TEXT,
            nombre TEXT
        );
        CREATE TABLE entrenamientos_asignados_detalle (
            id INTEGER PRIMARY KEY,
            entrenamiento_asignado_id INTEGER,
            parent_id INTEGER,
            orden INTEGER,
            tipo_paso TEXT,
            objetivo_valor REAL,
            unidad TEXT,
            zona TEXT,
            recuperacion_valor REAL,
            recuperacion_unidad TEXT,
            descripcion TEXT
        );
        CREATE TABLE entrenamientos_envios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entrenamiento_asignado_id INTEGER,
            atleta_id INTEGER,
            entrenador_id INTEGER,
            canal TEXT,
            telefono_destino TEXT,
            mensaje_generado TEXT,
            estado TEXT,
            provider_message_id TEXT,
            error TEXT,
            url_publica TEXT,
            created_at TEXT,
            sent_at TEXT
        );
        INSERT INTO usuarios (id, nombre, rol, entrenador_id, telefono) VALUES
            (1, 'Admin', 'admin', NULL, NULL),
            (2, 'Coach Uno', 'entrenador', NULL, NULL),
            (3, 'Coach Dos', 'entrenador', NULL, NULL),
            (4, 'Atleta Uno', 'atleta', 2, '+34 600 111 222'),
            (5, 'Atleta Dos', 'atleta', 3, '+34 600 333 444');
        INSERT INTO entrenamientos_asignados (id, atleta_id, fecha, visible, publicar_en, nombre) VALUES
            (10, 4, '2026-08-18', 0, NULL, 'Rodaje Z2'),
            (11, 5, '2026-08-18', 0, NULL, 'Series ajenas'),
            (12, 4, '2026-08-18', 0, '2026-08-18 08:00:00', 'Programada');
        INSERT INTO entrenamientos_asignados_detalle (
            entrenamiento_asignado_id, orden, tipo_paso, objetivo_valor, unidad, zona, descripcion
        ) VALUES
            (10, 1, 'run', 8, 'km', 'Z2', 'Rodaje suave'),
            (11, 1, 'run', 6, 'km', 'Z4', 'Series'),
            (12, 1, 'run', 5, 'km', 'Z2', 'Programada');
        """
    )
    return conn


def _ok_whatsapp(numero, mensaje):
    return {
        "ok": True,
        "provider_message_id": "wamid.test",
        "status_code": 200,
        "response": {"messages": [{"id": "wamid.test"}]},
        "error": None,
    }


def test_publicar_cambia_visible_registra_fecha_y_envio(monkeypatch):
    monkeypatch.setattr(publication_service, "enviar_whatsapp", _ok_whatsapp)
    conn = _conn()
    try:
        result, error = publication_service.publicar_asignado(
            conn.cursor(), {"id": 2, "rol": "entrenador"}, 10, now="2026-08-18 10:00:00"
        )
        conn.commit()
        row = conn.execute(
            "SELECT visible, publicado_en, estado_envio, fecha_envio FROM entrenamientos_asignados WHERE id = 10"
        ).fetchone()
        envio = conn.execute("SELECT estado, provider_message_id FROM entrenamientos_envios WHERE entrenamiento_asignado_id = 10").fetchone()

        assert error is None
        assert result["estado"] == "visible"
        assert row["visible"] == 1
        assert row["publicado_en"] == "2026-08-18 10:00:00"
        assert row["estado_envio"] == "enviado"
        assert row["fecha_envio"] == "2026-08-18 10:00:00"
        assert envio["estado"] == "enviado"
        assert envio["provider_message_id"] == "wamid.test"
    finally:
        conn.close()


def test_error_whatsapp_no_revierte_publicacion(monkeypatch):
    def failed(_numero, _mensaje):
        return {"ok": False, "status_code": 500, "response": {"error": "fail"}, "error": "fail"}

    monkeypatch.setattr(publication_service, "enviar_whatsapp", failed)
    conn = _conn()
    try:
        result, error = publication_service.publicar_asignado(
            conn.cursor(), {"id": 2, "rol": "entrenador"}, 10, now="2026-08-18 10:00:00"
        )
        conn.commit()
        row = conn.execute("SELECT visible, estado_envio FROM entrenamientos_asignados WHERE id = 10").fetchone()
        envio = conn.execute("SELECT estado, error FROM entrenamientos_envios WHERE entrenamiento_asignado_id = 10").fetchone()

        assert error is None
        assert result["envio"]["estado"] == "error"
        assert row["visible"] == 1
        assert row["estado_envio"] == "error"
        assert envio["estado"] == "error"
    finally:
        conn.close()


def test_segundo_intento_no_duplica_envio_enviado(monkeypatch):
    monkeypatch.setattr(publication_service, "enviar_whatsapp", _ok_whatsapp)
    conn = _conn()
    try:
        publication_service.publicar_asignado(conn.cursor(), {"id": 2, "rol": "entrenador"}, 10, now="2026-08-18 10:00:00")
        conn.commit()
        result, error = publication_service.publicar_asignado(
            conn.cursor(), {"id": 2, "rol": "entrenador"}, 10, now="2026-08-18 10:05:00"
        )
        conn.commit()
        total = conn.execute("SELECT COUNT(*) FROM entrenamientos_envios WHERE entrenamiento_asignado_id = 10").fetchone()[0]

        assert error is None
        assert result["envio"]["idempotente"] is True
        assert total == 1
    finally:
        conn.close()


def test_publicacion_de_atleta_ajeno_se_rechaza():
    app = Flask(__name__)
    conn = _conn()
    try:
        with app.app_context():
            result, error = publication_service.publicar_asignado(
                conn.cursor(), {"id": 2, "rol": "entrenador"}, 11, now="2026-08-18 10:00:00"
            )
        assert result is None
        assert error[1] == 403
    finally:
        conn.close()


def test_procesar_programadas_reutiliza_publicacion(monkeypatch):
    monkeypatch.setattr(publication_service, "enviar_whatsapp", _ok_whatsapp)
    conn = _conn()
    try:
        procesadas = publication_service.procesar_programadas_vencidas(
            conn.cursor(), {"id": 2, "rol": "entrenador"}
        )
        conn.commit()
        row = conn.execute("SELECT visible, estado_envio FROM entrenamientos_asignados WHERE id = 12").fetchone()

        assert [item["id"] for item in procesadas] == [12]
        assert row["visible"] == 1
        assert row["estado_envio"] == "enviado"
    finally:
        conn.close()


def test_whatsapp_deshabilitado_no_rompe_publicacion(monkeypatch):
    def disabled(_numero, _mensaje):
        return {"ok": False, "disabled": True, "error": "WhatsApp deshabilitado"}

    monkeypatch.setattr(publication_service, "enviar_whatsapp", disabled)
    conn = _conn()
    try:
        result, error = publication_service.publicar_asignado(
            conn.cursor(), {"id": 2, "rol": "entrenador"}, 10, now="2026-08-18 10:00:00"
        )
        conn.commit()
        row = conn.execute("SELECT visible, estado_envio FROM entrenamientos_asignados WHERE id = 10").fetchone()

        assert error is None
        assert result["envio"]["estado"] == "deshabilitado"
        assert row["visible"] == 1
        assert row["estado_envio"] == "deshabilitado"
    finally:
        conn.close()
