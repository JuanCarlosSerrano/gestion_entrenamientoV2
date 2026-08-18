import sqlite3

from backend.security.permissions import (
    entrenador_puede_acceder_atleta,
    obtener_atleta_autorizado,
    obtener_entrenamiento_asignado_autorizado,
    obtener_entrenamiento_plantilla_autorizado,
)


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
            visible INTEGER,
            nombre TEXT
        );
        CREATE TABLE entrenamientos (
            id INTEGER PRIMARY KEY,
            nombre TEXT,
            creador_id INTEGER
        );
        INSERT INTO usuarios (id, nombre, rol, entrenador_id, telefono) VALUES
            (1, 'Admin', 'admin', NULL, NULL),
            (2, 'Coach Uno', 'entrenador', NULL, NULL),
            (3, 'Coach Dos', 'entrenador', NULL, NULL),
            (4, 'Atleta Uno', 'atleta', 2, '+341'),
            (5, 'Atleta Dos', 'atleta', 3, '+342');
        INSERT INTO entrenamientos_asignados (id, atleta_id, visible, nombre) VALUES
            (10, 4, 1, 'Sesion propia'),
            (11, 5, 1, 'Sesion ajena');
        INSERT INTO entrenamientos (id, nombre, creador_id) VALUES
            (20, 'Plantilla propia', 2),
            (21, 'Plantilla ajena', 3),
            (22, 'Plantilla base', NULL);
        """
    )
    return conn


def test_entrenador_propio_puede_acceder_atleta():
    conn = _conn()
    try:
        assert entrenador_puede_acceder_atleta(conn.cursor(), {"id": 2, "rol": "entrenador"}, 4)
    finally:
        conn.close()


def test_entrenador_no_puede_acceder_atleta_ajeno():
    conn = _conn()
    try:
        assert not entrenador_puede_acceder_atleta(conn.cursor(), {"id": 2, "rol": "entrenador"}, 5)
    finally:
        conn.close()


def test_obtener_atleta_autorizado_devuelve_403_para_ajeno():
    conn = _conn()
    try:
        atleta, error = obtener_atleta_autorizado(conn.cursor(), {"id": 2, "rol": "entrenador"}, 5)
        assert atleta is None
        assert error["status"] == 403
    finally:
        conn.close()


def test_admin_mantiene_acceso_a_atleta():
    conn = _conn()
    try:
        atleta, error = obtener_atleta_autorizado(conn.cursor(), {"id": 1, "rol": "admin"}, 5)
        assert error is None
        assert atleta["id"] == 5
    finally:
        conn.close()


def test_entrenador_propio_puede_acceder_asignacion():
    conn = _conn()
    try:
        asignado, error = obtener_entrenamiento_asignado_autorizado(
            conn.cursor(), {"id": 2, "rol": "entrenador"}, 10, escritura=True
        )
        assert error is None
        assert asignado["atleta_id"] == 4
    finally:
        conn.close()


def test_entrenador_no_puede_acceder_asignacion_ajena():
    conn = _conn()
    try:
        asignado, error = obtener_entrenamiento_asignado_autorizado(
            conn.cursor(), {"id": 2, "rol": "entrenador"}, 11, escritura=True
        )
        assert asignado is None
        assert error["status"] == 403
    finally:
        conn.close()


def test_atleta_solo_accede_a_sus_asignaciones():
    conn = _conn()
    try:
        propio, propio_error = obtener_entrenamiento_asignado_autorizado(
            conn.cursor(), {"id": 4, "rol": "atleta"}, 10
        )
        ajeno, ajeno_error = obtener_entrenamiento_asignado_autorizado(
            conn.cursor(), {"id": 4, "rol": "atleta"}, 11
        )
        escritura, escritura_error = obtener_entrenamiento_asignado_autorizado(
            conn.cursor(), {"id": 4, "rol": "atleta"}, 10, escritura=True
        )
        assert propio_error is None
        assert propio["id"] == 10
        assert ajeno is None
        assert ajeno_error["status"] == 403
        assert escritura is None
        assert escritura_error["status"] == 403
    finally:
        conn.close()


def test_entrenador_no_puede_modificar_plantilla_de_otro_entrenador():
    conn = _conn()
    try:
        propia, propia_error = obtener_entrenamiento_plantilla_autorizado(
            conn.cursor(), {"id": 2, "rol": "entrenador"}, 20
        )
        base, base_error = obtener_entrenamiento_plantilla_autorizado(
            conn.cursor(), {"id": 2, "rol": "entrenador"}, 22
        )
        ajena, ajena_error = obtener_entrenamiento_plantilla_autorizado(
            conn.cursor(), {"id": 2, "rol": "entrenador"}, 21
        )
        assert propia_error is None
        assert propia["id"] == 20
        assert base_error is None
        assert base["id"] == 22
        assert ajena is None
        assert ajena_error["status"] == 403
    finally:
        conn.close()
