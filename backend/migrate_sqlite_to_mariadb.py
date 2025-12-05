"""
Copia los datos de backend/atletas.db (SQLite) a la base MariaDB configurada
por variables de entorno (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME).

Uso:
    python migrate_sqlite_to_mariadb.py --sqlite backend/atletas.db

Es seguro reejecutarlo: borra datos previos en MariaDB antes de insertar
(desactiva FK checks durante la carga). Asegúrate de haber creado previamente
el esquema en MariaDB ejecutando `flask initdb`.
"""

import argparse
import os
import sqlite3
from typing import List, Tuple

import mariadb


TABLES_IN_ORDER: List[Tuple[str, List[str]]] = [
    ("usuarios", [
        "id", "nombre", "apellidos", "email", "password_hash", "rol",
        "fecha_nacimiento", "telefono", "entrenador_id", "categoria",
        "grupo", "subgrupo", "aprobado", "foto_url",
    ]),
    ("zonas_entrenamiento", [
        "id", "atleta_id", "vam", "z1", "z2", "z3", "z4", "z5", "z6", "fecha_inicio", "fecha_fin", "fecha_creacion",
    ]),
    ("textos_descriptivos", [
        "id", "contenido", "creado_en",
    ]),
    ("entrenamientos", [
        "id", "nombre", "objetivo", "duracion_valor", "duracion_tipo",
        "calentamiento_tipo", "calentamiento_valor", "bloque_activacion",
        "bloque_principal", "enfriamiento_tipo", "enfriamiento_valor",
        "notas", "km_totales",
    ]),
    ("entrenamientos_detalle", [
        "id", "entrenamiento_id", "parent_id", "orden", "tipo_paso",
        "repeticiones", "objetivo_tipo", "objetivo_valor", "unidad", "zona",
        "recuperacion_valor", "recuperacion_unidad", "intensidad", "descripcion",
    ]),
    ("macrociclos", [
        "id", "nombre", "fecha_inicio", "fecha_fin", "objetivo_general", "created_at",
    ]),
    ("mesociclos", [
        "id", "macrociclo_id", "nombre", "fecha_inicio", "fecha_fin", "objetivo", "created_at",
    ]),
    ("microciclos", [
        "id", "mesociclo_id", "nombre", "objetivo", "created_at",
    ]),
    ("macrociclos_mesociclos", [
        "id", "macrociclo_id", "mesociclo_id", "orden", "notas", "created_at",
    ]),
    ("mesociclos_microciclos", [
        "id", "mesociclo_id", "microciclo_id", "orden", "notas", "created_at",
    ]),
    ("microciclos_entrenamientos", [
        "id", "microciclo_id", "dia_relativo", "sesion_indice", "entrenamiento_id",
        "notas", "orden", "created_at",
    ]),
    ("entrenamiento_bloques", [
        "id", "entrenamiento_id", "orden", "repeticiones", "distancia_m",
        "recuperacion", "zona", "observacion",
    ]),
    ("entrenamientos_asignados", [
        "id", "atleta_id", "fecha", "entrenamiento_id", "visible",
        "ciclo_tipo", "ciclo_id", "macrociclo_id", "mesociclo_id", "microciclo_id",
        "nombre", "objetivo", "notas", "created_at", "updated_at", "km_previstos",
    ]),
    ("entrenamientos_asignados_detalle", [
        "id", "entrenamiento_asignado_id", "parent_id", "orden", "tipo_paso",
        "repeticiones", "objetivo_tipo", "objetivo_valor", "unidad", "zona",
        "recuperacion_valor", "recuperacion_unidad", "intensidad", "descripcion",
    ]),
    ("feedbacks", [
        "id", "comentario", "fecha", "entrenamiento_asignado_id", "atleta_id", "leido", "respuesta",
    ]),
    ("km_realizados_entrenamientos", [
        "id", "entrenamiento_asignado_id", "km_planificados", "km_realizados", "fecha",
    ]),
    ("resultados_entrenamientos", [
        "id", "entrenamiento_asignado_id", "paso_detalle_id", "repeticion", "tiempo_real_seg", "fecha",
    ]),
]


def get_sqlite_conn(path: str):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def get_mariadb_conn():
    return mariadb.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "gestion_entrenamiento"),
    )


def fetch_rows(conn_sqlite, table: str, cols: List[str]):
    cur = conn_sqlite.cursor()
    cur.execute(f"SELECT {', '.join(cols)} FROM {table}")
    rows = cur.fetchall()
    cur.close()
    return rows


def truncate_table(cur_maria, table: str):
    cur_maria.execute(f"DELETE FROM {table}")


def insert_rows(cur_maria, table: str, cols: List[str], rows):
    if not rows:
        return
    placeholders = ", ".join(["?"] * len(cols))
    col_list = ", ".join(cols)
    cur_maria.executemany(
        f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})",
        [[row[c] for c in cols] for row in rows],
    )


def migrate(sqlite_path: str):
    conn_sqlite = get_sqlite_conn(sqlite_path)
    conn_maria = get_mariadb_conn()
    conn_maria.autocommit = False
    cur_maria = conn_maria.cursor()

    try:
        cur_maria.execute("SET FOREIGN_KEY_CHECKS=0")

        for table, cols in TABLES_IN_ORDER:
            rows = fetch_rows(conn_sqlite, table, cols)
            truncate_table(cur_maria, table)
            insert_rows(cur_maria, table, cols, rows)
            print(f"[OK] {table}: {len(rows)} filas migradas")

        cur_maria.execute("SET FOREIGN_KEY_CHECKS=1")
        conn_maria.commit()
        print("Migración completada correctamente.")
    except Exception as exc:  # pragma: no cover - script ad-hoc
        conn_maria.rollback()
        print("Error durante la migración:", exc)
        raise
    finally:
        cur_maria.close()
        conn_maria.close()
        conn_sqlite.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrar datos de SQLite a MariaDB")
    parser.add_argument(
        "--sqlite",
        default=os.path.join(os.path.dirname(__file__), "atletas.db"),
        help="Ruta al archivo SQLite de origen (por defecto backend/atletas.db)",
    )
    args = parser.parse_args()

    migrate(args.sqlite)
