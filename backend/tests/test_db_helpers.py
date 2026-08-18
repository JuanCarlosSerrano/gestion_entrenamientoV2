import sqlite3

from backend.db import helpers


def test_open_connection_sqlite_usa_row_factory(tmp_path):
    db_path = tmp_path / "test.db"
    conn = helpers.open_connection("sqlite", str(db_path), {})
    try:
        conn.execute("CREATE TABLE ejemplo (id INTEGER PRIMARY KEY, nombre TEXT)")
        conn.execute("INSERT INTO ejemplo (nombre) VALUES ('MindPace')")
        conn.commit()
        row = conn.execute("SELECT nombre FROM ejemplo").fetchone()

        assert isinstance(row, sqlite3.Row)
        assert row["nombre"] == "MindPace"
    finally:
        conn.close()


def test_query_db_devuelve_lista_y_uno(tmp_path):
    db_path = tmp_path / "test.db"

    def connection_factory():
        return helpers.open_connection("sqlite", str(db_path), {})

    conn = connection_factory()
    conn.execute("CREATE TABLE ejemplo (id INTEGER PRIMARY KEY, nombre TEXT)")
    conn.execute("INSERT INTO ejemplo (nombre) VALUES ('Uno')")
    conn.execute("INSERT INTO ejemplo (nombre) VALUES ('Dos')")
    conn.commit()
    conn.close()

    rows = helpers.query_db(connection_factory, "SELECT nombre FROM ejemplo ORDER BY id")
    one = helpers.query_db(connection_factory, "SELECT nombre FROM ejemplo WHERE id = ?", (2,), one=True)

    assert [row["nombre"] for row in rows] == ["Uno", "Dos"]
    assert one["nombre"] == "Dos"


def test_execute_db_devuelve_lastrowid(tmp_path):
    db_path = tmp_path / "test.db"

    def connection_factory():
        return helpers.open_connection("sqlite", str(db_path), {})

    conn = connection_factory()
    conn.execute("CREATE TABLE ejemplo (id INTEGER PRIMARY KEY, nombre TEXT)")
    conn.commit()
    conn.close()

    inserted_id = helpers.execute_db(connection_factory, "INSERT INTO ejemplo (nombre) VALUES (?)", ("Nuevo",))

    assert inserted_id == 1


def test_pymysql_cursor_wrapper_convierte_placeholders():
    class FakeCursor:
        def __init__(self):
            self.calls = []

        def execute(self, query, args=None):
            self.calls.append(("execute", query, args))
            return 1

        def executemany(self, query, args=None):
            self.calls.append(("executemany", query, args))
            return 2

    fake = FakeCursor()
    cursor = helpers.PyMySQLCursorWrapper(fake)

    assert cursor.execute("SELECT * FROM usuarios WHERE id = ?", (1,)) == 1
    assert cursor.executemany("INSERT INTO t VALUES (?)", [(1,), (2,)]) == 2
    assert fake.calls == [
        ("execute", "SELECT * FROM usuarios WHERE id = %s", (1,)),
        ("executemany", "INSERT INTO t VALUES (%s)", [(1,), (2,)]),
    ]
