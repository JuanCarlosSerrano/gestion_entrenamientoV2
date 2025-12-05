-- Esquema adaptado para MariaDB / MySQL
-- El orden de los DROP/CREATE respeta dependencias de claves foráneas.

DROP TABLE IF EXISTS resultados_entrenamientos;
DROP TABLE IF EXISTS km_realizados_entrenamientos;
DROP TABLE IF EXISTS entrenamientos_asignados_detalle;
DROP TABLE IF EXISTS entrenamientos_asignados;
DROP TABLE IF EXISTS feedbacks;
DROP TABLE IF EXISTS entrenamiento_bloques;
DROP TABLE IF EXISTS entrenamientos_detalle;
DROP TABLE IF EXISTS microciclos_entrenamientos;
DROP TABLE IF EXISTS mesociclos_microciclos;
DROP TABLE IF EXISTS macrociclos_mesociclos;
DROP TABLE IF EXISTS microciclos;
DROP TABLE IF EXISTS mesociclos;
DROP TABLE IF EXISTS macrociclos;
DROP TABLE IF EXISTS zonas_entrenamiento;
DROP TABLE IF EXISTS textos_descriptivos;
DROP TABLE IF EXISTS entrenamientos;
DROP TABLE IF EXISTS usuarios;

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellidos VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL,
    fecha_nacimiento DATE NULL,
    telefono VARCHAR(50),
    entrenador_id INT,
    categoria VARCHAR(50),
    grupo VARCHAR(50),
    subgrupo VARCHAR(50),
    aprobado TINYINT DEFAULT 0,
    foto_url VARCHAR(255),
    force_password_change TINYINT DEFAULT 0,
    INDEX idx_usuarios_entrenador (entrenador_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE zonas_entrenamiento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    atleta_id INT NOT NULL,
    vam DOUBLE NOT NULL,
    z1 DOUBLE,
    z2 DOUBLE,
    z3 DOUBLE,
    z4 DOUBLE,
    z5 DOUBLE,
    z6 DOUBLE,
    fecha_inicio DATE NOT NULL DEFAULT (CURRENT_DATE),
    fecha_fin DATE NULL,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_zonas_atleta FOREIGN KEY (atleta_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_zonas_atleta_fecha (atleta_id, fecha_inicio, fecha_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE textos_descriptivos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contenido TEXT NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE entrenamientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    objetivo TEXT,
    duracion_valor INT,
    duracion_tipo VARCHAR(50),
    calentamiento_tipo VARCHAR(50),
    calentamiento_valor INT,
    bloque_activacion TEXT,
    bloque_principal TEXT,
    enfriamiento_tipo VARCHAR(50),
    enfriamiento_valor INT,
    notas TEXT,
    km_totales DOUBLE DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE entrenamientos_detalle (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entrenamiento_id INT NOT NULL,
    parent_id INT NULL,
    orden INT NOT NULL,
    tipo_paso VARCHAR(50) NOT NULL,
    repeticiones INT,
    objetivo_tipo VARCHAR(50),
    objetivo_valor DOUBLE,
    unidad VARCHAR(20),
    zona VARCHAR(20),
    recuperacion_valor DOUBLE,
    recuperacion_unidad VARCHAR(20),
    intensidad VARCHAR(50),
    descripcion TEXT,
    CONSTRAINT fk_detalle_entrenamiento FOREIGN KEY (entrenamiento_id) REFERENCES entrenamientos(id) ON DELETE CASCADE,
    CONSTRAINT fk_detalle_parent FOREIGN KEY (parent_id) REFERENCES entrenamientos_detalle(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE macrociclos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    fecha_inicio DATE,
    fecha_fin DATE,
    objetivo_general TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mesociclos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    macrociclo_id INT,
    nombre VARCHAR(255) NOT NULL,
    fecha_inicio DATE,
    fecha_fin DATE,
    objetivo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mesociclo_macro FOREIGN KEY (macrociclo_id) REFERENCES macrociclos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE microciclos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mesociclo_id INT,
    nombre VARCHAR(255) NOT NULL,
    objetivo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_microciclo_meso FOREIGN KEY (mesociclo_id) REFERENCES mesociclos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE macrociclos_mesociclos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    macrociclo_id INT NOT NULL,
    mesociclo_id INT NOT NULL,
    orden INT,
    notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mm_macro FOREIGN KEY (macrociclo_id) REFERENCES macrociclos(id) ON DELETE CASCADE,
    CONSTRAINT fk_mm_meso FOREIGN KEY (mesociclo_id) REFERENCES mesociclos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mesociclos_microciclos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mesociclo_id INT NOT NULL,
    microciclo_id INT NOT NULL,
    orden INT,
    notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_meso_micro_meso FOREIGN KEY (mesociclo_id) REFERENCES mesociclos(id) ON DELETE CASCADE,
    CONSTRAINT fk_meso_micro_micro FOREIGN KEY (microciclo_id) REFERENCES microciclos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE microciclos_entrenamientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    microciclo_id INT NOT NULL,
    dia_relativo INT,
    sesion_indice INT,
    entrenamiento_id INT,
    notas TEXT,
    orden INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_micro_ent_micro FOREIGN KEY (microciclo_id) REFERENCES microciclos(id) ON DELETE CASCADE,
    CONSTRAINT fk_micro_ent_ent FOREIGN KEY (entrenamiento_id) REFERENCES entrenamientos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE entrenamiento_bloques (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entrenamiento_id INT NOT NULL,
    orden INT NOT NULL,
    repeticiones INT NOT NULL DEFAULT 1,
    distancia_m INT,
    recuperacion VARCHAR(100),
    zona VARCHAR(50),
    observacion TEXT,
    CONSTRAINT fk_entrenamiento_bloques FOREIGN KEY (entrenamiento_id) REFERENCES entrenamientos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE entrenamientos_asignados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    atleta_id INT NOT NULL,
    fecha DATE NOT NULL,
    entrenamiento_id INT NOT NULL,
    visible TINYINT DEFAULT 1,
    ciclo_tipo VARCHAR(10),
    ciclo_id INT,
    macrociclo_id INT,
    mesociclo_id INT,
    microciclo_id INT,
    nombre VARCHAR(255),
    objetivo TEXT,
    notas TEXT,
    created_at DATETIME,
    updated_at DATETIME,
    km_previstos DOUBLE DEFAULT 0,
    CONSTRAINT fk_ent_asig_atleta FOREIGN KEY (atleta_id) REFERENCES usuarios(id),
    CONSTRAINT fk_ent_asig_entrenamiento FOREIGN KEY (entrenamiento_id) REFERENCES entrenamientos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE entrenamientos_asignados_detalle (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entrenamiento_asignado_id INT NOT NULL,
    parent_id INT NULL,
    orden INT NOT NULL,
    tipo_paso VARCHAR(50) NOT NULL,
    repeticiones INT,
    objetivo_tipo VARCHAR(50),
    objetivo_valor DOUBLE,
    unidad VARCHAR(20),
    zona VARCHAR(20),
    recuperacion_valor DOUBLE,
    recuperacion_unidad VARCHAR(20),
    intensidad VARCHAR(50),
    descripcion TEXT,
    CONSTRAINT fk_ead_asignado FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id) ON DELETE CASCADE,
    CONSTRAINT fk_ead_parent FOREIGN KEY (parent_id) REFERENCES entrenamientos_asignados_detalle(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feedbacks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    comentario TEXT,
    fecha DATETIME,
    entrenamiento_asignado_id INT,
    atleta_id INT,
    leido TINYINT DEFAULT 0,
    respuesta TEXT,
    url_datos TEXT,
    CONSTRAINT fk_feedback_entrenamiento FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id),
    CONSTRAINT fk_feedback_atleta FOREIGN KEY (atleta_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE km_realizados_entrenamientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entrenamiento_asignado_id INT UNIQUE,
    km_planificados DOUBLE DEFAULT 0,
    km_realizados DOUBLE DEFAULT 0,
    fecha DATETIME NOT NULL,
    CONSTRAINT fk_km_entrenamiento FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE resultados_entrenamientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entrenamiento_asignado_id INT NOT NULL,
    paso_detalle_id INT NOT NULL,
    repeticion INT,
    tiempo_real_seg INT NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_resultado_entrenamiento FOREIGN KEY (entrenamiento_asignado_id) REFERENCES entrenamientos_asignados(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
