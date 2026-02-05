-- Eliminar tablas antiguas si existen
DROP TABLE IF EXISTS entrenamientos_asignados_detalle;
DROP TABLE IF EXISTS entrenamientos_detalle;
DROP TABLE IF EXISTS entrenamientos_asignados;
DROP TABLE IF EXISTS entrenamientos;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS sesion_archivos;
DROP TABLE IF EXISTS sesion_metricas;
DROP TABLE IF EXISTS sesiones_realizadas;
DROP TABLE IF EXISTS alertas_reglas;
DROP TABLE IF EXISTS alertas_entrenamientos;


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
    foto_url TEXT,
    force_password_change INTEGER DEFAULT 0,
    vdot_val REAL,
    vdot_fecha TEXT,
    vdot_distancia_m REAL,
    vdot_tiempo_seg INTEGER
);


CREATE TABLE vdot_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atleta_id INTEGER NOT NULL,
    vdot_val REAL NOT NULL,
    vdot_fecha TEXT,
    vdot_distancia_m REAL,
    vdot_tiempo_seg INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Tabla de entrenamientos tipo (plantillas)
CREATE TABLE entrenamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    objetivo TEXT,
    duracion_valor INTEGER,
    duracion_tipo TEXT,
    calentamiento_tipo TEXT,
    calentamiento_valor INTEGER,
    bloque_activacion TEXT,
    bloque_principal TEXT,
    enfriamiento_tipo TEXT,
    enfriamiento_valor INTEGER,
    notas TEXT
);

CREATE TABLE entrenamientos_detalle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_id INTEGER NOT NULL,
    parent_id INTEGER,
    orden INTEGER NOT NULL,
    tipo_paso TEXT NOT NULL,
    repeticiones INTEGER,
    objetivo_tipo TEXT,
    objetivo_valor REAL,
    unidad TEXT,
    zona TEXT,
    recuperacion_valor REAL,
    recuperacion_unidad TEXT,
    intensidad TEXT,
    descripcion TEXT,
    FOREIGN KEY (entrenamiento_id) REFERENCES entrenamientos(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES entrenamientos_detalle(id) ON DELETE CASCADE
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

CREATE TABLE entrenamientos_asignados_detalle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_asignado_id INTEGER NOT NULL,
    parent_id INTEGER,
    orden INTEGER NOT NULL,
    tipo_paso TEXT NOT NULL,
    repeticiones INTEGER,
    objetivo_tipo TEXT,
    objetivo_valor REAL,
    unidad TEXT,
    zona TEXT,
    recuperacion_valor REAL,
    recuperacion_unidad TEXT,
    intensidad TEXT,
    descripcion TEXT,
    FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES entrenamientos_asignados_detalle(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_asignado_id INTEGER NOT NULL,
    atleta_id INTEGER NOT NULL,
    comentario TEXT NOT NULL,
    rpe INTEGER,
    sensacion TEXT,
    fatiga TEXT,
    dolor INTEGER DEFAULT 0,
    zona_dolor TEXT,
    completado INTEGER DEFAULT 1,
    leido INTEGER DEFAULT 0,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    respuesta TEXT,
    url_datos TEXT,
    FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id),
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id)
);


