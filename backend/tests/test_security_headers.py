import importlib

import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_ENGINE", "sqlite")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "headers.db"))
    import backend.app as app_module

    importlib.reload(app_module)
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


EXPECTED_HEADERS = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


def test_respuesta_html_publica_incluye_cabeceras_de_seguridad(client):
    # /static/login.html es pública (sin sesión) y sirve HTML: es el caso
    # que motivó este cambio (curl -I mostraba las cabeceras ausentes).
    response = client.get("/static/login.html")

    assert response.status_code == 200
    for header, value in EXPECTED_HEADERS.items():
        assert response.headers.get(header) == value
    assert "Content-Security-Policy" in response.headers


def test_respuesta_json_incluye_las_mismas_cabeceras(client):
    # Las cabeceras deben aplicarse a toda respuesta, no solo a HTML
    # estático: /csrf-token devuelve JSON y no requiere sesión.
    response = client.get("/csrf-token")

    assert response.status_code == 200
    assert response.content_type.startswith("application/json")
    for header, value in EXPECTED_HEADERS.items():
        assert response.headers.get(header) == value
    assert "Content-Security-Policy" in response.headers


def test_x_content_type_options_es_nosniff(client):
    response = client.get("/csrf-token")
    assert response.headers.get("X-Content-Type-Options") == "nosniff"


def test_x_frame_options_es_deny(client):
    response = client.get("/csrf-token")
    assert response.headers.get("X-Frame-Options") == "DENY"


def test_referrer_policy_correcto(client):
    response = client.get("/csrf-token")
    assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


def test_hsts_correcto(client):
    response = client.get("/csrf-token")
    assert response.headers.get("Strict-Transport-Security") == "max-age=31536000; includeSubDomains"
    # Sin preload: no se ha pedido inclusión en la lista de precarga de
    # los navegadores, que es una decisión que no se puede revertir
    # fácilmente.
    assert "preload" not in response.headers.get("Strict-Transport-Security", "")


def test_csp_presente_y_restringe_framing(client):
    response = client.get("/csrf-token")
    csp = response.headers.get("Content-Security-Policy")

    assert csp
    assert "frame-ancestors 'none'" in csp
    assert "default-src 'self'" in csp
    # No se añaden dominios externos fuera de los que el frontend usa
    # realmente (CDNs de Bootstrap/DataTables/jQuery).
    assert "cdn.jsdelivr.net" in csp
    assert "cdn.datatables.net" in csp
    assert "code.jquery.com" in csp


def test_cors_sigue_funcionando_con_origen_permitido(client):
    # El origen por defecto en desarrollo (sin CORS_ORIGINS en el entorno)
    # incluye http://127.0.0.1:5002; las cabeceras de seguridad no deben
    # interferir con las cabeceras CORS que añade flask-cors.
    response = client.get(
        "/csrf-token",
        headers={"Origin": "http://127.0.0.1:5002"},
    )

    assert response.status_code == 200
    assert response.headers.get("Access-Control-Allow-Origin") == "http://127.0.0.1:5002"
    assert response.headers.get("Content-Security-Policy")


def test_cors_no_agrega_origen_no_permitido(client):
    response = client.get(
        "/csrf-token",
        headers={"Origin": "https://origen-no-permitido.example"},
    )

    assert response.status_code == 200
    assert response.headers.get("Access-Control-Allow-Origin") is None
