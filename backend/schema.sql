DROP TABLE IF EXISTS atletas;
DROP TABLE IF EXISTS entrenamientos;
DROP TABLE IF EXISTS usuarios;

CREATE TABLE atletas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    fecha_nacimiento TEXT,
    email TEXT UNIQUE,
    telefono TEXT,
    entrenador_id INTEGER,  -- Añadimos este campo
    FOREIGN KEY (entrenador_id) REFERENCES usuarios(id)  -- Referencia a usuarios(id)
);

CREATE TABLE entrenamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,  -- Cambiamos fecha por nombre
    duracion_valor INTEGER, -- Cambiamos duracion por duracion_valor
    duracion_tipo TEXT,  -- Nuevo campo para tipo de duracion
    calentamiento_tipo TEXT,
    calentamiento_valor INTEGER,
    bloque_activacion TEXT,
    bloque_principal TEXT,
    enfriamiento_tipo TEXT,
    enfriamiento_valor INTEGER
);

CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL  -- Añadimos este campo
);
CREATE TABLE entrenamientos_asignados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atleta_id INTEGER NOT NULL,
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
    FOREIGN KEY (atleta_id) REFERENCES atletas(id)
);
