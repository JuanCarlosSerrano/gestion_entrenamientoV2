from flask import Flask, jsonify, request, session
from flask import redirect, url_for
from flask_cors import CORS
from flask_session import Session
import sqlite3
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import os
from werkzeug.utils import secure_filename
import secrets
import time

app = Flask(__name__, static_folder='../frontend/static')  # Configuración correcta de static_folder
CORS(app)
app.config["SESSION_PERMANENT"] = False  # Las sesiones expiran cuando se cierra el navegador
app.config["SESSION_TYPE"] = "filesystem"  # Almacena las sesiones en el sistema de archivos (para desarrollo)
app.config["SESSION_FILE_DIR"] = "flask_session"  # Directorio para almacenar archivos de sesión
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "DEV_KEY_CAMBIALA")  # ¡Reemplaza con una clave segura!
app.config["SESSION_COOKIE_NAME"] = "my_session"  # Nombre de la cookie de sesión
app.config["SESSION_COOKIE_HTTPONLY"] = True  # Recomendado por seguridad
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"  # Recomendado por seguridad
app.config["SESSION_COOKIE_SECURE"] = True  # 1 hora de duración de la sesión
Session(app)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, 'atletas.db')


def configure_database(max_retries=5, delay=1.0):
    for intento in range(max_retries):
        try:
            conn = sqlite3.connect(DATABASE, timeout=15, check_same_thread=False)
            conn.execute('PRAGMA journal_mode = WAL')
            conn.execute('PRAGMA foreign_keys = ON')
            conn.close()
            return
        except sqlite3.OperationalError:
            if intento == max_retries - 1:
                print("Aviso: no se pudo establecer WAL. Continúo con modo por defecto.")
                return
            time.sleep(delay)


configure_database()


def get_db():
    conn = sqlite3.connect(DATABASE, timeout=15, check_same_thread=False)
    conn.execute('PRAGMA busy_timeout = 15000')
    conn.execute('PRAGMA foreign_keys = ON')
    conn.row_factory = sqlite3.Row
    return conn


def query_db(query, args=(), one=False):
    conn = get_db()
    cur = conn.execute(query, args)
    rv = cur.fetchall()
    cur.close()
    conn.close()
    return (rv[0] if rv else None) if one else rv


def execute_db(query, args=()):
    conn = get_db()
    cur = conn.execute(query, args)
    conn.commit()
    cur.close()
    conn.close()


def execute_db_returning_id(query, args=()):
    conn = get_db()
    cur = conn.execute(query, args)
    conn.commit()
    last_id = cur.lastrowid
    cur.close()
    conn.close()
    return last_id


def ensure_feedback_schema():
    if not os.path.exists(DATABASE):
        return
    try:
        conn = sqlite3.connect(DATABASE)
        cursor = conn.execute("PRAGMA table_info(feedbacks)")
        columns = {row[1] for row in cursor.fetchall()}
        alter_queries = []
        if 'enlace' not in columns:
            alter_queries.append("ALTER TABLE feedbacks ADD COLUMN enlace TEXT")
        if 'percepcion' not in columns:
            alter_queries.append("ALTER TABLE feedbacks ADD COLUMN percepcion TEXT")
        if 'tiempo_realizado' not in columns:
            alter_queries.append("ALTER TABLE feedbacks ADD COLUMN tiempo_realizado TEXT")
        if 'resultado' not in columns:
            alter_queries.append("ALTER TABLE feedbacks ADD COLUMN resultado TEXT")
        if 'respuesta' not in columns:
            alter_queries.append("ALTER TABLE feedbacks ADD COLUMN respuesta TEXT")
        for query in alter_queries:
            conn.execute(query)
        conn.commit()
    except sqlite3.OperationalError:
        pass
    finally:
        if 'conn' in locals():
            conn.close()


ensure_feedback_schema()


def trainer_owns_feedback(feedback_id, trainer_id):
    feedback = query_db(
        '''
        SELECT f.id
        FROM feedbacks f
        JOIN usuarios u ON f.atleta_id = u.id
        WHERE f.id = ? AND u.entrenador_id = ?
        ''',
        (feedback_id, trainer_id),
        one=True
    )
    return feedback is not None


def ensure_training_cycle_schema():
    if not os.path.exists(DATABASE):
        return
    script = """
    CREATE TABLE IF NOT EXISTS textos_descriptivos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contenido TEXT NOT NULL,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS macrociclos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entrenador_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        descripcion_id INTEGER,
        objetivo_general TEXT,
        fecha_inicio TEXT NOT NULL,
        fecha_fin TEXT NOT NULL,
        notas TEXT,
        FOREIGN KEY (entrenador_id) REFERENCES usuarios(id),
        FOREIGN KEY (descripcion_id) REFERENCES textos_descriptivos(id)
    );

    CREATE TABLE IF NOT EXISTS mesociclos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        macrociclo_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        descripcion_id INTEGER,
        objetivo TEXT,
        fecha_inicio TEXT NOT NULL,
        fecha_fin TEXT NOT NULL,
        notas TEXT,
        FOREIGN KEY (macrociclo_id) REFERENCES macrociclos(id) ON DELETE CASCADE,
        FOREIGN KEY (descripcion_id) REFERENCES textos_descriptivos(id)
    );

    CREATE TABLE IF NOT EXISTS microciclos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mesociclo_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        descripcion_id INTEGER,
        objetivo TEXT,
        fecha_inicio TEXT NOT NULL,
        fecha_fin TEXT NOT NULL,
        notas TEXT,
        FOREIGN KEY (mesociclo_id) REFERENCES mesociclos(id) ON DELETE CASCADE,
        FOREIGN KEY (descripcion_id) REFERENCES textos_descriptivos(id)
    );

    CREATE TABLE IF NOT EXISTS ciclo_entrenamientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo_ciclo TEXT NOT NULL CHECK (tipo_ciclo IN ('macro','meso','micro')),
        ciclo_id INTEGER NOT NULL,
        entrenamiento_id INTEGER NOT NULL,
        orden INTEGER,
        dia_relativo INTEGER,
        sesion_indice INTEGER DEFAULT 1 CHECK (sesion_indice BETWEEN 1 AND 3),
        notas TEXT,
        FOREIGN KEY (entrenamiento_id) REFERENCES entrenamientos(id)
    );

    CREATE TABLE IF NOT EXISTS ciclo_asignaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo_ciclo TEXT NOT NULL CHECK (tipo_ciclo IN ('macro','meso','micro')),
        ciclo_id INTEGER NOT NULL,
        atleta_id INTEGER NOT NULL,
        fecha_inicio_real TEXT NOT NULL,
        estado TEXT DEFAULT 'planificado',
        notas TEXT,
        FOREIGN KEY (atleta_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS plantillas_entrenamientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        nombre TEXT NOT NULL,
        descripcion_id INTEGER,
        categoria TEXT,
        intensidad TEXT,
        duracion_referencia INTEGER,
        tipo_duracion TEXT,
        FOREIGN KEY (descripcion_id) REFERENCES textos_descriptivos(id)
    );

    CREATE TABLE IF NOT EXISTS plantillas_microciclos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entrenador_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        tipo_semana TEXT,
        descripcion_id INTEGER,
        FOREIGN KEY (entrenador_id) REFERENCES usuarios(id),
        FOREIGN KEY (descripcion_id) REFERENCES textos_descriptivos(id)
    );

    CREATE TABLE IF NOT EXISTS plantillas_microciclo_detalle (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        microciclo_id INTEGER NOT NULL,
        dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
        orden INTEGER NOT NULL DEFAULT 1,
        sesion INTEGER NOT NULL DEFAULT 1 CHECK (sesion BETWEEN 1 AND 3),
        entrenamiento_id INTEGER NOT NULL,
        FOREIGN KEY (microciclo_id) REFERENCES plantillas_microciclos(id) ON DELETE CASCADE,
        FOREIGN KEY (entrenamiento_id) REFERENCES plantillas_entrenamientos(id),
        UNIQUE (microciclo_id, dia_semana, orden, sesion)
    );

    CREATE TABLE IF NOT EXISTS plantillas_mesociclos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entrenador_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        tipo_bloque TEXT,
        descripcion_id INTEGER,
        FOREIGN KEY (entrenador_id) REFERENCES usuarios(id),
        FOREIGN KEY (descripcion_id) REFERENCES textos_descriptivos(id)
    );

    CREATE TABLE IF NOT EXISTS plantillas_mesociclo_microciclos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mesociclo_id INTEGER NOT NULL,
        microciclo_id INTEGER NOT NULL,
        orden_semana INTEGER NOT NULL,
        FOREIGN KEY (mesociclo_id) REFERENCES plantillas_mesociclos(id) ON DELETE CASCADE,
        FOREIGN KEY (microciclo_id) REFERENCES plantillas_microciclos(id),
        UNIQUE (mesociclo_id, orden_semana)
    );

    CREATE TABLE IF NOT EXISTS plantillas_macrociclos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entrenador_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        objetivo_principal TEXT,
        descripcion_id INTEGER,
        duracion_semanas INTEGER,
        FOREIGN KEY (entrenador_id) REFERENCES usuarios(id),
        FOREIGN KEY (descripcion_id) REFERENCES textos_descriptivos(id)
    );

    CREATE TABLE IF NOT EXISTS plantillas_macrociclo_mesociclos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        macrociclo_id INTEGER NOT NULL,
        mesociclo_id INTEGER NOT NULL,
        orden_bloque INTEGER NOT NULL,
        FOREIGN KEY (macrociclo_id) REFERENCES plantillas_macrociclos(id) ON DELETE CASCADE,
        FOREIGN KEY (mesociclo_id) REFERENCES plantillas_mesociclos(id),
        UNIQUE (macrociclo_id, orden_bloque)
    );
    """
    try:
        conn = sqlite3.connect(DATABASE)
        conn.executescript(script)
        # Ajustes para tablas existentes
        pragma_targets = [
            ('ciclo_entrenamientos', [('sesion_indice', "ALTER TABLE ciclo_entrenamientos ADD COLUMN sesion_indice INTEGER DEFAULT 1 CHECK (sesion_indice BETWEEN 1 AND 3)")]),
            ('entrenamientos_asignados', [
                ('ciclo_tipo', "ALTER TABLE entrenamientos_asignados ADD COLUMN ciclo_tipo TEXT"),
                ('ciclo_id', "ALTER TABLE entrenamientos_asignados ADD COLUMN ciclo_id INTEGER"),
                ('macrociclo_id', "ALTER TABLE entrenamientos_asignados ADD COLUMN macrociclo_id INTEGER"),
                ('mesociclo_id', "ALTER TABLE entrenamientos_asignados ADD COLUMN mesociclo_id INTEGER"),
                ('microciclo_id', "ALTER TABLE entrenamientos_asignados ADD COLUMN microciclo_id INTEGER"),
            ]),
            ('entrenamientos', [
                ('descripcion_id', "ALTER TABLE entrenamientos ADD COLUMN descripcion_id INTEGER")
            ]),
            ('macrociclos', [
                ('descripcion_id', "ALTER TABLE macrociclos ADD COLUMN descripcion_id INTEGER")
            ]),
            ('mesociclos', [
                ('descripcion_id', "ALTER TABLE mesociclos ADD COLUMN descripcion_id INTEGER")
            ]),
            ('microciclos', [
                ('descripcion_id', "ALTER TABLE microciclos ADD COLUMN descripcion_id INTEGER")
            ])
        ]

        for table, alterations in pragma_targets:
            cursor = conn.execute(f"PRAGMA table_info({table})")
            columns = {row[1] for row in cursor.fetchall()}
            for column, statement in alterations:
                if column not in columns:
                    conn.execute(statement)

        conn.commit()
    except sqlite3.OperationalError:
        pass
    finally:
        if 'conn' in locals():
            conn.close()


ensure_training_cycle_schema()

CYCLE_TABLES = {
    'macro': 'macrociclos',
    'meso': 'mesociclos',
    'micro': 'microciclos'
}


def get_macrociclo(macrociclo_id, entrenador_id):
    return query_db(
        'SELECT * FROM macrociclos WHERE id = ? AND entrenador_id = ?',
        (macrociclo_id, entrenador_id),
        one=True
    )


def get_mesociclo(mesociclo_id, entrenador_id):
    return query_db(
        '''
        SELECT m.*
        FROM mesociclos m
        JOIN macrociclos ma ON m.macrociclo_id = ma.id
        WHERE m.id = ? AND ma.entrenador_id = ?
        ''',
        (mesociclo_id, entrenador_id),
        one=True
    )


def get_microciclo(microciclo_id, entrenador_id):
    return query_db(
        '''
        SELECT mi.*
        FROM microciclos mi
        JOIN mesociclos me ON mi.mesociclo_id = me.id
        JOIN macrociclos ma ON me.macrociclo_id = ma.id
        WHERE mi.id = ? AND ma.entrenador_id = ?
        ''',
        (microciclo_id, entrenador_id),
        one=True
    )


def get_ciclo(tipo, ciclo_id, entrenador_id):
    if tipo == 'macro':
        return get_macrociclo(ciclo_id, entrenador_id)
    if tipo == 'meso':
        return get_mesociclo(ciclo_id, entrenador_id)
    if tipo == 'micro':
        return get_microciclo(ciclo_id, entrenador_id)
    return None


def entrenamiento_existe(entrenamiento_id):
    return query_db(
        'SELECT id FROM entrenamientos WHERE id = ?',
        (entrenamiento_id,),
        one=True
    ) is not None


def entrenador_asociado(atleta_id, entrenador_id):
    atleta = query_db(
        'SELECT id FROM usuarios WHERE id = ? AND entrenador_id = ? AND rol = "atleta"',
        (atleta_id, entrenador_id),
        one=True
    )
    return atleta is not None


def descripcion_por_id(descripcion_id):
    if not descripcion_id:
        return None
    registro = query_db(
        'SELECT contenido FROM textos_descriptivos WHERE id = ?',
        (descripcion_id,),
        one=True
    )
    return registro['contenido'] if registro else None


def crear_descripcion(contenido):
    texto = (contenido or '').strip()
    if not texto:
        return None
    return execute_db_returning_id(
        'INSERT INTO textos_descriptivos (contenido) VALUES (?)',
        (texto,)
    )


def actualizar_descripcion(descripcion_id, contenido):
    texto = (contenido or '').strip()
    if descripcion_id and texto:
        execute_db('UPDATE textos_descriptivos SET contenido = ? WHERE id = ?', (texto, descripcion_id))
        return descripcion_id
    if descripcion_id and not texto:
        execute_db('DELETE FROM textos_descriptivos WHERE id = ?', (descripcion_id,))
        return None
    if not descripcion_id and texto:
        return crear_descripcion(texto)
    return None


def eliminar_descripcion(descripcion_id):
    if descripcion_id:
        execute_db('DELETE FROM textos_descriptivos WHERE id = ?', (descripcion_id,))


