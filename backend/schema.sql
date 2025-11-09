-- Eliminar tablas antiguas si existen
DROP TABLE IF EXISTS plantillas_macrociclo_mesociclos;
DROP TABLE IF EXISTS plantillas_macrociclos;
DROP TABLE IF EXISTS plantillas_mesociclo_microciclos;
DROP TABLE IF EXISTS plantillas_mesociclos;
DROP TABLE IF EXISTS plantillas_microciclo_detalle;
DROP TABLE IF EXISTS plantillas_microciclos;
DROP TABLE IF EXISTS plantillas_entrenamientos;
DROP TABLE IF EXISTS textos_descriptivos;
DROP TABLE IF EXISTS entrenamientos_asignados;
DROP TABLE IF EXISTS entrenamientos;
DROP TABLE IF EXISTS usuarios;

CREATE TABLE IF NOT EXISTS textos_descriptivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contenido TEXT NOT NULL,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL,
    fecha_nacimiento TEXT,         -- Solo atletas
    telefono TEXT,                 -- Solo atletas
    entrenador_id INTEGER,         -- Solo atletas
    categoria TEXT,
    grupo TEXT,
    subgrupo TEXT,
    aprobado INTEGER,                -- Solo atletas
    foto_url TEXT
);

-- Tabla de entrenamientos tipo (plantillas)
CREATE TABLE entrenamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion_id INTEGER,
    duracion_valor INTEGER,
    duracion_tipo TEXT,
    calentamiento_tipo TEXT,
    calentamiento_valor INTEGER,
    bloque_activacion TEXT,
    bloque_principal TEXT,
    enfriamiento_tipo TEXT,
    enfriamiento_valor INTEGER,
    FOREIGN KEY (descripcion_id) REFERENCES textos_descriptivos(id)
);

-- Tabla de entrenamientos asignados a atletas (usuarios con rol='atleta')
CREATE TABLE entrenamientos_asignados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atleta_id INTEGER NOT NULL,            -- Hace referencia a usuarios.id
    fecha TEXT NOT NULL,
    nombre TEXT NOT NULL,
    duracion_valor INTEGER,
    duracion_tipo TEXT,
    calentamiento_tipo TEXT,
    calentamiento_valor INTEGER,
    bloque_activacion TEXT,
    bloque_principal TEXT NOT NULL,
    enfriamiento_tipo TEXT,
    enfriamiento_valor INTEGER,
    ciclo_tipo TEXT,
    ciclo_id INTEGER,
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_asignado_id INTEGER NOT NULL,
    atleta_id INTEGER NOT NULL,
    comentario TEXT NOT NULL,
    enlace TEXT,
    percepcion TEXT,
    tiempo_realizado TEXT,
    resultado TEXT,
    leido INTEGER DEFAULT 0,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    respuesta TEXT,
    FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id),
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id)
);

-- Planificación por ciclos
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
CREATE TABLE zonas_entrenamiento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atleta_id INTEGER NOT NULL,
    vam REAL NOT NULL,
    z1 REAL,
    z2 REAL,
    z3 REAL,
    z4 REAL,
    z5 REAL,
    z6 REAL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id)
);

-- Nuevas plantillas basadas en relaciones entre entrenamientos/micro/meso/macro

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
