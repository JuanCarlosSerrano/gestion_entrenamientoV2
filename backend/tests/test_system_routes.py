import importlib

import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_ENGINE", "sqlite")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "system.db"))
    import backend.app as app_module

    importlib.reload(app_module)
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


def test_csrf_token_route(client):
    response = client.get("/csrf-token")

    assert response.status_code == 200
    assert response.get_json()["csrf_token"]


def test_index_redirects_to_login(client):
    response = client.get("/")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/static/login.html")