def plantilla_entrenamiento_existe(entrenamiento_id):
    return query_db(
        'SELECT id FROM plantillas_entrenamientos WHERE id = ?',
        (entrenamiento_id,),
        one=True
    ) is not None


def get_plantilla_micro(micro_id, entrenador_id):
    return query_db(
        '''SELECT pm.*, td.contenido AS descripcion
           FROM plantillas_microciclos pm
           LEFT JOIN textos_descriptivos td ON pm.descripcion_id = td.id
           WHERE pm.id = ? AND pm.entrenador_id = ?''',
        (micro_id, entrenador_id),
        one=True
    )


def get_micro_detalles(micro_id):
    detalles = query_db(
        '''SELECT pmd.*, pe.nombre AS entrenamiento_nombre
           FROM plantillas_microciclo_detalle pmd
           JOIN plantillas_entrenamientos pe ON pmd.entrenamiento_id = pe.id
           WHERE pmd.microciclo_id = ?
           ORDER BY pmd.dia_semana, pmd.sesion, pmd.orden''',
        (micro_id,)
    )
    return [dict(d) for d in detalles]


def get_plantilla_meso(meso_id, entrenador_id):
    return query_db(
        '''SELECT pm.*, td.contenido AS descripcion
           FROM plantillas_mesociclos pm
           LEFT JOIN textos_descriptivos td ON pm.descripcion_id = td.id
           WHERE pm.id = ? AND pm.entrenador_id = ?''',
        (meso_id, entrenador_id),
        one=True
    )


def get_plantilla_macro(macro_id, entrenador_id):
    return query_db(
        '''SELECT pm.*, td.contenido AS descripcion
           FROM plantillas_macrociclos pm
           LEFT JOIN textos_descriptivos td ON pm.descripcion_id = td.id
           WHERE pm.id = ? AND pm.entrenador_id = ?''',
        (macro_id, entrenador_id),
        one=True
    )


def micro_pertenece_entrenador(micro_id, entrenador_id):
    return query_db(
        'SELECT id FROM plantillas_microciclos WHERE id = ? AND entrenador_id = ?',
        (micro_id, entrenador_id),
        one=True
    ) is not None


def meso_pertenece_entrenador(meso_id, entrenador_id):
    return query_db(
        'SELECT id FROM plantillas_mesociclos WHERE id = ? AND entrenador_id = ?',
        (meso_id, entrenador_id),
        one=True
    ) is not None


def calcular_duracion_ciclo(ciclo):
    inicio = ciclo.get('fecha_inicio')
    fin = ciclo.get('fecha_fin')
    if not inicio or not fin:
        return 7
    try:
        fecha_inicio = datetime.strptime(inicio, "%Y-%m-%d").date()
        fecha_fin = datetime.strptime(fin, "%Y-%m-%d").date()
        delta = (fecha_fin - fecha_inicio).days + 1
        return delta if delta > 0 else 7
    except ValueError:
        return 7


def calcular_inicio_por_anclaje(tipo, ciclo, fecha, anclar_en):
    if anclar_en != 'fin':
        return fecha
    try:
        fecha_fin_real = datetime.strptime(fecha, "%Y-%m-%d").date()
    except ValueError:
        return fecha
    duracion = calcular_duracion_ciclo(ciclo)
    fecha_inicio = fecha_fin_real - timedelta(days=max(duracion - 1, 0))
    return fecha_inicio.isoformat()


def get_plantilla_entrenamiento(entrenamiento_id):
    registro = query_db(
        '''SELECT pe.*, td.contenido AS descripcion
           FROM plantillas_entrenamientos pe
           LEFT JOIN textos_descriptivos td ON pe.descripcion_id = td.id
           WHERE pe.id = ?''',
        (entrenamiento_id,),
        one=True
    )
    return dict(registro) if registro else None


def duracion_micro_plantilla_dias(micro_id):
    detalle = query_db(
        'SELECT MAX(dia_semana) AS max_dia FROM plantillas_microciclo_detalle WHERE microciclo_id = ?',
        (micro_id,),
        one=True
    )
    max_dia = (detalle['max_dia'] if detalle else None) or 7
    return max(1, min(7, max_dia))


def duracion_meso_plantilla_dias(meso_id):
    micro_refs = query_db(
        '''SELECT microciclo_id
           FROM plantillas_mesociclo_microciclos
           WHERE mesociclo_id = ?
           ORDER BY orden_semana''',
        (meso_id,)
    )
    if not micro_refs:
        return 7
    return sum(duracion_micro_plantilla_dias(ref['microciclo_id']) for ref in micro_refs)


def duracion_macro_plantilla_dias(macro):
    if macro.get('duracion_semanas'):
        return max(1, int(macro['duracion_semanas'])) * 7
    meso_refs = query_db(
        '''SELECT mesociclo_id
           FROM plantillas_macrociclo_mesociclos
           WHERE macrociclo_id = ?
           ORDER BY orden_bloque''',
        (macro['id'],)
    )
    if not meso_refs:
        return 28
    return sum(duracion_meso_plantilla_dias(ref['mesociclo_id']) for ref in meso_refs)


def calcular_inicio_plantilla(tipo, plantilla, fecha, anclar_en):
    if anclar_en != 'fin':
        return fecha
    try:
        fecha_fin_real = datetime.strptime(fecha, "%Y-%m-%d").date()
    except ValueError:
        return fecha
    if tipo == 'micro':
        dias = duracion_micro_plantilla_dias(plantilla['id'])
    elif tipo == 'meso':
        dias = duracion_meso_plantilla_dias(plantilla['id'])
    else:
        dias = duracion_macro_plantilla_dias(plantilla)
    fecha_inicio = fecha_fin_real - timedelta(days=max(dias - 1, 0))
    return fecha_inicio.isoformat()


def expandir_plantilla_micro(micro_id, atleta_id, fecha_inicio_str, ciclo_tipo='tpl_micro'):
    detalles = query_db(
        '''SELECT *
           FROM plantillas_microciclo_detalle
           WHERE microciclo_id = ?
           ORDER BY dia_semana, sesion, orden''',
        (micro_id,)
    )
    if not detalles:
        return
    try:
        fecha_base = datetime.strptime(fecha_inicio_str, "%Y-%m-%d").date()
    except ValueError:
        fecha_base = datetime.today().date()
    for det in detalles:
        entrenamiento = get_plantilla_entrenamiento(det['entrenamiento_id'])
        if not entrenamiento:
            continue
        offset = max((det['dia_semana'] or 1) - 1, 0)
        fecha_evento = fecha_base + timedelta(days=offset)
        insert_entrenamiento_asignado(
            atleta_id=atleta_id,
            fecha=fecha_evento.isoformat(),
            entrenamiento=entrenamiento,
            ciclo_tipo=ciclo_tipo,
            ciclo_id=micro_id
        )


def expandir_plantilla_meso(meso_id, atleta_id, fecha_inicio_str):
    micro_refs = query_db(
        '''SELECT microciclo_id
           FROM plantillas_mesociclo_microciclos
           WHERE mesociclo_id = ?
           ORDER BY orden_semana''',
        (meso_id,)
    )
    if not micro_refs:
        return
    try:
        fecha_actual = datetime.strptime(fecha_inicio_str, "%Y-%m-%d").date()
    except ValueError:
        fecha_actual = datetime.today().date()
    for ref in micro_refs:
        expandir_plantilla_micro(ref['microciclo_id'], atleta_id, fecha_actual.isoformat(), ciclo_tipo='tpl_meso_micro')
        dias = duracion_micro_plantilla_dias(ref['microciclo_id'])
        fecha_actual += timedelta(days=dias)


def expandir_plantilla_macro(macro_id, atleta_id, fecha_inicio_str):
    meso_refs = query_db(
        '''SELECT mesociclo_id
           FROM plantillas_macrociclo_mesociclos
           WHERE macrociclo_id = ?
           ORDER BY orden_bloque''',
        (macro_id,)
    )
    if not meso_refs:
        return
    try:
        fecha_actual = datetime.strptime(fecha_inicio_str, "%Y-%m-%d").date()
    except ValueError:
        fecha_actual = datetime.today().date()
    for ref in meso_refs:
        expandir_plantilla_meso(ref['mesociclo_id'], atleta_id, fecha_actual.isoformat())
        dias = duracion_meso_plantilla_dias(ref['mesociclo_id'])
        fecha_actual += timedelta(days=dias)


