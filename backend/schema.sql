-- Eliminar tablas antiguas si existen
DROP TABLE IF EXISTS entrenamientos_asignados;
DROP TABLE IF EXISTS entrenamientos;
DROP TABLE IF EXISTS usuarios;


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
    categoria TEXT                 -- Solo atletas
);

-- Tabla de entrenamientos tipo (plantillas)
CREATE TABLE entrenamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    duracion_valor INTEGER,
    duracion_tipo TEXT,
    calentamiento_tipo TEXT,
    calentamiento_valor INTEGER,
    bloque_activacion TEXT,
    bloque_principal TEXT,
    enfriamiento_tipo TEXT,
    enfriamiento_valor INTEGER
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
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id)
);
