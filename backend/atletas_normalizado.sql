----------------------------------------------------------------
-- USUARIOS Y PERFILES
----------------------------------------------------------------
CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellidos TEXT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin','entrenador','atleta')),
    fecha_registro TEXT
);

CREATE TABLE entrenadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER UNIQUE NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE atletas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER UNIQUE NOT NULL,
    entrenador_id INTEGER NOT NULL,
    categoria TEXT,
    grupo TEXT,
    subgrupo TEXT,
    foto_perfil TEXT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (entrenador_id) REFERENCES entrenadores(id)
);

----------------------------------------------------------------
-- ENTRENAMIENTOS (Plantillas)
----------------------------------------------------------------
CREATE TABLE entrenamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    tipo TEXT,       -- rodaje, series, fuerza, técnica...
    duracion INTEGER,
    distancia_objetivo INTEGER,
    ritmo_objetivo TEXT
);

CREATE TABLE entrenamiento_series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_id INTEGER NOT NULL,
    numero_serie INTEGER,
    distancia INTEGER,
    ritmo_objetivo TEXT,
    descanso TEXT,
    FOREIGN KEY (entrenamiento_id) REFERENCES entrenamientos(id)
);

----------------------------------------------------------------
-- ASIGNACIÓN A ATLETAS
----------------------------------------------------------------
CREATE TABLE entrenamientos_asignados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atleta_id INTEGER NOT NULL,
    entrenamiento_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    FOREIGN KEY (atleta_id) REFERENCES atletas(id),
    FOREIGN KEY (entrenamiento_id) REFERENCES entrenamientos(id)
);

CREATE TABLE entrenamientos_asignados_detalle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asignado_id INTEGER NOT NULL,
    numero_serie INTEGER,
    distancia INTEGER,
    ritmo_objetivo TEXT,
    FOREIGN KEY (asignado_id) REFERENCES entrenamientos_asignados(id)
);

----------------------------------------------------------------
-- FEEDBACK
----------------------------------------------------------------
CREATE TABLE feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asignado_id INTEGER NOT NULL,
    atleta_id INTEGER NOT NULL,
    comentario TEXT,
    ritmo_real TEXT,
    sensaciones TEXT,
    leido INTEGER DEFAULT 0,
    respuesta_entrenador TEXT,
    fecha TEXT,
    FOREIGN KEY (asignado_id) REFERENCES entrenamientos_asignados(id),
    FOREIGN KEY (atleta_id) REFERENCES atletas(id)
);

----------------------------------------------------------------
-- ZONAS DE ENTRENAMIENTO / VAM
----------------------------------------------------------------
CREATE TABLE zonas_entrenamiento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atleta_id INTEGER NOT NULL,
    vam REAL,
    zona1 TEXT,
    zona2 TEXT,
    zona3 TEXT,
    zona4 TEXT,
    zona5 TEXT,
    ultimo_update TEXT,
    FOREIGN KEY (atleta_id) REFERENCES atletas(id)
);

----------------------------------------------------------------
-- PLANIFICACIÓN (macrociclos / mesociclos / microciclos)
----------------------------------------------------------------
CREATE TABLE macrociclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenador_id INTEGER,
    nombre TEXT,
    fecha_inicio TEXT,
    fecha_fin TEXT,
    FOREIGN KEY (entrenador_id) REFERENCES entrenadores(id)
);

CREATE TABLE mesociclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    macrociclo_id INTEGER NOT NULL,
    nombre TEXT,
    fecha_inicio TEXT,
    fecha_fin TEXT,
    FOREIGN KEY (macrociclo_id) REFERENCES macrociclos(id)
);

CREATE TABLE microciclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesociclo_id INTEGER NOT NULL,
    nombre TEXT,
    fecha_inicio TEXT,
    fecha_fin TEXT,
    FOREIGN KEY (mesociclo_id) REFERENCES mesociclos(id)
);

CREATE TABLE microciclo_entrenamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    microciclo_id INTEGER NOT NULL,
    entrenamiento_id INTEGER NOT NULL,
    dia_relativo INTEGER,
    FOREIGN KEY (microciclo_id) REFERENCES microciclos(id),
    FOREIGN KEY (entrenamiento_id) REFERENCES entrenamientos(id)
);