def generar_entrenamientos_para_microciclo(microciclo_id, atleta_id, fecha_inicio_str):
    entrenamientos = query_db(
        '''SELECT ce.*, e.nombre, e.duracion_valor, e.duracion_tipo,
                  e.calentamiento_tipo, e.calentamiento_valor,
                  e.bloque_activacion, e.bloque_principal,
                  e.enfriamiento_tipo, e.enfriamiento_valor,
                  me.id AS mesociclo_fk,
                  ma.id AS macrociclo_fk
           FROM ciclo_entrenamientos ce
           JOIN entrenamientos e ON ce.entrenamiento_id = e.id
           JOIN microciclos mi ON mi.id = ce.ciclo_id
           JOIN mesociclos me ON mi.mesociclo_id = me.id
           JOIN macrociclos ma ON me.macrociclo_id = ma.id
           WHERE ce.tipo_ciclo = 'micro' AND ce.ciclo_id = ?
           ORDER BY COALESCE(ce.dia_relativo, ce.orden, ce.id),
                    COALESCE(ce.sesion_indice, 1),
                    COALESCE(ce.orden, ce.id)''',
        (microciclo_id,)
    )
    if not entrenamientos:
        return

    execute_db(
        '''DELETE FROM entrenamientos_asignados
           WHERE atleta_id = ? AND ciclo_tipo = "micro" AND ciclo_id = ?''',
        (atleta_id, microciclo_id)
    )

    try:
        fecha_inicio = datetime.strptime(fecha_inicio_str, "%Y-%m-%d").date()
    except ValueError:
        fecha_inicio = datetime.today().date()

    for entrada in entrenamientos:
        dias = entrada['dia_relativo'] or entrada['orden'] or 0
        offset = (dias - 1) if dias else 0
        fecha = fecha_inicio + timedelta(days=offset)
        execute_db(
            '''INSERT INTO entrenamientos_asignados (
                   atleta_id, fecha, nombre, duracion_valor, duracion_tipo,
                   calentamiento_tipo, calentamiento_valor, bloque_activacion,
                   bloque_principal, enfriamiento_tipo, enfriamiento_valor,
                   ciclo_tipo, ciclo_id, macrociclo_id, mesociclo_id, microciclo_id
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                atleta_id,
                fecha.isoformat(),
                entrada['nombre'],
                entrada['duracion_valor'],
                entrada['duracion_tipo'],
                entrada['calentamiento_tipo'],
                entrada['calentamiento_valor'],
                entrada['bloque_activacion'],
                entrada['bloque_principal'],
                entrada['enfriamiento_tipo'],
                entrada['enfriamiento_valor'],
                'micro',
                microciclo_id,
                entrada['macrociclo_fk'],
                entrada['mesociclo_fk'],
                microciclo_id
            )
        )


def expandir_ciclo_y_generar_entrenamientos(tipo, ciclo_id, atleta_id, fecha_inicio_str):
    if tipo == 'micro':
        generar_entrenamientos_para_microciclo(ciclo_id, atleta_id, fecha_inicio_str)
        return

    try:
        fecha_inicio = datetime.strptime(fecha_inicio_str, "%Y-%m-%d").date()
    except ValueError:
        fecha_inicio = datetime.today().date()

    if tipo == 'meso':
        microciclos = query_db(
            'SELECT * FROM microciclos WHERE mesociclo_id = ? ORDER BY fecha_inicio',
            (ciclo_id,)
        )
        if not microciclos:
            return
        base = datetime.strptime(microciclos[0]['fecha_inicio'], "%Y-%m-%d").date()
        for micro in microciclos:
            micro_inicio = datetime.strptime(micro['fecha_inicio'], "%Y-%m-%d").date()
            delta = micro_inicio - base
            fecha_micro = (fecha_inicio + delta).isoformat()
            generar_entrenamientos_para_microciclo(micro['id'], atleta_id, fecha_micro)
        return

    if tipo == 'macro':
        mesociclos = query_db(
            'SELECT * FROM mesociclos WHERE macrociclo_id = ? ORDER BY fecha_inicio',
            (ciclo_id,)
        )
        if not mesociclos:
            return
        base_macro = datetime.strptime(mesociclos[0]['fecha_inicio'], "%Y-%m-%d").date()
        for meso in mesociclos:
            microciclos = query_db(
                'SELECT * FROM microciclos WHERE mesociclo_id = ? ORDER BY fecha_inicio',
                (meso['id'],)
            )
            if not microciclos:
                continue
            base_meso = datetime.strptime(microciclos[0]['fecha_inicio'], "%Y-%m-%d").date()
            meso_inicio = datetime.strptime(meso['fecha_inicio'], "%Y-%m-%d").date()
            delta_meso = meso_inicio - base_macro
            for micro in microciclos:
                micro_inicio = datetime.strptime(micro['fecha_inicio'], "%Y-%m-%d").date()
                delta_micro = micro_inicio - base_meso
                fecha_micro = (fecha_inicio + delta_meso + delta_micro).isoformat()
                generar_entrenamientos_para_microciclo(micro['id'], atleta_id, fecha_micro)


# Función para verificar el rol del usuario (decorator)
def requires_roles(*roles):
    def wrapper(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if "user_id" not in session:
                print("requires_roles: sin user_id en sesión")
                return jsonify({'error': 'Autenticación requerida'}), 401

            user = query_db(
                'SELECT id, rol, email FROM usuarios WHERE id = ?',
                (session["user_id"],), one=True
            )

            if not user:
                print("requires_roles: usuario no encontrado en BD")
                return jsonify({'error': 'Usuario no encontrado'}), 403

            if user['rol'] not in roles:
                print(f"requires_roles: rol {user['rol']} no permitido para esta ruta")
                return jsonify({'error': 'Acceso no autorizado'}), 403

            print(f"requires_roles: OK user_id={user['id']} rol={user['rol']} en {request.path}")
            return f(user, *args, **kwargs)

        return decorated_function
    return wrapper


# --------------------------
# Rutas para planificación
# --------------------------


def row_to_dict(row):
    return dict(row) if row else None


@app.route('/plantillas/entrenamientos', methods=['GET', 'POST'])
@requires_roles('entrenador')
def plantillas_entrenamientos(current_user):
    if request.method == 'GET':
        registros = query_db(
            '''SELECT pe.*, td.contenido AS descripcion
               FROM plantillas_entrenamientos pe
               LEFT JOIN textos_descriptivos td ON pe.descripcion_id = td.id
               ORDER BY pe.nombre'''
        )
        return jsonify([dict(r) for r in registros]), 200

    data = request.get_json() or {}
    nombre = (data.get('nombre') or '').strip()
    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400

    descripcion_id = crear_descripcion(data.get('descripcion'))
    new_id = execute_db_returning_id(
        '''INSERT INTO plantillas_entrenamientos
           (codigo, nombre, descripcion_id, categoria, intensidad, duracion_referencia, tipo_duracion)
           VALUES (?, ?, ?, ?, ?, ?, ?)''',
        (
            data.get('codigo'),
            nombre,
            descripcion_id,
            data.get('categoria'),
            data.get('intensidad'),
            data.get('duracion_referencia'),
            data.get('tipo_duracion')
        )
    )
    return jsonify({'id': new_id}), 201


@app.route('/plantillas/entrenamientos/<int:entrenamiento_id>', methods=['GET', 'PUT', 'DELETE'])
@requires_roles('entrenador')
def plantilla_entrenamiento_detalle(current_user, entrenamiento_id):
    registro = query_db(
        '''SELECT pe.*, td.contenido AS descripcion
           FROM plantillas_entrenamientos pe
           LEFT JOIN textos_descriptivos td ON pe.descripcion_id = td.id
           WHERE pe.id = ?''',
        (entrenamiento_id,),
        one=True
    )
    if not registro:
        return jsonify({'error': 'Entrenamiento no encontrado'}), 404

    if request.method == 'GET':
        return jsonify(dict(registro)), 200

    if request.method == 'PUT':
        data = request.get_json() or {}
        descripcion_id = actualizar_descripcion(registro['descripcion_id'], data.get('descripcion'))
        execute_db(
            '''UPDATE plantillas_entrenamientos
               SET codigo = ?, nombre = ?, descripcion_id = ?, categoria = ?, intensidad = ?,
                   duracion_referencia = ?, tipo_duracion = ?
               WHERE id = ?''',
            (
                data.get('codigo', registro['codigo']),
                data.get('nombre', registro['nombre']),
                descripcion_id,
                data.get('categoria', registro['categoria']),
                data.get('intensidad', registro['intensidad']),
                data.get('duracion_referencia', registro['duracion_referencia']),
                data.get('tipo_duracion', registro['tipo_duracion']),
                entrenamiento_id
            )
        )
        return jsonify({'message': 'Entrenamiento actualizado'}), 200

    eliminar_descripcion(registro['descripcion_id'])
    try:
        execute_db('DELETE FROM plantillas_entrenamientos WHERE id = ?', (entrenamiento_id,))
    except sqlite3.IntegrityError:
        return jsonify({'error': 'No se puede eliminar: está asociado a un microciclo'}), 400
    return jsonify({'message': 'Entrenamiento eliminado'}), 200


@app.route('/plantillas/microciclos', methods=['GET', 'POST'])
@requires_roles('entrenador')
def plantillas_microciclos(current_user):
    entrenador_id = current_user['id']
    if request.method == 'GET':
        micros = query_db(
            '''SELECT pm.*, td.contenido AS descripcion
               FROM plantillas_microciclos pm
               LEFT JOIN textos_descriptivos td ON pm.descripcion_id = td.id
               WHERE pm.entrenador_id = ?
               ORDER BY pm.id DESC''',
            (entrenador_id,)
        )
        resultado = []
        for micro in micros:
            registro = dict(micro)
            registro['detalles'] = get_micro_detalles(micro['id'])
            resultado.append(registro)
        return jsonify(resultado), 200

    data = request.get_json() or {}
    nombre = (data.get('nombre') or '').strip()
    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400

    descripcion_id = crear_descripcion(data.get('descripcion'))
    new_id = execute_db_returning_id(
        '''INSERT INTO plantillas_microciclos (entrenador_id, nombre, tipo_semana, descripcion_id)
           VALUES (?, ?, ?, ?)''',
        (entrenador_id, nombre, data.get('tipo_semana'), descripcion_id)
    )

    detalles = data.get('detalles') or []
    for detalle in detalles:
        entrenamiento_id = detalle.get('entrenamiento_id')
        try:
            entrenamiento_id = int(entrenamiento_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'Entrenamiento de plantilla inválido'}), 400
        if not plantilla_entrenamiento_existe(entrenamiento_id):
            return jsonify({'error': 'Entrenamiento de plantilla inválido'}), 400
        try:
            dia = int(detalle.get('dia_semana') or detalle.get('dia') or 1)
        except (TypeError, ValueError):
            dia = 1
        dia = min(7, max(1, dia))
        try:
            sesion = int(detalle.get('sesion') or detalle.get('sesion_indice') or 1)
        except (TypeError, ValueError):
            sesion = 1
        sesion = min(3, max(1, sesion))
        try:
            orden = int(detalle.get('orden') or 1)
        except (TypeError, ValueError):
            orden = 1
        execute_db(
            '''INSERT INTO plantillas_microciclo_detalle
               (microciclo_id, dia_semana, orden, sesion, entrenamiento_id)
               VALUES (?, ?, ?, ?, ?)''',
            (new_id, dia, orden, sesion, entrenamiento_id)
        )

    return jsonify({'id': new_id}), 201


@app.route('/plantillas/microciclos/<int:micro_id>', methods=['GET', 'PUT', 'DELETE'])
@requires_roles('entrenador')
def plantilla_microciclo_detalle(current_user, micro_id):
    entrenador_id = current_user['id']
    micro = get_plantilla_micro(micro_id, entrenador_id)
    if not micro:
        return jsonify({'error': 'Microciclo no encontrado'}), 404

    if request.method == 'GET':
        registro = dict(micro)
        registro['detalles'] = get_micro_detalles(micro_id)
        return jsonify(registro), 200

    if request.method == 'PUT':
        data = request.get_json() or {}
        descripcion_id = actualizar_descripcion(micro['descripcion_id'], data.get('descripcion'))
        execute_db(
            '''UPDATE plantillas_microciclos
               SET nombre = ?, tipo_semana = ?, descripcion_id = ?
               WHERE id = ?''',
            (
                data.get('nombre', micro['nombre']),
                data.get('tipo_semana', micro['tipo_semana']),
                descripcion_id,
                micro_id
            )
        )
        if 'detalles' in data:
            execute_db('DELETE FROM plantillas_microciclo_detalle WHERE microciclo_id = ?', (micro_id,))
            detalles = data.get('detalles') or []
            for detalle in detalles:
                entrenamiento_id = detalle.get('entrenamiento_id')
                try:
                    entrenamiento_id = int(entrenamiento_id)
                except (TypeError, ValueError):
                    return jsonify({'error': 'Entrenamiento de plantilla inválido'}), 400
                if not plantilla_entrenamiento_existe(entrenamiento_id):
                    return jsonify({'error': 'Entrenamiento de plantilla inválido'}), 400
                try:
                    dia = int(detalle.get('dia_semana') or detalle.get('dia') or 1)
                except (TypeError, ValueError):
                    dia = 1
                dia = min(7, max(1, dia))
                try:
                    sesion = int(detalle.get('sesion') or detalle.get('sesion_indice') or 1)
                except (TypeError, ValueError):
                    sesion = 1
                sesion = min(3, max(1, sesion))
                try:
                    orden = int(detalle.get('orden') or 1)
                except (TypeError, ValueError):
                    orden = 1
                execute_db(
                    '''INSERT INTO plantillas_microciclo_detalle
                       (microciclo_id, dia_semana, orden, sesion, entrenamiento_id)
                       VALUES (?, ?, ?, ?, ?)''',
                    (micro_id, dia, orden, sesion, entrenamiento_id)
                )
        return jsonify({'message': 'Microciclo actualizado'}), 200

    eliminar_descripcion(micro['descripcion_id'])
    try:
        execute_db('DELETE FROM plantillas_microciclos WHERE id = ?', (micro_id,))
    except sqlite3.IntegrityError:
        return jsonify({'error': 'No se puede eliminar: está siendo usado por un mesociclo'}), 400
    return jsonify({'message': 'Microciclo eliminado'}), 200


def obtener_relacion_mesociclo(meso_id):
    return query_db(
        '''SELECT r.*, pm.nombre AS micro_nombre
           FROM plantillas_mesociclo_microciclos r
           JOIN plantillas_microciclos pm ON r.microciclo_id = pm.id
           WHERE r.mesociclo_id = ?
           ORDER BY r.orden_semana''',
        (meso_id,)
    )


@app.route('/plantillas/mesociclos', methods=['GET', 'POST'])
@requires_roles('entrenador')
def plantillas_mesociclos(current_user):
    entrenador_id = current_user['id']
    if request.method == 'GET':
        registros = query_db(
            '''SELECT pm.*, td.contenido AS descripcion
               FROM plantillas_mesociclos pm
               LEFT JOIN textos_descriptivos td ON pm.descripcion_id = td.id
               WHERE pm.entrenador_id = ?
               ORDER BY pm.id DESC''',
            (entrenador_id,)
        )
        resultado = []
        for registro in registros:
            item = dict(registro)
            item['microciclos'] = [dict(r) for r in obtener_relacion_mesociclo(registro['id'])]
            resultado.append(item)
        return jsonify(resultado), 200

    data = request.get_json() or {}
    nombre = (data.get('nombre') or '').strip()
    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400

    descripcion_id = crear_descripcion(data.get('descripcion'))
    new_id = execute_db_returning_id(
        '''INSERT INTO plantillas_mesociclos (entrenador_id, nombre, tipo_bloque, descripcion_id)
           VALUES (?, ?, ?, ?)''',
        (entrenador_id, nombre, data.get('tipo_bloque'), descripcion_id)
    )

    micro_entries = data.get('microciclos') or []
    normalizados = []
    for item in micro_entries:
        if isinstance(item, dict):
            micro_id = item.get('microciclo_id') or item.get('id')
        else:
            micro_id = item
        try:
            micro_id = int(micro_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'Identificador de microciclo inválido'}), 400
        normalizados.append(micro_id)

    for idx, micro_id in enumerate(normalizados, start=1):
        if not micro_pertenece_entrenador(micro_id, entrenador_id):
            return jsonify({'error': f'Microciclo {micro_id} no pertenece al entrenador'}), 400
        execute_db(
            '''INSERT INTO plantillas_mesociclo_microciclos (mesociclo_id, microciclo_id, orden_semana)
               VALUES (?, ?, ?)''',
            (new_id, micro_id, idx)
        )

    return jsonify({'id': new_id}), 201


@app.route('/plantillas/mesociclos/<int:meso_id>', methods=['GET', 'PUT', 'DELETE'])
@requires_roles('entrenador')
def plantilla_mesociclo_detalle(current_user, meso_id):
    entrenador_id = current_user['id']
    meso = get_plantilla_meso(meso_id, entrenador_id)
    if not meso:
        return jsonify({'error': 'Mesociclo no encontrado'}), 404

    if request.method == 'GET':
        registro = dict(meso)
        registro['microciclos'] = [dict(r) for r in obtener_relacion_mesociclo(meso_id)]
        return jsonify(registro), 200

    if request.method == 'PUT':
        data = request.get_json() or {}
        descripcion_id = actualizar_descripcion(meso['descripcion_id'], data.get('descripcion'))
        execute_db(
            '''UPDATE plantillas_mesociclos
               SET nombre = ?, tipo_bloque = ?, descripcion_id = ?
               WHERE id = ?''',
            (
                data.get('nombre', meso['nombre']),
                data.get('tipo_bloque', meso['tipo_bloque']),
                descripcion_id,
                meso_id
            )
        )
        if 'microciclos' in data:
            execute_db('DELETE FROM plantillas_mesociclo_microciclos WHERE mesociclo_id = ?', (meso_id,))
            micro_entries = data.get('microciclos') or []
            normalizados = []
            for item in micro_entries:
                if isinstance(item, dict):
                    micro_id = item.get('microciclo_id') or item.get('id')
                else:
                    micro_id = item
                try:
                    micro_id = int(micro_id)
                except (TypeError, ValueError):
                    return jsonify({'error': 'Identificador de microciclo inválido'}), 400
                normalizados.append(micro_id)
            for idx, micro_id in enumerate(normalizados, start=1):
                if not micro_pertenece_entrenador(micro_id, entrenador_id):
                    return jsonify({'error': f'Microciclo {micro_id} no pertenece al entrenador'}), 400
                execute_db(
                    '''INSERT INTO plantillas_mesociclo_microciclos (mesociclo_id, microciclo_id, orden_semana)
                       VALUES (?, ?, ?)''',
                    (meso_id, micro_id, idx)
                )
        return jsonify({'message': 'Mesociclo actualizado'}), 200

    eliminar_descripcion(meso['descripcion_id'])
    try:
        execute_db('DELETE FROM plantillas_mesociclos WHERE id = ?', (meso_id,))
    except sqlite3.IntegrityError:
        return jsonify({'error': 'No se puede eliminar: está siendo usado por un macrociclo'}), 400
    return jsonify({'message': 'Mesociclo eliminado'}), 200


def obtener_relacion_macrociclo(macro_id):
    return query_db(
        '''SELECT r.*, pm.nombre AS meso_nombre
           FROM plantillas_macrociclo_mesociclos r
           JOIN plantillas_mesociclos pm ON r.mesociclo_id = pm.id
           WHERE r.macrociclo_id = ?
           ORDER BY r.orden_bloque''',
        (macro_id,)
    )


@app.route('/plantillas/macrociclos', methods=['GET', 'POST'])
@requires_roles('entrenador')
def plantillas_macrociclos(current_user):
    entrenador_id = current_user['id']
    if request.method == 'GET':
        registros = query_db(
            '''SELECT pm.*, td.contenido AS descripcion
               FROM plantillas_macrociclos pm
               LEFT JOIN textos_descriptivos td ON pm.descripcion_id = td.id
               WHERE pm.entrenador_id = ?
               ORDER BY pm.id DESC''',
            (entrenador_id,)
        )
        resultado = []
        for registro in registros:
            item = dict(registro)
            item['mesociclos'] = [dict(r) for r in obtener_relacion_macrociclo(registro['id'])]
            resultado.append(item)
        return jsonify(resultado), 200

    data = request.get_json() or {}
    nombre = (data.get('nombre') or '').strip()
    if not nombre:
        return jsonify({'error': 'El nombre es obligatorio'}), 400

    descripcion_id = crear_descripcion(data.get('descripcion'))
    new_id = execute_db_returning_id(
        '''INSERT INTO plantillas_macrociclos
           (entrenador_id, nombre, objetivo_principal, descripcion_id, duracion_semanas)
           VALUES (?, ?, ?, ?, ?)''',
        (
            entrenador_id,
            nombre,
            data.get('objetivo_principal'),
            descripcion_id,
            data.get('duracion_semanas')
        )
    )

    meso_entries = data.get('mesociclos') or []
    normalizados = []
    for item in meso_entries:
        if isinstance(item, dict):
            meso_id = item.get('mesociclo_id') or item.get('id')
        else:
            meso_id = item
        try:
            meso_id = int(meso_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'Identificador de mesociclo inválido'}), 400
        normalizados.append(meso_id)

    for idx, meso_id in enumerate(normalizados, start=1):
        if not meso_pertenece_entrenador(meso_id, entrenador_id):
            return jsonify({'error': f'Mesociclo {meso_id} no pertenece al entrenador'}), 400
        execute_db(
            '''INSERT INTO plantillas_macrociclo_mesociclos (macrociclo_id, mesociclo_id, orden_bloque)
               VALUES (?, ?, ?)''',
            (new_id, meso_id, idx)
        )

    return jsonify({'id': new_id}), 201


@app.route('/plantillas/macrociclos/<int:macro_id>', methods=['GET', 'PUT', 'DELETE'])
@requires_roles('entrenador')
def plantilla_macrociclo_detalle(current_user, macro_id):
    entrenador_id = current_user['id']
    macro = get_plantilla_macro(macro_id, entrenador_id)
    if not macro:
        return jsonify({'error': 'Macrociclo no encontrado'}), 404

    if request.method == 'GET':
        registro = dict(macro)
        registro['mesociclos'] = [dict(r) for r in obtener_relacion_macrociclo(macro_id)]
        return jsonify(registro), 200

    if request.method == 'PUT':
        data = request.get_json() or {}
        descripcion_id = actualizar_descripcion(macro['descripcion_id'], data.get('descripcion'))
        execute_db(
            '''UPDATE plantillas_macrociclos
               SET nombre = ?, objetivo_principal = ?, descripcion_id = ?, duracion_semanas = ?
               WHERE id = ?''',
            (
                data.get('nombre', macro['nombre']),
                data.get('objetivo_principal', macro['objetivo_principal']),
                descripcion_id,
                data.get('duracion_semanas', macro['duracion_semanas']),
                macro_id
            )
        )
        if 'mesociclos' in data:
            execute_db('DELETE FROM plantillas_macrociclo_mesociclos WHERE macrociclo_id = ?', (macro_id,))
            meso_entries = data.get('mesociclos') or []
            normalizados = []
            for item in meso_entries:
                if isinstance(item, dict):
                    meso_id = item.get('mesociclo_id') or item.get('id')
                else:
                    meso_id = item
                try:
                    meso_id = int(meso_id)
                except (TypeError, ValueError):
                    return jsonify({'error': 'Identificador de mesociclo inválido'}), 400
                normalizados.append(meso_id)
            for idx, meso_id in enumerate(normalizados, start=1):
                if not meso_pertenece_entrenador(meso_id, entrenador_id):
                    return jsonify({'error': f'Mesociclo {meso_id} no pertenece al entrenador'}), 400
                execute_db(
                    '''INSERT INTO plantillas_macrociclo_mesociclos (macrociclo_id, mesociclo_id, orden_bloque)
                       VALUES (?, ?, ?)''',
                    (macro_id, meso_id, idx)
                )
        return jsonify({'message': 'Macrociclo actualizado'}), 200

    eliminar_descripcion(macro['descripcion_id'])
    try:
        execute_db('DELETE FROM plantillas_macrociclos WHERE id = ?', (macro_id,))
    except sqlite3.IntegrityError:
        return jsonify({'error': 'No se puede eliminar: está asignado o tiene dependencias'}), 400
    return jsonify({'message': 'Macrociclo eliminado'}), 200


@app.route('/macrociclos', methods=['GET', 'POST'])
@requires_roles('entrenador')
def gestionar_macrociclos(current_user):
    entrenador_id = current_user['id']
    if request.method == 'GET':
        macros = query_db(
            'SELECT * FROM macrociclos WHERE entrenador_id = ? ORDER BY fecha_inicio',
            (entrenador_id,)
        )
        return jsonify([dict(m) for m in macros]), 200

    data = request.get_json() or {}
    nombre = data.get('nombre')
    fecha_inicio = data.get('fecha_inicio')
    fecha_fin = data.get('fecha_fin')
    objetivo = data.get('objetivo_general')
    notas = data.get('notas')

    if not nombre or not fecha_inicio or not fecha_fin:
        return jsonify({'error': 'Nombre y fechas son obligatorios'}), 400

    new_id = execute_db_returning_id(
        '''INSERT INTO macrociclos (entrenador_id, nombre, objetivo_general, fecha_inicio, fecha_fin, notas)
           VALUES (?, ?, ?, ?, ?, ?)''',
        (entrenador_id, nombre, objetivo, fecha_inicio, fecha_fin, notas)
    )
    return jsonify({'id': new_id, 'message': 'Macrociclo creado'}), 201


@app.route('/macrociclos/<int:macrociclo_id>', methods=['GET', 'PUT', 'DELETE'])
@requires_roles('entrenador')
def macrociclo_detalle(current_user, macrociclo_id):
    entrenador_id = current_user['id']
    macrociclo = get_macrociclo(macrociclo_id, entrenador_id)
    if not macrociclo:
        return jsonify({'error': 'Macrociclo no encontrado'}), 404

    if request.method == 'GET':
        return jsonify(dict(macrociclo)), 200

    if request.method == 'PUT':
        data = request.get_json() or {}
        execute_db(
            '''UPDATE macrociclos
               SET nombre = ?, objetivo_general = ?, fecha_inicio = ?, fecha_fin = ?, notas = ?
               WHERE id = ?''',
            (
                data.get('nombre', macrociclo['nombre']),
                data.get('objetivo_general', macrociclo['objetivo_general']),
                data.get('fecha_inicio', macrociclo['fecha_inicio']),
                data.get('fecha_fin', macrociclo['fecha_fin']),
                data.get('notas', macrociclo['notas']),
                macrociclo_id
            )
        )
        return jsonify({'message': 'Macrociclo actualizado'}), 200

    execute_db('DELETE FROM macrociclos WHERE id = ?', (macrociclo_id,))
    return jsonify({'message': 'Macrociclo eliminado'}), 200


@app.route('/mesociclos', methods=['GET', 'POST'])
@requires_roles('entrenador')
def gestionar_mesociclos(current_user):
    entrenador_id = current_user['id']
    if request.method == 'GET':
        macrociclo_id = request.args.get('macrociclo_id')
        if macrociclo_id:
            if not get_macrociclo(int(macrociclo_id), entrenador_id):
                return jsonify({'error': 'Macrociclo no encontrado'}), 404
            meso = query_db(
                'SELECT * FROM mesociclos WHERE macrociclo_id = ? ORDER BY fecha_inicio',
                (macrociclo_id,)
            )
        else:
            meso = query_db(
                '''SELECT me.* FROM mesociclos me
                   JOIN macrociclos ma ON me.macrociclo_id = ma.id
                   WHERE ma.entrenador_id = ?
                   ORDER BY me.fecha_inicio''',
                (entrenador_id,)
            )
        return jsonify([dict(m) for m in meso]), 200

    data = request.get_json() or {}
    macrociclo_id = data.get('macrociclo_id')
    if not macrociclo_id or not get_macrociclo(macrociclo_id, entrenador_id):
        return jsonify({'error': 'Macrociclo inválido'}), 400

    nombre = data.get('nombre')
    fecha_inicio = data.get('fecha_inicio')
    fecha_fin = data.get('fecha_fin')
    if not nombre or not fecha_inicio or not fecha_fin:
        return jsonify({'error': 'Nombre y fechas son obligatorios'}), 400

    new_id = execute_db_returning_id(
        '''INSERT INTO mesociclos (macrociclo_id, nombre, objetivo, fecha_inicio, fecha_fin, notas)
           VALUES (?, ?, ?, ?, ?, ?)''',
        (macrociclo_id, nombre, data.get('objetivo'), fecha_inicio, fecha_fin, data.get('notas'))
    )
    return jsonify({'id': new_id, 'message': 'Mesociclo creado'}), 201


@app.route('/mesociclos/<int:mesociclo_id>', methods=['GET', 'PUT', 'DELETE'])
@requires_roles('entrenador')
def mesociclo_detalle(current_user, mesociclo_id):
    entrenador_id = current_user['id']
    mesociclo = get_mesociclo(mesociclo_id, entrenador_id)
    if not mesociclo:
        return jsonify({'error': 'Mesociclo no encontrado'}), 404

    if request.method == 'GET':
        return jsonify(dict(mesociclo)), 200

    if request.method == 'PUT':
        data = request.get_json() or {}
        execute_db(
            '''UPDATE mesociclos
               SET nombre = ?, objetivo = ?, fecha_inicio = ?, fecha_fin = ?, notas = ?
               WHERE id = ?''',
            (
                data.get('nombre', mesociclo['nombre']),
                data.get('objetivo', mesociclo['objetivo']),
                data.get('fecha_inicio', mesociclo['fecha_inicio']),
                data.get('fecha_fin', mesociclo['fecha_fin']),
                data.get('notas', mesociclo['notas']),
                mesociclo_id
            )
        )
        return jsonify({'message': 'Mesociclo actualizado'}), 200

    execute_db('DELETE FROM mesociclos WHERE id = ?', (mesociclo_id,))
    return jsonify({'message': 'Mesociclo eliminado'}), 200


@app.route('/microciclos', methods=['GET', 'POST'])
@requires_roles('entrenador')
def gestionar_microciclos(current_user):
    entrenador_id = current_user['id']
    if request.method == 'GET':
        mesociclo_id = request.args.get('mesociclo_id')
        if mesociclo_id:
            if not get_mesociclo(int(mesociclo_id), entrenador_id):
                return jsonify({'error': 'Mesociclo no encontrado'}), 404
            micros = query_db(
                'SELECT * FROM microciclos WHERE mesociclo_id = ? ORDER BY fecha_inicio',
                (mesociclo_id,)
            )
        else:
            micros = query_db(
                '''SELECT mi.* FROM microciclos mi
                   JOIN mesociclos me ON mi.mesociclo_id = me.id
                   JOIN macrociclos ma ON me.macrociclo_id = ma.id
                   WHERE ma.entrenador_id = ?
                   ORDER BY mi.fecha_inicio''',
                (entrenador_id,)
            )
        return jsonify([dict(m) for m in micros]), 200

    data = request.get_json() or {}
    mesociclo_id = data.get('mesociclo_id')
    if not mesociclo_id or not get_mesociclo(mesociclo_id, entrenador_id):
        return jsonify({'error': 'Mesociclo inválido'}), 400

    nombre = data.get('nombre')
    fecha_inicio = data.get('fecha_inicio')
    fecha_fin = data.get('fecha_fin')
    if not nombre or not fecha_inicio or not fecha_fin:
        return jsonify({'error': 'Nombre y fechas son obligatorios'}), 400

    new_id = execute_db_returning_id(
        '''INSERT INTO microciclos (mesociclo_id, nombre, objetivo, fecha_inicio, fecha_fin, notas)
           VALUES (?, ?, ?, ?, ?, ?)''',
        (mesociclo_id, nombre, data.get('objetivo'), fecha_inicio, fecha_fin, data.get('notas'))
    )
    return jsonify({'id': new_id, 'message': 'Microciclo creado'}), 201


@app.route('/microciclos/<int:microciclo_id>', methods=['GET', 'PUT', 'DELETE'])
@requires_roles('entrenador')
def microciclo_detalle(current_user, microciclo_id):
    entrenador_id = current_user['id']
    microciclo = get_microciclo(microciclo_id, entrenador_id)
    if not microciclo:
        return jsonify({'error': 'Microciclo no encontrado'}), 404

    if request.method == 'GET':
        return jsonify(dict(microciclo)), 200

    if request.method == 'PUT':
        data = request.get_json() or {}
        execute_db(
            '''UPDATE microciclos
               SET nombre = ?, objetivo = ?, fecha_inicio = ?, fecha_fin = ?, notas = ?
               WHERE id = ?''',
            (
                data.get('nombre', microciclo['nombre']),
                data.get('objetivo', microciclo['objetivo']),
                data.get('fecha_inicio', microciclo['fecha_inicio']),
                data.get('fecha_fin', microciclo['fecha_fin']),
                data.get('notas', microciclo['notas']),
                microciclo_id
            )
        )
        return jsonify({'message': 'Microciclo actualizado'}), 200

    execute_db('DELETE FROM microciclos WHERE id = ?', (microciclo_id,))
    return jsonify({'message': 'Microciclo eliminado'}), 200


def validar_tipo_ciclo(tipo):
    if tipo not in CYCLE_TABLES:
        return False
    return True


@app.route('/ciclos/<tipo>/<int:ciclo_id>/entrenamientos', methods=['GET', 'POST'])
@requires_roles('entrenador')
def entrenamientos_por_ciclo(current_user, tipo, ciclo_id):
    tipo = tipo.lower()
    if not validar_tipo_ciclo(tipo):
        return jsonify({'error': 'Tipo de ciclo inválido'}), 400
    if not get_ciclo(tipo, ciclo_id, current_user['id']):
        return jsonify({'error': 'Ciclo no encontrado'}), 404

    if request.method == 'GET':
        registros = query_db(
            '''SELECT ce.*, e.nombre AS entrenamiento_nombre
               FROM ciclo_entrenamientos ce
               JOIN entrenamientos e ON ce.entrenamiento_id = e.id
               WHERE ce.tipo_ciclo = ? AND ce.ciclo_id = ?
               ORDER BY COALESCE(ce.dia_relativo, ce.orden, ce.id),
                        COALESCE(ce.sesion_indice, 1),
                        COALESCE(ce.orden, ce.id)''',
            (tipo, ciclo_id)
        )
        return jsonify([dict(r) for r in registros]), 200

    data = request.get_json() or {}
    entrenamiento_id = data.get('entrenamiento_id')
    if not entrenamiento_id or not entrenamiento_existe(entrenamiento_id):
        return jsonify({'error': 'Entrenamiento inválido'}), 400

    sesion_indice = data.get('sesion_indice', 1)
    try:
        sesion_indice = int(sesion_indice)
    except (TypeError, ValueError):
        return jsonify({'error': 'Sesión inválida'}), 400
    if sesion_indice < 1 or sesion_indice > 3:
        return jsonify({'error': 'La sesión debe estar entre 1 y 3'}), 400

    dia_relativo = data.get('dia_relativo')
    if dia_relativo is not None and dia_relativo != '':
        try:
            dia_relativo = int(dia_relativo)
        except (TypeError, ValueError):
            return jsonify({'error': 'Día relativo inválido'}), 400
    else:
        dia_relativo = None

    new_id = execute_db_returning_id(
        '''INSERT INTO ciclo_entrenamientos
           (tipo_ciclo, ciclo_id, entrenamiento_id, orden, dia_relativo, sesion_indice, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?)''',
        (
            tipo,
            ciclo_id,
            entrenamiento_id,
            data.get('orden'),
            dia_relativo,
            sesion_indice,
            data.get('notas')
        )
    )
    return jsonify({'id': new_id, 'message': 'Entrenamiento agregado al ciclo'}), 201


@app.route('/ciclos/<tipo>/<int:ciclo_id>/entrenamientos/<int:registro_id>', methods=['DELETE'])
@requires_roles('entrenador')
def eliminar_entrenamiento_ciclo(current_user, tipo, ciclo_id, registro_id):
    tipo = tipo.lower()
    if not validar_tipo_ciclo(tipo):
        return jsonify({'error': 'Tipo de ciclo inválido'}), 400
    if not get_ciclo(tipo, ciclo_id, current_user['id']):
        return jsonify({'error': 'Ciclo no encontrado'}), 404

    execute_db(
        'DELETE FROM ciclo_entrenamientos WHERE id = ? AND tipo_ciclo = ? AND ciclo_id = ?',
        (registro_id, tipo, ciclo_id)
    )
    return jsonify({'message': 'Entrenamiento eliminado del ciclo'}), 200


@app.route('/ciclos/<tipo>/<int:ciclo_id>/asignaciones', methods=['GET', 'POST'])
@requires_roles('entrenador')
def asignaciones_ciclo(current_user, tipo, ciclo_id):
    tipo = tipo.lower()
    if not validar_tipo_ciclo(tipo):
        return jsonify({'error': 'Tipo de ciclo inválido'}), 400
    ciclo = get_ciclo(tipo, ciclo_id, current_user['id'])
    if not ciclo:
        return jsonify({'error': 'Ciclo no encontrado'}), 404
    ciclo = dict(ciclo)

    if request.method == 'GET':
        asignaciones = query_db(
            '''SELECT ca.*, u.nombre || ' ' || u.apellidos AS atleta
               FROM ciclo_asignaciones ca
               JOIN usuarios u ON ca.atleta_id = u.id
               WHERE ca.tipo_ciclo = ? AND ca.ciclo_id = ?
               ORDER BY ca.fecha_inicio_real''',
            (tipo, ciclo_id)
        )
        return jsonify([dict(a) for a in asignaciones]), 200

    data = request.get_json() or {}
    atletas = data.get('atleta_ids') or []
    if not atletas and data.get('atleta_id'):
        atletas = [data.get('atleta_id')]
    fecha_inicio = data.get('fecha_inicio_real')
    anclar_en = (data.get('anclar_en') or 'inicio').lower()
    if not fecha_inicio:
        return jsonify({'error': 'Debes indicar atletas y fecha de inicio'}), 400
    if anclar_en not in ('inicio', 'fin'):
        anclar_en = 'inicio'
    fecha_inicio_real = calcular_inicio_por_anclaje(tipo, ciclo, fecha_inicio, anclar_en)
    if not atletas or not fecha_inicio:
        return jsonify({'error': 'Debes indicar atletas y fecha de inicio'}), 400

    created = []
    for atleta_id in atletas:
        if not entrenador_asociado(atleta_id, current_user['id']):
            return jsonify({'error': 'Uno de los atletas no pertenece a este entrenador'}), 400
        new_id = execute_db_returning_id(
            '''INSERT INTO ciclo_asignaciones (tipo_ciclo, ciclo_id, atleta_id, fecha_inicio_real, estado, notas)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (
                tipo,
                ciclo_id,
                atleta_id,
                fecha_inicio_real,
                data.get('estado', 'planificado'),
                data.get('notas')
            )
        )
        expandir_ciclo_y_generar_entrenamientos(tipo, ciclo_id, atleta_id, fecha_inicio_real)
        created.append(new_id)
    return jsonify({'ids': created, 'message': 'Ciclo asignado'}), 201


