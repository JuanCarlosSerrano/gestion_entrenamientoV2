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
    categoria TEXT 
    grupo TEXT,
    subgrupo TEXT,
    aprobado INTEGER,                -- Solo atletas
    foto_url TEXT
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

CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_asignado_id INTEGER NOT NULL,
    atleta_id INTEGER NOT NULL,
    comentario TEXT NOT NULL,
    leido INTEGER DEFAULT 0,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    respuesta TEXT NOT NULL,
    FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id),
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id)
);