CREATE TABLE IF NOT EXISTS sesiones_realizadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_asignado_id INTEGER NOT NULL UNIQUE,
    atleta_id INTEGER NOT NULL,
    fecha_real TEXT,
    km_real REAL DEFAULT 0,
    duracion_real_seg INTEGER,
    rpe INTEGER,
    sensacion TEXT,
    fatiga TEXT,
    dolor INTEGER DEFAULT 0,
    zona_dolor TEXT,
    completado INTEGER DEFAULT 1,
    comentario TEXT,
    origen_datos TEXT DEFAULT 'manual',
    archivo_principal_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id) ON DELETE CASCADE,
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sesion_metricas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sesion_id INTEGER NOT NULL,
    metrica TEXT NOT NULL,
    valor REAL NOT NULL,
    unidad TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sesion_id) REFERENCES sesiones_realizadas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sesion_archivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sesion_id INTEGER,
    atleta_id INTEGER NOT NULL,
    origen TEXT DEFAULT 'manual',
    filename TEXT,
    mime TEXT,
    tamano INTEGER,
    ruta_storage TEXT,
    hash_sha256 TEXT,
    fecha_subida TEXT DEFAULT CURRENT_TIMESTAMP,
    procesado INTEGER DEFAULT 0,
    error_procesado TEXT,
    FOREIGN KEY (sesion_id) REFERENCES sesiones_realizadas(id) ON DELETE SET NULL,
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alertas_reglas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenador_id INTEGER NOT NULL,
    codigo TEXT NOT NULL,
    parametros_json TEXT,
    activo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entrenador_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alertas_entrenamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_asignado_id INTEGER NOT NULL,
    atleta_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    codigo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    fecha_detectada TEXT NOT NULL,
    activo INTEGER DEFAULT 1,
    UNIQUE(entrenamiento_asignado_id, codigo),
    FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id) ON DELETE CASCADE,
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS zonas_resumen_entrenamiento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrenamiento_asignado_id INTEGER NOT NULL,
    atleta_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    fuente TEXT NOT NULL DEFAULT 'ritmo',
    zona TEXT NOT NULL,
    distancia_km REAL,
    tiempo_seg INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entrenamiento_asignado_id, tipo, fuente, zona)
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
    fc_z1 REAL,
    fc_z2 REAL,
    fc_z3 REAL,
    fc_z4 REAL,
    fc_z5 REAL,
    fc_z6 REAL,
    metodo TEXT,
    fecha_inicio DATE NOT NULL DEFAULT (DATE('now')),
    fecha_fin DATE NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id)
);

CREATE TABLE macrociclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    fecha_inicio TEXT,
    fecha_fin TEXT,
    objetivo_general TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mesociclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    macrociclo_id INTEGER,
    nombre TEXT NOT NULL,
    fecha_inicio TEXT,
    fecha_fin TEXT,
    objetivo TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (macrociclo_id) REFERENCES macrociclos(id) ON DELETE SET NULL
);

CREATE TABLE microciclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesociclo_id INTEGER,
    nombre TEXT NOT NULL,
    objetivo TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mesociclo_id) REFERENCES mesociclos(id) ON DELETE SET NULL
);

CREATE TABLE macrociclos_mesociclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    macrociclo_id INTEGER NOT NULL,
    mesociclo_id INTEGER NOT NULL,
    orden INTEGER,
    notas TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (macrociclo_id) REFERENCES macrociclos(id) ON DELETE CASCADE,
    FOREIGN KEY (mesociclo_id) REFERENCES mesociclos(id) ON DELETE CASCADE
);

CREATE TABLE microciclos_entrenamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    microciclo_id INTEGER NOT NULL,
    dia_relativo INTEGER,
    sesion_indice INTEGER,
    entrenamiento_id INTEGER,
    notas TEXT,
    orden INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (microciclo_id) REFERENCES microciclos(id) ON DELETE CASCADE,
    FOREIGN KEY (entrenamiento_id) REFERENCES entrenamientos(id)
);

CREATE TABLE mesociclos_microciclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesociclo_id INTEGER NOT NULL,
    microciclo_id INTEGER NOT NULL,
    orden INTEGER,
    notas TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mesociclo_id) REFERENCES mesociclos(id) ON DELETE CASCADE,
    FOREIGN KEY (microciclo_id) REFERENCES microciclos(id) ON DELETE CASCADE
);

CREATE TABLE ciclo_asignaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_ciclo TEXT NOT NULL CHECK (tipo_ciclo IN ('micro','meso','macro')),
    ciclo_id INTEGER NOT NULL,
    atleta_id INTEGER NOT NULL,
    fecha_inicio_real TEXT,
    notas TEXT,
    estado TEXT DEFAULT 'planificado',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (atleta_id) REFERENCES usuarios(id)
);