@app.route('/ciclos/<tipo>/<int:ciclo_id>/asignaciones/<int:asignacion_id>', methods=['PUT', 'DELETE'])
@requires_roles('entrenador')
def asignacion_detalle(current_user, tipo, ciclo_id, asignacion_id):
    tipo = tipo.lower()
    if not validar_tipo_ciclo(tipo):
        return jsonify({'error': 'Tipo de ciclo inválido'}), 400
    if not get_ciclo(tipo, ciclo_id, current_user['id']):
        return jsonify({'error': 'Ciclo no encontrado'}), 404

    asignacion = query_db(
        '''SELECT ca.*
           FROM ciclo_asignaciones ca
           WHERE ca.id = ? AND ca.tipo_ciclo = ? AND ca.ciclo_id = ?''',
        (asignacion_id, tipo, ciclo_id),
        one=True
    )
    if not asignacion:
        return jsonify({'error': 'Asignación no encontrada'}), 404

    if request.method == 'DELETE':
        if tipo == 'micro':
            execute_db(
                '''DELETE FROM entrenamientos_asignados
                   WHERE atleta_id = ? AND ciclo_tipo = ? AND ciclo_id = ?''',
                (asignacion['atleta_id'], 'micro', ciclo_id)
            )
        elif tipo == 'meso':
            execute_db(
                '''DELETE FROM entrenamientos_asignados
                   WHERE atleta_id = ? AND mesociclo_id = ?''',
                (asignacion['atleta_id'], ciclo_id)
            )
        elif tipo == 'macro':
            execute_db(
                '''DELETE FROM entrenamientos_asignados
                   WHERE atleta_id = ? AND macrociclo_id = ?''',
                (asignacion['atleta_id'], ciclo_id)
            )
        execute_db('DELETE FROM ciclo_asignaciones WHERE id = ?', (asignacion_id,))
        return jsonify({'message': 'Asignación eliminada'}), 200

    data = request.get_json() or {}
    nueva_fecha = data.get('fecha_inicio_real', asignacion['fecha_inicio_real'])
    nuevo_estado = data.get('estado', asignacion['estado'])
    nuevas_notas = data.get('notas', asignacion['notas'])

    execute_db(
        '''UPDATE ciclo_asignaciones
           SET fecha_inicio_real = ?, estado = ?, notas = ?
           WHERE id = ?''',
        (
            nueva_fecha,
            nuevo_estado,
            nuevas_notas,
            asignacion_id
        )
    )
    expandir_ciclo_y_generar_entrenamientos(tipo, ciclo_id, asignacion['atleta_id'], nueva_fecha)

    return jsonify({'message': 'Asignación actualizada'}), 200


