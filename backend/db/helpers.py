import sqlite3

try:
    import mariadb  # type: ignore
except ImportError:
    mariadb = None

try:
    import pymysql  # type: ignore
except ImportError:
    pymysql = None


class MariaDBConnectionWrapper:
    """
    Envuelve la conexión de MariaDB para ofrecer cursores en modo diccionario
    y tolerar asignaciones a row_factory que hace el código legado.
    """

    def __init__(self, conn):
        object.__setattr__(self, "_conn", conn)
        object.__setattr__(self, "_row_factory", None)

    def cursor(self):
        return self._conn.cursor(dictionary=True)

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def __setattr__(self, name, value):
        if name in ("_conn", "_row_factory"):
            object.__setattr__(self, name, value)
        elif name == "row_factory":
            object.__setattr__(self, "_row_factory", value)
        else:
            setattr(self._conn, name, value)


class PyMySQLCursorWrapper:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, query, args=None):
        if args is not None:
            query = query.replace('?', '%s')
        return self._cursor.execute(query, args)

    def executemany(self, query, args=None):
        if args is not None:
            query = query.replace('?', '%s')
        return self._cursor.executemany(query, args)

    def __getattr__(self, name):
        return getattr(self._cursor, name)


class PyMySQLConnectionWrapper:
    def __init__(self, conn):
        object.__setattr__(self, '_conn', conn)
        object.__setattr__(self, '_row_factory', None)

    def cursor(self):
        return PyMySQLCursorWrapper(self._conn.cursor())

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def __setattr__(self, name, value):
        if name in ('_conn', '_row_factory'):
            object.__setattr__(self, name, value)
        elif name == 'row_factory':
            object.__setattr__(self, '_row_factory', value)
        else:
            setattr(self._conn, name, value)


def integrity_errors():
    if mariadb:
        return (sqlite3.IntegrityError, mariadb.IntegrityError)
    if pymysql:
        return (sqlite3.IntegrityError, pymysql.IntegrityError)
    return (sqlite3.IntegrityError,)


def open_connection(db_engine, database, mariadb_config):
    """
    Devuelve una conexión según el motor configurado.
    """
    if db_engine == "mariadb":
        if mariadb:
            conn = mariadb.connect(**mariadb_config)
            conn.autocommit = False
            return MariaDBConnectionWrapper(conn)
        if pymysql:
            conn = pymysql.connect(
                host=mariadb_config["host"],
                port=mariadb_config["port"],
                user=mariadb_config["user"],
                password=mariadb_config["password"],
                database=mariadb_config["database"],
                cursorclass=pymysql.cursors.DictCursor,
            )
            conn.autocommit(False)
            return PyMySQLConnectionWrapper(conn)
        raise RuntimeError("DB_ENGINE=mariadb pero no hay driver instalado (mariadb o pymysql)")

    conn = sqlite3.connect(database)
    conn.row_factory = sqlite3.Row
    return conn


def query_db(connection_factory, query, args=(), one=False):
    conn = connection_factory()
    cur = conn.cursor()
    cur.execute(query, args)
    rv = cur.fetchall()
    cur.close()
    conn.close()
    return (rv[0] if rv else None) if one else rv


def execute_db(connection_factory, query, args=()):
    conn = connection_factory()
    cur = conn.cursor()
    cur.execute(query, args)
    conn.commit()
    last_id = cur.lastrowid
    cur.close()
    conn.close()
    return last_id
