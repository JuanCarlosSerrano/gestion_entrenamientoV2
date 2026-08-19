# Kanban v2

Ultima actualizacion: 2026-03-09 (CET)

> **ARCHIVADO (2026-08-19):** este tablero dejo de moverse tras el Sprint 1 (Sprint 2 aparece entero en "To Do" pese a estar hecho en `main` desde hace meses). El estado real y vigente esta en `docs/01_HOJA_RUTA.md` (seccion "0. Estado actual") y `docs/02_BACKLOG_FUNCIONAL.md`. Se conserva como registro historico, no como tablero activo.

Referencia de plan: `docs/ROADMAP_TECNICO_V2.md`

## Uso
1. mover cada ticket entre `To Do`, `In Progress` y `Done`.
2. mantener maximo 2-3 tickets en `In Progress`.
3. cerrar sprint solo cuando cumpla criterios de aceptacion del roadmap.

---

## Sprint 1 - Hardening tecnico (Semanas 1-2)

### To Do

### In Progress
- [ ] _(vacio)_

### Done
- [x] `BE-001` Rollback y cierre robusto en actualizacion de entrenamiento.
- [x] `BE-002` Retry controlado para lock timeout MariaDB (1205).
- [x] `BE-003` Normalizacion numerica de payload de pasos (`objetivo_valor`, `recuperacion_valor`).
- [x] `BE-004` Tests de regresion para crear/editar entrenamiento.
- [x] `OPS-001` Script de verificacion rapida post-arranque (`csrf`, `login`, endpoints clave).

---

## Sprint 2 - Flujo de planificacion semanal (Semanas 3-4)

### To Do
- [ ] `FE-010` Biblioteca semanal usable con acciones editar/borrar.
- [ ] `FE-011` Creador semanal con arrastre de sesiones (AM/PM y doble sesion por franja).
- [ ] `BE-010` Endpoint de asignacion semanal por atleta/grupo.
- [ ] `BE-011` Persistencia de estado semanal y recuperacion.
- [ ] `QA-010` Pruebas integradas crear semana -> asignar -> leer calendario.

### In Progress
- [ ] _(vacio)_

### Done
- [ ] _(vacio)_

---

## Sprint 3 - Analisis plan vs real (Semanas 5-6)

### To Do
- [ ] `BE-020` Recalculo de zonas semanal robusto por rango.
- [ ] `BE-021` Consolidacion km planificados vs realizados por semana.
- [ ] `FE-020` Resumen semanal sin huecos de datos (kms + zonas).
- [ ] `FE-021` Navegacion semanal completa (atras/adelante con limites).
- [ ] `QA-020` Casos reales con FIT de semana completa.

### In Progress
- [ ] _(vacio)_

### Done
- [ ] _(vacio)_

---

## Sprint 4 - UX y operacion continua (Semanas 7-8)

### To Do
- [ ] `FE-030` Wizard guiado para crear entrenamientos.
- [ ] `FE-031` Home entrenador centrado en urgencias.
- [ ] `OPS-030` Politica de backup diario + verificacion de restauracion.
- [ ] `DOC-030` Runbook operativo completo en docs.
- [ ] `QA-030` Smoke suite minima ejecutable en 5 minutos.

### In Progress
- [ ] _(vacio)_

### Done
- [ ] _(vacio)_

---

## Bloqueados
- [ ] _(vacio)_

## Parking lot
- [ ] limpieza progresiva de JS legacy no critico.
- [ ] mejoras visuales no bloqueantes.

## Checklist semanal
- [ ] backup exportado (`ops/db_export.sh`).
- [ ] pull/push sincronizado entre equipos.
- [ ] smoke de arranque y login.
- [ ] estado Kanban actualizado.