@app.route('/plantillas/ciclos/<tipo>/<int:ciclo_id>/asignaciones', methods=['POST'])
@requires_roles('entrenador')
def asignar_ciclo_plantilla(current_user, tipo, ciclo_id):
    tipo = tipo.lower()
    if tipo not in ('micro', 'meso', 'macro'):
        return jsonify({'error': 'Tipo de ciclo inválido'}), 400

    if tipo == 'micro':
        plantilla = get_plantilla_micro(ciclo_id, current_user['id'])
    elif tipo == 'meso':
        plantilla = get_plantilla_meso(ciclo_id, current_user['id'])
    else:
        plantilla = get_plantilla_macro(ciclo_id, current_user['id'])

    if not plantilla:
        return jsonify({'error': 'Plantilla no encontrada'}), 404

    data = request.get_json() or {}
    atletas = data.get('atleta_ids') or []
    if not atletas and data.get('atleta_id'):
        atletas = [data.get('atleta_id')]
    fecha_ref = data.get('fecha_inicio_real')
    if not atletas or not fecha_ref:
        return jsonify({'error': 'Debes indicar atletas y fecha'}), 400

    anclar_en = (data.get('anclar_en') or 'inicio').lower()
    fecha_inicio = calcular_inicio_plantilla(tipo, plantilla, fecha_ref, anclar_en)

    created = []
    for atleta_id in atletas:
        if not entrenador_asociado(atleta_id, current_user['id']):
            return jsonify({'error': 'Uno de los atletas no pertenece a este entrenador'}), 400

        if tipo == 'micro':
            expandir_plantilla_micro(ciclo_id, atleta_id, fecha_inicio)
        elif tipo == 'meso':
            expandir_plantilla_meso(ciclo_id, atleta_id, fecha_inicio)
        else:
            expandir_plantilla_macro(ciclo_id, atleta_id, fecha_inicio)

        asignacion_id = execute_db_returning_id(
            '''INSERT INTO ciclo_asignaciones (tipo_ciclo, ciclo_id, atleta_id, fecha_inicio_real, estado, notas)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (
                tipo,
                ciclo_id,
                atleta_id,
                fecha_inicio,
                data.get('estado', 'planificado'),
                data.get('notas')
            )
        )
        created.append(asignacion_id)
    return jsonify({'ids': created, 'message': 'Ciclo de plantilla asignado'}), 201


def init_db():
    with app.app_context():
        db = get_db()
        with open('schema.sql', 'r') as f:
            db.cursor().executescript(f.read())
        db.commit()


@app.cli.command('initdb')
def initdb_command():
    """Initializes the database."""
    init_db()
    print('Initialized the database.')


def _insert_descripcion(conn, *partes):
    texto = "\n\n".join([p.strip() for p in partes if p and str(p).strip()])
    if not texto:
        return None
    cursor = conn.execute(
        "INSERT INTO textos_descriptivos (contenido) VALUES (?)",
        (texto,)
    )
    return cursor.lastrowid


def migrate_to_templates():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    try:
        for tabla in (
            'plantillas_entrenamientos',
            'plantillas_microciclos',
            'plantillas_mesociclos',
            'plantillas_macrociclos'
        ):
            count = conn.execute(f"SELECT COUNT(*) FROM {tabla}").fetchone()[0]
            if count:
                print(f"La tabla {tabla} ya contiene datos. Aborta la migración para evitar duplicados.")
                return

        entrenamiento_map = {}
        entrenamientos = conn.execute("SELECT * FROM entrenamientos").fetchall()
        for ent in entrenamientos:
            desc_id = _insert_descripcion(
                conn,
                ent['calentamiento_tipo'] and f"Calentamiento: {ent['calentamiento_tipo']} {ent['calentamiento_valor'] or ''}",
                ent['bloque_activacion'] and f"Bloque de activación:\n{ent['bloque_activacion']}",
                ent['bloque_principal'] and f"Bloque principal:\n{ent['bloque_principal']}",
                ent['enfriamiento_tipo'] and f"Enfriamiento: {ent['enfriamiento_tipo']} {ent['enfriamiento_valor'] or ''}"
            )
            cursor = conn.execute(
                '''INSERT INTO plantillas_entrenamientos
                   (codigo, nombre, descripcion_id, categoria, intensidad, duracion_referencia, tipo_duracion)
                   VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (
                    f"ENT-{ent['id']}",
                    ent['nombre'],
                    desc_id,
                    None,
                    None,
                    ent['duracion_valor'],
                    ent['duracion_tipo']
                )
            )
            entrenamiento_map[ent['id']] = cursor.lastrowid

        micro_map = {}
        micro_rows = conn.execute(
            '''
            SELECT mi.*, me.macrociclo_id, ma.entrenador_id
            FROM microciclos mi
            JOIN mesociclos me ON mi.mesociclo_id = me.id
            JOIN macrociclos ma ON me.macrociclo_id = ma.id
            '''
        ).fetchall()

        for mi in micro_rows:
            desc_id = _insert_descripcion(conn, mi['objetivo'], mi['notas'])
            cursor = conn.execute(
                '''INSERT INTO plantillas_microciclos (entrenador_id, nombre, tipo_semana, descripcion_id)
                   VALUES (?, ?, ?, ?)''',
                (mi['entrenador_id'], mi['nombre'], mi['objetivo'], desc_id)
            )
            new_micro_id = cursor.lastrowid
            micro_map[mi['id']] = new_micro_id

            detalles = conn.execute(
                '''
                SELECT *
                FROM ciclo_entrenamientos
                WHERE tipo_ciclo = 'micro' AND ciclo_id = ?
                ORDER BY COALESCE(dia_relativo, orden, id),
                         COALESCE(sesion_indice, 1),
                         COALESCE(orden, id)
                ''',
                (mi['id'],)
            ).fetchall()

            orden_por_slot = {}
            for det in detalles:
                entrenamiento_id = entrenamiento_map.get(det['entrenamiento_id'])
                if not entrenamiento_id:
                    continue
                dia = det['dia_relativo'] or 1
                if dia < 1:
                    dia = 1
                dia = ((dia - 1) % 7) + 1
                sesion = det['sesion_indice'] or 1
                clave = (dia, sesion)
                orden_por_slot[clave] = orden_por_slot.get(clave, 0) + 1
                orden = orden_por_slot[clave]
                conn.execute(
                    '''INSERT INTO plantillas_microciclo_detalle
                       (microciclo_id, dia_semana, orden, sesion, entrenamiento_id)
                       VALUES (?, ?, ?, ?, ?)''',
                    (new_micro_id, dia, orden, sesion, entrenamiento_id)
                )

        meso_map = {}
        meso_rows = conn.execute(
            '''
            SELECT me.*, ma.entrenador_id
            FROM mesociclos me
            JOIN macrociclos ma ON me.macrociclo_id = ma.id
            '''
        ).fetchall()

        for me in meso_rows:
            desc_id = _insert_descripcion(conn, me['objetivo'], me['notas'])
            cursor = conn.execute(
                '''INSERT INTO plantillas_mesociclos (entrenador_id, nombre, tipo_bloque, descripcion_id)
                   VALUES (?, ?, ?, ?)''',
                (me['entrenador_id'], me['nombre'], me['objetivo'], desc_id)
            )
            new_meso_id = cursor.lastrowid
            meso_map[me['id']] = new_meso_id

            micros_hijos = conn.execute(
                'SELECT id FROM microciclos WHERE mesociclo_id = ? ORDER BY fecha_inicio, id',
                (me['id'],)
            ).fetchall()
            for idx, micro in enumerate(micros_hijos, start=1):
                micro_tpl = micro_map.get(micro['id'])
                if not micro_tpl:
                    continue
                conn.execute(
                    '''INSERT INTO plantillas_mesociclo_microciclos
                       (mesociclo_id, microciclo_id, orden_semana)
                       VALUES (?, ?, ?)''',
                    (new_meso_id, micro_tpl, idx)
                )

        macro_map = {}
        macro_rows = conn.execute('SELECT * FROM macrociclos').fetchall()
        for ma in macro_rows:
            desc_id = _insert_descripcion(conn, ma['objetivo_general'], ma['notas'])
            duracion_semanas = None
            try:
                if ma['fecha_inicio'] and ma['fecha_fin']:
                    inicio = datetime.strptime(ma['fecha_inicio'], "%Y-%m-%d").date()
                    fin = datetime.strptime(ma['fecha_fin'], "%Y-%m-%d").date()
                    dias = (fin - inicio).days
                    duracion_semanas = max(1, dias // 7) if dias > 0 else 1
            except Exception:
                pass
            cursor = conn.execute(
                '''INSERT INTO plantillas_macrociclos
                   (entrenador_id, nombre, objetivo_principal, descripcion_id, duracion_semanas)
                   VALUES (?, ?, ?, ?, ?)''',
                (ma['entrenador_id'], ma['nombre'], ma['objetivo_general'], desc_id, duracion_semanas)
            )
            new_macro_id = cursor.lastrowid
            macro_map[ma['id']] = new_macro_id

            mesociclos_hijos = conn.execute(
                'SELECT id FROM mesociclos WHERE macrociclo_id = ? ORDER BY fecha_inicio, id',
                (ma['id'],)
            ).fetchall()
            for idx, meso in enumerate(mesociclos_hijos, start=1):
                meso_tpl = meso_map.get(meso['id'])
                if not meso_tpl:
                    continue
                conn.execute(
                    '''INSERT INTO plantillas_macrociclo_mesociclos
                       (macrociclo_id, mesociclo_id, orden_bloque)
                       VALUES (?, ?, ?)''',
                    (new_macro_id, meso_tpl, idx)
                )

        conn.commit()
        print(f"Migración completada: {len(entrenamientos)} entrenamientos, {len(micro_rows)} microciclos, "
              f"{len(meso_rows)} mesociclos y {len(macro_rows)} macrociclos trasladados a plantillas.")
    finally:
        conn.close()


@app.cli.command('migrar-plantillas')
def migrar_plantillas_command():
    """Migra los ciclos existentes hacia las tablas de plantillas."""
    migrate_to_templates()


@app.route('/csrf-token', methods=['GET'])
def get_csrf_token():
    if 'csrf_token' not in session:
        session['csrf_token'] = secrets.token_urlsafe(32)
    return jsonify({'csrf_token': session['csrf_token']})


@app.before_request
def csrf_protect():
    # Sólo proteger métodos que modifican datos
    if request.method in ('POST', 'PUT', 'DELETE'):
        # Endpoints EXENTOS (nombres de las funciones Python)
        if request.endpoint in ('login_user', 'register_user'):
            return

        token_session = session.get('csrf_token')
        token_header = request.headers.get('X-CSRF-Token')

        if not token_session or not token_header or token_session != token_header:
            print(f"CSRF bloqueado en {request.path}: sesión={token_session}, header={token_header}")
            return jsonify({'error': 'CSRF token inválido'}), 403

# --- Rutas para Usuarios (Registro e Inicio de Sesión) ---
@app.route('/register', methods=['POST'])
def register_user():
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No se recibieron datos'}), 400

    nombre = data.get('nombre', '').strip()
    apellidos = data.get('apellidos', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password')
    rol = data.get('rol')

    fecha_nacimiento = data.get('fecha_nacimiento')
    telefono = data.get('telefono')
    entrenador_id = data.get('entrenador_id')  # desde select
    categoria = data.get('categoria')

    # Validación básica
    if not nombre or not apellidos or not email or not password or not rol:
        return jsonify({'error': 'Todos los campos son obligatorios'}), 400

    if rol not in ('admin', 'entrenador', 'atleta'):
        return jsonify({'error': 'Rol inválido'}), 400

    # Reglas específicas para atletas
    if rol == 'atleta':
        if not entrenador_id or entrenador_id == "":
            return jsonify({'error': 'Debes seleccionar un entrenador'}), 400
        if not categoria or categoria == "":
            return jsonify({'error': 'Debes seleccionar una categoría'}), 400

        # Convertir a int si viene como string
        try:
            entrenador_id = int(entrenador_id)
        except ValueError:
            return jsonify({'error': 'Entrenador seleccionado no es válido'}), 400
    else:
        # Otros roles no deben llevar estos campos
        fecha_nacimiento = None
        telefono = None
        entrenador_id = None
        categoria = None

    # Comprobar si el email ya existe
    existing_user = query_db(
        'SELECT id FROM usuarios WHERE email = ?',
        (email,),
        one=True
    )
    if existing_user:
        return jsonify({'error': 'El correo electrónico ya está registrado'}), 409

    password_hash = generate_password_hash(password)

    # Lógica de aprobado:
    # - atletas: pendiente (0)
    # - resto: aprobado directamente (1) -> ajusta si quieres validar también
    aprobado = 0 if rol == 'atleta' else 1

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            '''
            INSERT INTO usuarios (
                nombre, apellidos, email, password_hash, rol,
                fecha_nacimiento, telefono, entrenador_id, categoria,
                aprobado
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                nombre,
                apellidos,
                email,
                password_hash,
                rol,
                fecha_nacimiento if rol == 'atleta' else None,
                telefono if rol == 'atleta' else None,
                entrenador_id if rol == 'atleta' else None,
                categoria if rol == 'atleta' else None,
                aprobado
            )
        )

        conn.commit()

        mensaje = 'Usuario registrado correctamente'
        if rol == 'atleta':
            mensaje = ('Registro completado. Tu cuenta de atleta queda pendiente de '
                       'aprobación por tu entrenador.')

        return jsonify({'message': mensaje}), 201

    except sqlite3.IntegrityError as e:
        print("Error de integridad al registrar:", e)
        return jsonify({'error': 'Error al registrar el usuario (integridad de datos)'}), 500

    except Exception as e:
        print("Error general al registrar:", e)
        return jsonify({'error': 'Error interno del servidor al registrar el usuario'}), 500

@app.route('/login', methods=['POST'])
def login_user():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    print(f'Solicitud a /login: {data}')
    print(f'Email: {email}')
    print(f'Password: {password}')

    if not email or not password:
        print('Email o password faltantes')
        return jsonify({'error': 'Correo electrónico y contraseña son obligatorios'}), 400

    user = query_db('SELECT id, rol, email, password_hash FROM usuarios WHERE email = ?', (email,), one=True)
    print(f'Usuario recuperado: {user}')

    if user and check_password_hash(user['password_hash'], password):
        print(f'Inicio de sesión exitoso. Rol: {user["rol"]}')
        session["user_id"] = user["id"]
        session["user_rol"] = user["rol"]
        session["user_email"] = user["email"]

        response = {
            'message': 'Inicio de sesión exitoso',
            'rol': user['rol'],
            'user_id': user['id']
        }

        if user['rol'] == 'atleta':
            # Ya no hay tabla atletas, así que usamos el mismo id
            response['atleta_id'] = user['id']

        return jsonify(response), 200

    print("Credenciales inválidas")
    return jsonify({'error': 'Credenciales inválidas'}), 401


@app.route('/logout', methods=['POST'])
def logout_user():
    session.clear()
    response = jsonify({'message': 'Sesión cerrada'})
    response.set_cookie(app.config.get("SESSION_COOKIE_NAME", "session"), '', expires=0)
    return response, 200

# --- Rutas para Usuarios (Gestión - Solo para Admin) ---

@app.route('/usuarios', methods=['GET'])
@requires_roles('admin')
def get_all_users(current_user):  # Recibimos el usuario actual
    users = query_db('SELECT id, nombre, apellidos, email, rol FROM usuarios')  # No devolvemos password_hash
    return jsonify([dict(user) for user in users])


@app.route('/usuarios/<int:id>', methods=['GET'])
@requires_roles('admin')
def get_user(current_user, id):
    user = query_db('SELECT id, nombre, apellidos, email, rol FROM usuarios WHERE id = ?', (id,), one=True)
    if not user:
        return jsonify({'error': 'Usuario no encontrado'}), 404
    return jsonify(dict(user))


@app.route('/usuarios', methods=['POST'])
@requires_roles('admin')
def create_user(current_user):
    data = request.get_json()
    nombre = data.get('nombre')
    apellidos = data.get('apellidos')
    email = data.get('email')
    password = data.get('password')
    rol = data.get('rol')

    if not nombre or not apellidos or not email or not password or not rol:
        return jsonify({'error': 'Todos los campos son obligatorios'}), 400

    if rol not in ('admin', 'entrenador', 'atleta'):
        return jsonify({'error': 'Rol inválido'}), 400

    existing_user = query_db('SELECT * FROM usuarios WHERE email = ?', (email,), one=True)
    if existing_user:
        return jsonify({'error': 'El correo electrónico ya está registrado'}), 409

    password_hash = generate_password_hash(password)

    try:
        execute_db(
            'INSERT INTO usuarios (nombre, apellidos, email, password_hash, rol) VALUES (?, ?, ?, ?, ?)',
            (nombre, apellidos, email, password_hash, rol)
        )
        return jsonify({'message': 'Usuario creado exitosamente'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Error al crear el usuario'}), 500

@app.route('/atletas/<int:id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def update_atleta(current_user, id):
    data = request.get_json()

    nombre = data.get('nombre')
    apellidos = data.get('apellidos')
    email = data.get('email')
    telefono = data.get('telefono')
    fecha_nacimiento = data.get('fecha_nacimiento')
    categoria = data.get('categoria')
    grupo = data.get('grupo')
    subgrupo = data.get('subgrupo')

    if not nombre or not apellidos or not email:
        return jsonify({'error': 'Nombre, apellidos y email son obligatorios'}), 400

    # Verificar que el atleta existe y es atleta
    atleta = query_db(
        'SELECT * FROM usuarios WHERE id = ? AND rol = "atleta"',
        (id,),
        one=True
    )
    if not atleta:
        return jsonify({'error': 'Atleta no encontrado'}), 404

    # Si es entrenador, sólo puede tocar a sus atletas
    if current_user['rol'] == 'entrenador' and atleta['entrenador_id'] != current_user['id']:
        return jsonify({'error': 'No tienes permiso para editar este atleta'}), 403

    try:
        execute_db(
            '''
            UPDATE usuarios
            SET nombre = ?, apellidos = ?, email = ?, telefono = ?, 
                fecha_nacimiento = ?, categoria = ?, grupo = ?, subgrupo = ?
            WHERE id = ?
            ''',
            (
                nombre,
                apellidos,
                email,
                telefono,
                fecha_nacimiento,
                categoria,
                grupo,
                subgrupo,
                id
            )
        )
        return jsonify({'message': 'Atleta actualizado correctamente'}), 200
    except Exception as e:
        print("Error al actualizar atleta:", e)
        return jsonify({'error': 'Error al actualizar atleta'}), 500


@app.route('/atletas/<int:id>', methods=['DELETE'])
@requires_roles('admin', 'entrenador')
def delete_atleta(current_user, id):
    # Verificar que el atleta existe y es atleta
    atleta = query_db(
        'SELECT * FROM usuarios WHERE id = ? AND rol = "atleta"',
        (id,),
        one=True
    )
    if not atleta:
        return jsonify({'error': 'Atleta no encontrado'}), 404

    # Si es entrenador, sólo puede borrar a sus atletas
    if current_user['rol'] == 'entrenador' and atleta['entrenador_id'] != current_user['id']:
        return jsonify({'error': 'No tienes permiso para eliminar este atleta'}), 403

    try:
        # Opcional: borrar también entrenamientos_asignados, feedbacks, etc. para ese atleta
        execute_db('DELETE FROM entrenamientos_asignados WHERE atleta_id = ?', (id,))
        execute_db('DELETE FROM feedbacks WHERE atleta_id = ?', (id,))

        execute_db('DELETE FROM usuarios WHERE id = ?', (id,))
        return jsonify({'message': 'Atleta eliminado correctamente'}), 200
    except Exception as e:
        print("Error al eliminar atleta:", e)
        return jsonify({'error': 'Error al eliminar atleta'}), 500

@app.route('/usuarios/<int:id>', methods=['PUT'])
@requires_roles('admin')
def update_user(current_user, id):
    data = request.get_json()
    nombre = data.get('nombre')
    apellidos = data.get('apellidos')
    email = data.get('email')
    rol = data.get('rol')

    if not nombre or not apellidos or not email or not rol:
        return jsonify({'error': 'Todos los campos son obligatorios'}), 400

    if rol not in ('admin', 'entrenador', 'atleta'):
        return jsonify({'error': 'Rol inválido'}), 400

    execute_db(
        'UPDATE usuarios SET nombre = ?, apellidos = ?, email = ?, rol = ? WHERE id = ?',
        (nombre, apellidos, email, rol, id)
    )
    return jsonify({'message': 'Usuario actualizado exitosamente'}), 200


@app.route('/usuarios/<int:id>', methods=['DELETE'])
@requires_roles('admin')
def delete_user(current_user, id):
    execute_db('DELETE FROM usuarios WHERE id = ?', (id,))
    return jsonify({'message': 'Usuario eliminado exitosamente'}), 200


# --- Rutas para Atletas ---

@app.route('/atletas', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def get_atletas(current_user):
    if session.get("user_rol") == 'admin':
        atletas = query_db('SELECT * FROM usuarios WHERE rol = "atleta"')
    elif session.get("user_rol") == 'entrenador':
        # Obtener los IDs de los atletas que entrena el entrenador actual
        atletas_ids = [row['id'] for row in
                       query_db('SELECT id FROM usuarios WHERE rol = "atleta" AND entrenador_id = ?', (session.get("user_id"),))]
        if atletas_ids:
            atletas = query_db('SELECT * FROM usuarios WHERE id IN ({})'.format(','.join('?' * len(atletas_ids))),
                            atletas_ids)
        else:
            atletas = []  # No hay atletas, no hay entrenamientos
    else:  # 'atleta'
        atletas = query_db('SELECT * FROM usuarios WHERE id = ?', (session.get("user_id"),))
    return jsonify([dict(atleta) for atleta in atletas])


@app.route('/atletas/<int:id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def get_atleta(current_user, id):
    if session.get("user_rol") == 'admin' or session.get("user_rol") == 'entrenador':
        atleta = query_db('SELECT * FROM usuarios WHERE id = ?', (id,), one=True)
    else:  # 'atleta'
        if session.get("user_id") != id:
            return jsonify({'error': 'Acceso no autorizado'}), 403
        atleta = query_db('SELECT * FROM usuarios WHERE id = ?', (id,), one=True)
    if atleta is None:
        return jsonify({'error': 'Atleta no encontrado'}), 404
    return jsonify(dict(atleta))

@app.route('/perfil_atleta/<int:atleta_id>', methods=['GET'])
@requires_roles('atleta', 'entrenador')
def obtener_perfil_atleta(current_user, atleta_id):
    try:
        query = '''
            SELECT u.nombre, u.apellidos, u.email, u.foto_url, u.telefono,
            u.fecha_nacimiento, u.categoria,u.grupo, u.subgrupo
            FROM usuarios u
            WHERE u.id = ?
        '''
        resultado = query_db(query, (atleta_id,), one=True)
        if resultado:
            return jsonify(dict(resultado)), 200
        else:
            return jsonify({'error': 'Atleta no encontrado'}), 404
    except Exception as e:
        print("Error al obtener perfil del atleta:", e)
        return jsonify({'error': 'No se pudo obtener el perfil'}), 500

@app.route('/actualizar_perfil', methods=['POST'])
@requires_roles('atleta')
def actualizar_perfil(current_user):
    try:
        usuario_id = current_user['id']
        nombre = request.form.get('nombre')
        apellidos = request.form.get('apellidos')
        foto = request.files.get('foto')
        foto_url = None

        if foto:
            # Carpeta de destino
            print("Nombre del archivo recibido:", foto.filename)
            carpeta_destino = os.path.join('..', 'frontend','static', 'img', 'perfiles')
            os.makedirs(carpeta_destino, exist_ok=True)

            # Guardar imagen con nombre único
            extension = os.path.splitext(foto.filename)[1]
            nombre_archivo = f"perfil_{usuario_id}{extension}"
            ruta_archivo = os.path.join(carpeta_destino, secure_filename(nombre_archivo))
            foto.save(ruta_archivo)
            print(f"Imagen guardada en: {ruta_archivo}")


            foto_url = f"/static/img/perfiles/{nombre_archivo}"

            # Actualizar con imagen
            execute_db(
                "UPDATE usuarios SET nombre = ?, apellidos = ?, foto_url = ? WHERE id = ?",
                (nombre, apellidos, foto_url, usuario_id)
            )
        else:
            # Actualizar sin imagen
            execute_db(
                "UPDATE usuarios SET nombre = ?, apellidos = ? WHERE id = ?",
                (nombre, apellidos, usuario_id)
            )

        return jsonify({
            "message": "Perfil actualizado correctamente",
            "foto_url": foto_url
        }), 200

    except Exception as e:
        print("Error al actualizar perfil:", e)
        return jsonify({"error": "No se pudo actualizar el perfil"}), 500

# --- Rutas para Entrenamientos ---

@app.route('/entrenamientos', methods=['POST'])
@requires_roles('admin', 'entrenador')  # Admin y Entrenador pueden crear entrenamientos
def crear_entrenamiento(current_user):
    data = request.get_json()
    nombre = data.get('nombre')
    duracion_valor = data.get('duracion_valor')
    duracion_tipo = data.get('duracion_tipo')
    calentamiento_tipo = data.get('calentamiento_tipo')
    calentamiento_valor = data.get('calentamiento_valor')
    bloque_activacion = data.get('bloque_activacion')
    bloque_principal = data.get('bloque_principal')
    enfriamiento_tipo = data.get('enfriamiento_tipo')
    enfriamiento_valor = data.get('enfriamiento_valor')

    if not nombre or not bloque_principal:
        return jsonify({'error': 'Nombre y bloque_principal son obligatorios'}), 400

    try:
        execute_db(
            'INSERT INTO entrenamientos (nombre, duracion_valor, duracion_tipo, calentamiento_tipo, calentamiento_valor, bloque_activacion, bloque_principal, enfriamiento_tipo, enfriamiento_valor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (nombre, duracion_valor, duracion_tipo, calentamiento_tipo, calentamiento_valor, bloque_activacion,
             bloque_principal, enfriamiento_tipo, enfriamiento_valor)
        )
        return jsonify({'message': 'Entrenamiento creado exitosamente'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Error al crear el entrenamiento'}), 500


@app.route('/entrenamientos', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamientos(current_user):
    entrenamientos = query_db('SELECT * FROM entrenamientos')
    return jsonify([dict(entrenamiento) for entrenamiento in entrenamientos])


@app.route('/entrenamientos/<int:id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamiento(current_user, id):
    entrenamiento = query_db('SELECT * FROM entrenamientos WHERE id = ?', (id,), one=True)
    if entrenamiento is None:
        return jsonify({'error': 'Entrenamiento no encontrado'}), 404
    return jsonify(dict(entrenamiento))


@app.route('/entrenamientos/<int:id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')  # Admin y Entrenador pueden editar
def actualizar_entrenamiento(current_user, id):
    data = request.get_json()
    nombre = data.get('nombre')
    duracion_valor = data.get('duracion_valor')
    duracion_tipo = data.get('duracion_tipo')
    calentamiento_tipo = data.get('calentamiento_tipo')
    calentamiento_valor = data.get('calentamiento_valor')
    bloque_activacion = data.get('bloque_activacion')
    bloque_principal = data.get('bloque_principal')
    enfriamiento_tipo = data.get('enfriamiento_tipo')
    enfriamiento_valor = data.get('enfriamiento_valor')

    if not nombre or not bloque_principal:
        return jsonify({'error': 'Nombre y bloque_principal son obligatorios'}), 400

    try:
        execute_db(
            'UPDATE entrenamientos SET nombre = ?, duracion_valor = ?, duracion_tipo = ?, calentamiento_tipo = ?, calentamiento_valor = ?, bloque_activacion = ?, bloque_principal = ?, enfriamiento_tipo = ?, enfriamiento_valor = ? WHERE id = ?',
            (nombre, duracion_valor, duracion_tipo, calentamiento_tipo, calentamiento_valor, bloque_activacion,
             bloque_principal, enfriamiento_tipo, enfriamiento_valor, id)
        )
        return jsonify({'message': 'Entrenamiento actualizado exitosamente'}), 200
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Error al actualizar el entrenamiento'}), 500


@app.route('/entrenamientos/<int:id>', methods=['DELETE'])
@requires_roles('admin', 'entrenador')  # Admin y Entrenador pueden eliminar
def eliminar_entrenamiento(current_user, id):
    execute_db('DELETE FROM entrenamientos WHERE id = ?', (id,))
    return jsonify({'message': 'Entrenamiento eliminado exitosamente'}), 200

# --- Rutas para Feedback (Ejemplo) ---

@app.route('/calendario/<int:atleta_id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def get_calendario(current_user, atleta_id):
    print(f'Ruta /calendario/{atleta_id} solicitada')  # Depuración

    try:
        # Obtener los entrenamientos asignados desde la nueva tabla
        entrenamientos_asignados = query_db(
            'SELECT * FROM entrenamientos_asignados WHERE atleta_id = ?',
            (atleta_id,)
        )

        # Formatear los datos para FullCalendar
        events = []
        for entrenamiento in entrenamientos_asignados:
            events.append({
                'id': entrenamiento['id'],
                'title': entrenamiento['nombre'],
                'start': entrenamiento['fecha']
            })

        return jsonify(events), 200

    except Exception as e:
        print("Error en /calendario/<atleta_id>:", e)
        return jsonify({'error': 'Error al cargar el calendario'}), 500


from flask import redirect, url_for

@app.route('/entrenamientos_asignados', methods=['POST'])
@requires_roles('admin', 'entrenador')
def asignar_entrenamiento_completo(current_user):
    data = request.get_json()
    required_fields = ['atleta_id', 'fecha', 'nombre', 'bloque_principal']

    if not all(data.get(field) for field in required_fields):
        return jsonify({'error': 'Faltan campos obligatorios'}), 400

    try:
        execute_db('''
            INSERT INTO entrenamientos_asignados (
                atleta_id, fecha, nombre, duracion_valor, duracion_tipo,
                calentamiento_tipo, calentamiento_valor, bloque_activacion,
                bloque_principal, enfriamiento_tipo, enfriamiento_valor
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['atleta_id'], data['fecha'], data['nombre'], data.get('duracion_valor'),
            data.get('duracion_tipo'), data.get('calentamiento_tipo'), data.get('calentamiento_valor'),
            data.get('bloque_activacion'), data['bloque_principal'], data.get('enfriamiento_tipo'),
            data.get('enfriamiento_valor')
        ))
        return jsonify({'message': 'Entrenamiento asignado correctamente'}), 201
    except Exception as e:
        print("Error en asignar_entrenamiento_completo:", e)
        return jsonify({'error': 'Error al asignar entrenamiento'}), 500


@app.route('/entrenamientos_asignados/<int:atleta_id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamientos_asignados(current_user, atleta_id):
    try:
        # Validación de permisos si el rol es atleta
        if session["user_rol"] == "atleta" and session["user_id"] != atleta_id:
            return jsonify({'error': 'Acceso no autorizado'}), 403

        entrenamientos = query_db(
            '''SELECT * FROM entrenamientos_asignados 
               WHERE atleta_id = ? ORDER BY fecha ASC''', 
            (atleta_id,)
        )
        return jsonify([dict(e) for e in entrenamientos]), 200
    except Exception as e:
        print(e)
        return jsonify({'error': 'Error al obtener entrenamientos asignados'}), 500

@app.route('/entrenamientos_asignados/uno/<int:id>', methods=['GET'])
@requires_roles('admin', 'entrenador', 'atleta')
def obtener_entrenamiento_asignado(current_user, id):
    entrenamiento = query_db('SELECT * FROM entrenamientos_asignados WHERE id = ?', (id,), one=True)
    if not entrenamiento:
        return jsonify({'error': 'Entrenamiento no encontrado'}), 404
    return jsonify(dict(entrenamiento)), 200

@app.route('/entrenamientos_asignados/<int:id>', methods=['PUT'])
@requires_roles('admin', 'entrenador')
def editar_entrenamiento_asignado(current_user, id):
    data = request.get_json()
    required_fields = ['nombre', 'bloque_principal', 'fecha']  # atleta_id no se suele cambiar

    if not all(data.get(field) for field in required_fields):
        return jsonify({'error': 'Faltan campos obligatorios'}), 400

    try:
        execute_db('''
            UPDATE entrenamientos_asignados SET
                nombre = ?, duracion_valor = ?, duracion_tipo = ?, 
                calentamiento_tipo = ?, calentamiento_valor = ?, 
                bloque_activacion = ?, bloque_principal = ?, 
                enfriamiento_tipo = ?, enfriamiento_valor = ?, 
                fecha = ?
            WHERE id = ?
        ''', (
            data['nombre'], data.get('duracion_valor'), data.get('duracion_tipo'),
            data.get('calentamiento_tipo'), data.get('calentamiento_valor'),
            data.get('bloque_activacion'), data['bloque_principal'],
            data.get('enfriamiento_tipo'), data.get('enfriamiento_valor'),
            data['fecha'], id
        ))

        return jsonify({'message': 'Entrenamiento actualizado correctamente'}), 200
    except Exception as e:
        print(e)
        return jsonify({'error': 'Error al actualizar entrenamiento asignado'}), 500

@app.route('/entrenamientos_asignados/<int:id>', methods=['DELETE'])
@requires_roles('admin', 'entrenador')
def eliminar_entrenamiento_asignado(current_user, id):
    execute_db('DELETE FROM entrenamientos_asignados WHERE id = ?', (id,))
    return jsonify({'message': 'Entrenamiento asignado eliminado correctamente'}), 200

@app.route('/asignar_grupo_entrenamiento', methods=['POST'])
@requires_roles('admin', 'entrenador')
def asignar_grupo_entrenamiento(current_user):
    data = request.get_json()
    categoria = data.get('categoria')
    fecha = data.get('fecha')

    if not categoria or not fecha:
        return jsonify({'error': 'Categoría y fecha son obligatorios'}), 400

    # Copiar los campos del entrenamiento
    entrenamiento_datos = {
        'nombre': data.get('nombre'),
        'duracion_valor': data.get('duracion_valor'),
        'duracion_tipo': data.get('duracion_tipo'),
        'calentamiento_tipo': data.get('calentamiento_tipo'),
        'calentamiento_valor': data.get('calentamiento_valor'),
        'bloque_activacion': data.get('bloque_activacion'),
        'bloque_principal': data.get('bloque_principal'),
        'enfriamiento_tipo': data.get('enfriamiento_tipo'),
        'enfriamiento_valor': data.get('enfriamiento_valor'),
        'fecha': fecha
    }

    try:
        atletas = query_db('SELECT id FROM usuarios WHERE categoria = ?', (categoria,))
        if not atletas:
            return jsonify({'error': 'No hay atletas en esa categoría'}), 404

        for atleta in atletas:
            execute_db('''
                INSERT INTO entrenamientos_asignados (
                    atleta_id, fecha, nombre, duracion_valor, duracion_tipo,
                    calentamiento_tipo, calentamiento_valor, bloque_activacion,
                    bloque_principal, enfriamiento_tipo, enfriamiento_valor
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                atleta['id'], fecha, entrenamiento_datos['nombre'],
                entrenamiento_datos['duracion_valor'], entrenamiento_datos['duracion_tipo'],
                entrenamiento_datos['calentamiento_tipo'], entrenamiento_datos['calentamiento_valor'],
                entrenamiento_datos['bloque_activacion'], entrenamiento_datos['bloque_principal'],
                entrenamiento_datos['enfriamiento_tipo'], entrenamiento_datos['enfriamiento_valor']
            ))

        return jsonify({'message': 'Entrenamiento asignado correctamente a todos los atletas del grupo'}), 201

    except Exception as e:
        print(e)
        return jsonify({'error': 'Error al asignar entrenamiento al grupo'}), 500

# --- Obtener atletas pendientes de aprobación ---
@app.route('/atletas_pendientes', methods=['GET'])
@requires_roles('entrenador')
def obtener_atletas_pendientes(current_user):
    try:
        atletas = query_db(
            '''SELECT * FROM usuarios 
               WHERE rol = 'atleta' AND entrenador_id = ? AND aprobado = 0''',
            (current_user['id'],)
        )
        return jsonify([dict(a) for a in atletas]), 200
    except Exception as e:
        print("Error al obtener atletas pendientes:", e)
        return jsonify({'error': 'Error al obtener atletas pendientes'}), 500

# --- Aprobar atleta y asignar grupo/subgrupo ---
@app.route('/atletas/aprobar/<int:atleta_id>', methods=['PUT'])
@requires_roles('entrenador')
def aprobar_atleta(current_user, atleta_id):
    data = request.get_json()
    grupo = data.get('grupo')
    subgrupo = data.get('subgrupo')

    try:
        execute_db(
            '''UPDATE usuarios SET aprobado = 1, grupo = ?, subgrupo = ? 
               WHERE id = ? AND entrenador_id = ? AND rol = 'atleta' ''',
            (grupo, subgrupo, atleta_id, current_user['id'])
        )
        return jsonify({'message': 'Atleta aprobado correctamente'}), 200
    except Exception as e:
        print("Error al aprobar atleta:", e)
        return jsonify({'error': 'Error al aprobar atleta'}), 500
        
@app.route('/atletas_filtrados', methods=['GET'])
@requires_roles('entrenador')
def atletas_filtrados(current_user):
    grupo = request.args.get('grupo')
    subgrupo = request.args.get('subgrupo')
    categoria = request.args.get('categoria')

    query = 'SELECT * FROM usuarios WHERE rol = "atleta" AND aprobado = 1 AND entrenador_id = ?'
    params = [current_user['id']]

    if grupo:
        query += ' AND grupo = ?'
        params.append(grupo)
    if subgrupo:
        query += ' AND subgrupo = ?'
        params.append(subgrupo)
    if categoria:
        query += ' AND categoria = ?'
        params.append(categoria)

    atletas = query_db(query, tuple(params))
    return jsonify([dict(a) for a in atletas]), 200

@app.route('/asignar_entrenamiento_lote', methods=['POST'])
@requires_roles('entrenador')
def asignar_entrenamiento_lote(current_user):
    data = request.get_json()
    fecha = data.get("fecha")
    entrenamiento_id = data.get("entrenamiento_id")
    atletas_ids = data.get("atletas_ids", [])

    if not fecha or not entrenamiento_id or not atletas_ids:
        return jsonify({"error": "Faltan datos requeridos"}), 400

    try:
        # Obtener el entrenamiento tipo a copiar
        entrenamiento_base = query_db(
            "SELECT * FROM entrenamientos WHERE id = ?", (entrenamiento_id,), one=True
        )
        if not entrenamiento_base:
            return jsonify({"error": "Entrenamiento no encontrado"}), 404

        # Insertar para cada atleta
        for atleta_id in atletas_ids:
            execute_db(
                '''
                INSERT INTO entrenamientos_asignados (
                    atleta_id, fecha, nombre, duracion_valor, duracion_tipo,
                    calentamiento_tipo, calentamiento_valor, bloque_activacion,
                    bloque_principal, enfriamiento_tipo, enfriamiento_valor
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    atleta_id,
                    fecha,
                    entrenamiento_base["nombre"],
                    entrenamiento_base["duracion_valor"],
                    entrenamiento_base["duracion_tipo"],
                    entrenamiento_base["calentamiento_tipo"],
                    entrenamiento_base["calentamiento_valor"],
                    entrenamiento_base["bloque_activacion"],
                    entrenamiento_base["bloque_principal"],
                    entrenamiento_base["enfriamiento_tipo"],
                    entrenamiento_base["enfriamiento_valor"],
                ),
            )

        return jsonify({"message": "Entrenamiento asignado correctamente"}), 200

    except Exception as e:
        print("Error al asignar entrenamiento por lote:", e)
        return jsonify({"error": "Error interno al asignar entrenamiento"}), 500

@app.route('/feedback', methods=['POST'])
@requires_roles('atleta')
def enviar_feedback(current_user):
    data = request.get_json()
    entrenamiento_id = data.get("entrenamiento_id")
    comentario = data.get("comentario")
    enlace = data.get("enlace")
    percepcion = data.get("percepcion")
    tiempo_realizado = data.get("tiempo_realizado")
    resultado = data.get("resultado")
    atleta_id = current_user['id']

    if not entrenamiento_id or not comentario:
        return jsonify({"error": "Entrenamiento y comentario requeridos"}), 400

    if not percepcion or not tiempo_realizado:
        return jsonify({"error": "Percepción y tiempo realizado son obligatorios"}), 400

    try:
        execute_db(
            '''INSERT INTO feedbacks (
                   entrenamiento_asignado_id,
                   atleta_id,
                   comentario,
                   enlace,
                   percepcion,
                   tiempo_realizado,
                   resultado
               ) VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (entrenamiento_id, atleta_id, comentario, enlace, percepcion, tiempo_realizado, resultado)
        )
        return jsonify({"message": "Feedback enviado correctamente"}), 200
    except Exception as e:
        print("Error al enviar feedback:", e)
        return jsonify({"error": "No se pudo enviar el feedback"}), 500

@app.route('/feedbacks_pendientes', methods=['GET'])
@requires_roles('entrenador')
def feedbacks_no_leidos(current_user):
    try:
        query = '''
            SELECT f.id, f.comentario, f.enlace, f.percepcion, f.tiempo_realizado, f.resultado,
                   f.fecha, u.nombre || ' ' || u.apellidos AS atleta, ea.fecha AS fecha_entreno, ea.nombre AS entrenamiento_nombre
            FROM feedbacks f
            JOIN usuarios u ON f.atleta_id = u.id
            JOIN entrenamientos_asignados ea ON f.entrenamiento_asignado_id = ea.id
            WHERE f.leido = 0 AND u.entrenador_id = ?
            ORDER BY f.fecha DESC
        '''
        resultados = query_db(query, (current_user["id"],))
        return jsonify([dict(r) for r in resultados]), 200
    except Exception as e:
        print("Error al obtener feedbacks no leídos:", e)
        return jsonify({'error': 'No se pudieron obtener los feedbacks'}), 500

@app.route('/feedbacks/<int:feedback_id>/leer', methods=['PUT'])
@requires_roles('entrenador')
def marcar_feedback_leido(current_user, feedback_id):
    try:
        if not trainer_owns_feedback(feedback_id, current_user['id']):
            return jsonify({'error': 'Feedback no encontrado'}), 404
        data = request.get_json(silent=True) or {}
        nuevo_estado = data.get('leido', 1)  # Por defecto marcar como leído

        execute_db(
            'UPDATE feedbacks SET leido = ? WHERE id = ?',
            (nuevo_estado, feedback_id)
        )
        return jsonify({'message': f'Feedback marcado como {"leído" if nuevo_estado else "no leído"}'}), 200
    except Exception as e:
        print("Error al marcar feedback como leído/no leído:", e)
        return jsonify({'error': 'No se pudo actualizar el estado'}), 500


@app.route('/feedbacks/<int:feedback_id>', methods=['GET'])
@requires_roles('entrenador')
def ver_feedback(current_user, feedback_id):
    try:
        query = '''
            SELECT f.id, f.comentario, f.fecha, f.leido, f.respuesta,
                   f.enlace, f.percepcion, f.tiempo_realizado, f.resultado,
                   u.nombre || ' ' || u.apellidos AS atleta,
                   ea.fecha AS fecha_entreno,
                   ea.nombre AS entrenamiento_nombre
            FROM feedbacks f
            JOIN usuarios u ON f.atleta_id = u.id
            JOIN entrenamientos_asignados ea ON f.entrenamiento_asignado_id = ea.id
            WHERE f.id = ? AND u.entrenador_id = ?
        '''
        resultado = query_db(query, (feedback_id, current_user['id']), one=True)
        if resultado:
            return jsonify(dict(resultado)), 200
        return jsonify({'error': 'Feedback no encontrado'}), 404
    except Exception as e:
        print("Error al obtener el detalle del feedback:", e)
        return jsonify({'error': 'No se pudo obtener el feedback'}), 500
@app.route('/feedbacks', methods=['GET'])
@requires_roles('entrenador')
def obtener_todos_los_feedbacks(current_user):
    try:
        query = '''
            SELECT f.id, f.comentario, f.fecha, f.leido, f.respuesta,
                   f.enlace, f.percepcion, f.tiempo_realizado, f.resultado,
                   u.nombre || ' ' || u.apellidos AS atleta,
                   ea.fecha AS fecha_entreno,
                   ea.nombre AS entrenamiento_nombre
            FROM feedbacks f
            JOIN usuarios u ON f.atleta_id = u.id
            JOIN entrenamientos_asignados ea ON f.entrenamiento_asignado_id = ea.id
            WHERE u.entrenador_id = ?
            ORDER BY f.fecha DESC
        '''
        resultados = query_db(query, (current_user['id'],))
        return jsonify([dict(r) for r in resultados]), 200
    except Exception as e:
        print("Error al obtener todos los feedbacks:", e)
        return jsonify({'error': 'No se pudieron obtener los feedbacks'}), 500

@app.route('/feedbacks/<int:feedback_id>/responder', methods=['POST'])
@requires_roles('entrenador')
def responder_feedback(current_user, feedback_id):
    data = request.get_json()
    respuesta = data.get('respuesta')

    if not respuesta:
        return jsonify({'error': 'Respuesta vacía'}), 400

    try:
        if not trainer_owns_feedback(feedback_id, current_user['id']):
            return jsonify({'error': 'Feedback no encontrado'}), 404
        execute_db(
            'UPDATE feedbacks SET respuesta = ?, leido = 1 WHERE id = ?',
            (respuesta, feedback_id)
        )
        return jsonify({'message': 'Respuesta guardada'}), 200
    except Exception as e:
        print("Error al guardar respuesta:", e)
        return jsonify({'error': 'Error al guardar respuesta'}), 500


@app.route('/mis_feedbacks', methods=['GET'])
@requires_roles('atleta')
def mis_feedbacks(current_user):
    try:
        query = '''
            SELECT f.id, f.comentario, f.fecha, f.leido, f.respuesta,
                   f.enlace, f.percepcion, f.tiempo_realizado, f.resultado,
                   ea.fecha AS fecha_entreno,
                   ea.nombre AS entrenamiento_nombre
            FROM feedbacks f
            JOIN entrenamientos_asignados ea ON f.entrenamiento_asignado_id = ea.id
            WHERE f.atleta_id = ?
            ORDER BY f.fecha DESC
        '''
        resultados = query_db(query, (current_user['id'],))
        return jsonify([dict(r) for r in resultados]), 200
    except Exception as e:
        print("Error al obtener feedbacks del atleta:", e)
        return jsonify({'error': 'No se pudieron obtener los feedbacks'}), 500

# En el backend, podrías añadir una ruta como:
@app.route('/entrenamientos_proximos', methods=['GET'])
@requires_roles('entrenador')
def entrenamientos_proximos(current_user):
    try:
        query = '''
            SELECT 
                MIN(ea.id) as id,
                ea.fecha,
                ea.nombre,
                COUNT(ea.id) as num_atletas
            FROM entrenamientos_asignados ea
            JOIN usuarios u ON ea.atleta_id = u.id
            WHERE u.entrenador_id = ?
              AND DATE(ea.fecha) >= DATE('now')
            GROUP BY ea.fecha, ea.nombre
            ORDER BY ea.fecha ASC
            LIMIT 10
        '''
        resultados = query_db(query, (current_user['id'],))
        return jsonify([dict(r) for r in resultados]), 200
    except Exception as e:
        print("Error al obtener próximos entrenamientos:", e)
        return jsonify({'error': 'No se pudieron obtener los entrenamientos'}), 500

@app.route('/calcular_zonas/<int:atleta_id>', methods=['POST'])
@requires_roles('entrenador')
def calcular_zonas(current_user, atleta_id):
    try:
        data = request.get_json()
        minutos = int(data['minutos'])
        segundos = int(data['segundos'])

        tiempo_horas = (minutos * 60 + segundos) / 3600
        vam = round(2 / tiempo_horas, 2)

        zonas = {
            'z1': round(vam * 0.60, 2),
            'z2': round(vam * 0.70, 2),
            'z3': round(vam * 0.80, 2),
            'z4': round(vam * 0.90, 2),
            'z5': round(vam * 1.00, 2),
            'z6': round(vam * 1.10, 2)
        }

        execute_db('''
            INSERT INTO zonas_entrenamiento (atleta_id, vam, z1, z2, z3, z4, z5, z6)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (atleta_id, vam, zonas['z1'], zonas['z2'], zonas['z3'], zonas['z4'], zonas['z5'], zonas['z6']))

        return jsonify({'vam': vam, 'zonas': zonas}), 200
    except Exception as e:
        print("Error al calcular zonas:", e)
        return jsonify({'error': 'No se pudieron calcular las zonas'}), 500

@app.route('/guardar_zonas', methods=['POST'])
@requires_roles('entrenador')
def guardar_zonas(current_user):
    try:
        data = request.get_json()
        atleta_id = data.get("atleta_id")
        vam = data.get("vam")
        z1 = data.get("z1")
        z2 = data.get("z2")
        z3 = data.get("z3")
        z4 = data.get("z4")
        z5 = data.get("z5")
        z6 = data.get("z6")

        if not all([atleta_id, vam, z1, z2, z3, z4, z5, z6]):
            return jsonify({"error": "Datos incompletos"}), 400

        # Eliminar zonas anteriores si existen
        execute_db("DELETE FROM zonas_entrenamiento WHERE atleta_id = ?", (atleta_id,))

        # Insertar las nuevas zonas
        execute_db('''
            INSERT INTO zonas_entrenamiento (atleta_id, vam, z1, z2, z3, z4, z5, z6)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (atleta_id, vam, z1, z2, z3, z4, z5, z6))

        return jsonify({"message": "Zonas guardadas correctamente"}), 200

    except Exception as e:
        print("Error al guardar zonas:", e)
        return jsonify({"error": "No se pudieron guardar las zonas"}), 500

@app.route('/zonas_atleta/<int:atleta_id>', methods=['GET'])
@requires_roles('entrenador', 'atleta')
def obtener_zonas_atleta(current_user, atleta_id):
    try:
        resultado = query_db(
            '''SELECT vam, z1, z2, z3, z4, z5, z6
               FROM zonas_entrenamiento
               WHERE atleta_id = ?
               ORDER BY fecha_creacion DESC
               LIMIT 1''',
            (atleta_id,),
            one=True
        )
        if resultado:
            return jsonify(dict(resultado)), 200
        else:
            return jsonify({'message': 'No hay zonas guardadas para este atleta'}), 404
    except Exception as e:
        print("Error al obtener zonas:", e)
        return jsonify({'error': 'No se pudieron obtener las zonas'}), 500
@app.route('/entrenadores', methods=['GET'])
def get_entrenadores():
    """
    Devuelve la lista de entrenadores disponibles para el registro de atletas.
    Formato: [{id, nombre_completo}]
    """
    try:
        entrenadores = query_db(
            "SELECT id, nombre, apellidos FROM usuarios WHERE rol = 'entrenador'"
        )
        resultado = [
            {
                'id': e['id'],
                'nombre_completo': f"{e['nombre']} {e['apellidos']}"
            }
            for e in entrenadores
        ]
        return jsonify(resultado), 200
    except Exception as e:
        print("Error obteniendo entrenadores:", e)
        return jsonify({'error': 'No se pudieron cargar los entrenadores'}), 500


@app.route('/')
def index():
    return redirect(url_for('static', filename='login.html'))


def insert_entrenamiento_asignado(atleta_id, fecha, entrenamiento, ciclo_tipo=None, ciclo_id=None,
                                  macrociclo_id=None, mesociclo_id=None, microciclo_id=None):
    execute_db(
        '''INSERT INTO entrenamientos_asignados (
               atleta_id, fecha, nombre, duracion_valor, duracion_tipo,
               calentamiento_tipo, calentamiento_valor, bloque_activacion,
               bloque_principal, enfriamiento_tipo, enfriamiento_valor,
               ciclo_tipo, ciclo_id, macrociclo_id, mesociclo_id, microciclo_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (
            atleta_id,
            fecha,
            entrenamiento['nombre'],
            entrenamiento['duracion_referencia'],
            entrenamiento['tipo_duracion'],
            None,
            None,
            None,
            entrenamiento.get('descripcion'),
            None,
            None,
            ciclo_tipo,
            ciclo_id,
            macrociclo_id,
            mesociclo_id,
            microciclo_id
        )
    )

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
def insert_entrenamiento_asignado(atleta_id, fecha, entrenamiento, ciclo_tipo=None, ciclo_id=None,
                                  macrociclo_id=None, mesociclo_id=None, microciclo_id=None):
    execute_db(
        '''INSERT INTO entrenamientos_asignados (
               atleta_id, fecha, nombre, duracion_valor, duracion_tipo,
               calentamiento_tipo, calentamiento_valor, bloque_activacion,
               bloque_principal, enfriamiento_tipo, enfriamiento_valor,
               ciclo_tipo, ciclo_id, macrociclo_id, mesociclo_id, microciclo_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (
            atleta_id,
            fecha,
            entrenamiento['nombre'],
            entrenamiento['duracion_referencia'],
            entrenamiento['tipo_duracion'],
            None,
            None,
            None,
            entrenamiento.get('descripcion'),
            None,
            None,
            ciclo_tipo,
            ciclo_id,
            macrociclo_id,
            mesociclo_id,
            microciclo_id
        )
    )
