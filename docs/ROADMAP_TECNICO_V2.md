# Roadmap Tecnico v2

Ultima actualizacion: 2026-03-09 (CET)

> **ARCHIVADO (2026-08-19):** este roadmap de sprints quedo congelado tras el Sprint 1 y no se actualizo mientras el proyecto avanzaba por otra via (fases funcionales). El estado real y vigente esta en `docs/01_HOJA_RUTA.md` (seccion "0. Estado actual") y `docs/02_BACKLOG_FUNCIONAL.md` (estado modulo a modulo con evidencia de codigo). Se conserva este documento como registro historico de como se planteo el arranque del proyecto, no como plan de ejecucion activo.

Tablero operativo: `docs/KANBAN_V2.md`

## Objetivo
Evolucionar `gestion_entrenamiento_v2` a una plataforma estable para entrenador con flujo completo:
1. crear entrenamientos en biblioteca
2. planificar semanas
3. asignar a atleta/grupo
4. comparar plan vs real (FIT + zonas)
5. operar entre dos equipos sin afectar v1

## Principios de trabajo
1. v1 no se toca.
2. v2 trabaja solo en `main`.
3. cada cambio entre equipos incluye codigo y snapshot de BD (`ops/db_export.sh` y `ops/db_import.sh`).
4. antes de cerrar cada sprint: pruebas de smoke + backup SQL actualizado.

## Estado base actual
1. backend Flask en `backend/app.py`.
2. arranque unico en `./run_main.sh` (puerto `5002`).
3. DB en MariaDB (`gestion_entrenamiento_v2`).
4. analisis atleta ya con navegacion semanal y calculos de zonas en evolucion.

## Backlog priorizado
## P0 - Estabilidad (bloqueante)
1. endurecer `PUT /entrenamientos/<id>` (locks, rollback, tipos de datos).
2. normalizar payload de pasos (`objetivo_valor`, `recuperacion_valor`, tiempos tipo `1'`, `1:30`).
3. evitar respuestas vacias en analisis semanal por falta de historico de zonas.
4. unificar errores API para diagnostico rapido en frontend.

## P1 - Flujo entrenador end-to-end
1. biblioteca de entrenamientos (crear/editar/duplicar/borrar) sin errores.
2. planificador semanal util (AM/PM, copiar/pegar semana).
3. asignacion masiva por grupo/subgrupo/categoria.
4. panel de analisis utilizable para decisiones semanales.

## P2 - Productividad UX
1. wizard de creacion de entrenamiento.
2. edicion rapida de bloques.
3. home entrenador orientado a urgencias.
4. responsive tablet/movil consistente.

## P3 - Operacion
1. smoke tests de endpoints criticos.
2. runbook de arranque, backup y recuperacion.
3. checklist de release semanal.

## Plan por sprints (8 semanas)
## Sprint 1 (Semanas 1-2): Hardening tecnico
Objetivo: eliminar errores 500 recurrentes y estabilizar flujo de entrenamientos.

Tickets:
1. `BE-001` Rollback y cierre robusto en actualizacion de entrenamiento.
2. `BE-002` Retry controlado para lock timeout MariaDB (1205).
3. `BE-003` Normalizacion numerica de payload de pasos.
4. `BE-004` Tests de regresion para crear/editar entrenamiento.
5. `OPS-001` Script de verificacion rapida post-arranque (`csrf`, `login`, endpoints clave).

Criterios de aceptacion:
1. editar entrenamiento no produce 500 en pruebas normales.
2. no hay truncado de columnas numericas en MariaDB.
3. logs sin errores bloqueantes en flujo de biblioteca.

## Sprint 2 (Semanas 3-4): Flujo de planificacion semanal
Objetivo: planificar y asignar semanas de forma completa.

Tickets:
1. `FE-010` Biblioteca semanal usable con acciones editar/borrar.
2. `FE-011` Creador semanal con arrastre de sesiones (AM/PM y doble sesion por franja).
3. `BE-010` Endpoint de asignacion semanal por atleta/grupo.
4. `BE-011` Persistencia de estado semanal y recuperacion.
5. `QA-010` Pruebas integradas crear semana -> asignar -> leer calendario.

Criterios de aceptacion:
1. un entrenador asigna una semana completa sin SQL manual.
2. la semana queda persistida y se recupera al recargar.

## Sprint 3 (Semanas 5-6): Analisis plan vs real
Objetivo: convertir analisis en herramienta real de decision.

Tickets:
1. `BE-020` Recalculo de zonas semanal robusto por rango.
2. `BE-021` Consolidacion km planificados vs realizados por semana.
3. `FE-020` Resumen semanal sin huecos de datos (kms + zonas).
4. `FE-021` Navegacion semanal completa (atras/adelante con limites).
5. `QA-020` Casos reales con FIT de semana completa.

Criterios de aceptacion:
1. panel muestra kms y zonas para semana seleccionada.
2. misma semana muestra datos consistentes entre resumen y graficos.

## Sprint 4 (Semanas 7-8): UX y operacion continua
Objetivo: mejorar velocidad de uso y control operativo entre equipos.

Tickets:
1. `FE-030` Wizard guiado para crear entrenamientos.
2. `FE-031` Home entrenador centrado en urgencias.
3. `OPS-030` Politica de backup diario + verificacion de restauracion.
4. `DOC-030` Runbook operativo completo en docs.
5. `QA-030` Smoke suite minima ejecutable en 5 minutos.

Criterios de aceptacion:
1. tiempo de creacion/asignacion semanal reducido frente al estado inicial.
2. migrar de un equipo a otro tarda menos de 15 minutos (codigo + BD + arranque).

## Matriz de riesgos
1. Riesgo: incoherencia entre equipos por no importar BD.
Mitigacion: backup SQL obligatorio antes de cambio de equipo.
2. Riesgo: bloqueo de MariaDB en escritura concurrente.
Mitigacion: transacciones cortas, rollback seguro, retry acotado.
3. Riesgo: deuda de frontend legacy.
Mitigacion: refactor por modulos en cada sprint, sin big-bang.

## KPIs de seguimiento
1. errores 500 en flujo entrenador por semana (objetivo: 0 en happy path).
2. tiempo medio para crear y asignar una semana.
3. cobertura de sesiones con datos reales subidos (FIT).
4. tiempo de sincronizacion entre equipos (pull + import + run).

## Cadencia de gestion
1. revision semanal de backlog (lunes).
2. demo funcional de sprint (viernes).
3. actualizacion de este documento al cerrar cada sprint.

## Definicion de Done
1. codigo en `main`.
2. smoke checks pasan en local.
3. backup SQL actualizado en `backups/`.
4. documentacion (README/docs) actualizada.
