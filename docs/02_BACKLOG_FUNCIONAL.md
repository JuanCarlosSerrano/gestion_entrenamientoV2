# 02 · Backlog Funcional — MindPace V2

**Última auditoría de estado:** 2026-08-19, contra `main` (`502858b`), tras fusionar `feature/be-010-asignacion-semanal`.

**Método:** auditoría de código (rutas Flask, servicios, tests y pantallas del frontend), no autodeclaración. Cada estado abajo referencia el fichero que lo sostiene. Un módulo puede llevar meses funcionando en la app aunque este documento llevara igual de tiempo sin actualizarse — así estaba antes de esta revisión, y es la razón de que existiera este backlog "fantasma" con todo en `Pendiente`.

**Foco actual (decisión 2026-08-19, vigente):** el desarrollo se concentra en tres pilares — Módulo 3 (creación de entrenamiento), Módulo 4 + Módulo 13 (planificación semanal e individual) y Módulo 15 (gestión de atletas) — hasta que estén sólidos y probados. Los Módulos 9, 10 y 11 (revisión, historial, estadísticas) quedan **en pausa deliberada**, no descartados: su estado de código no cambia, pero no reciben esfuerzo nuevo por ahora.

**Actualización 2026-08-20 — ronda de hardening con uso real en producción:** con `mind-pace.net` publicado y un entrenador/atleta reales usando la app, se corrigieron más de 20 fallos concretos sobre los módulos 3, 4, 8, 13, 14 y 15 (selector de fecha de nacimiento, autoformato de tiempos mm:ss, unidad del bloque bloqueada, cabecera duplicada al crear, semana ya asignada no editable, feedback duplicado por fallo de esquema, respuesta del entrenador invisible para el atleta, botón "Ver/Responder" bloqueado por la CSP, entre otros) más una auditoría completa de dos clases de fallo (esquema SQLite/MariaDB divergente, comprobaciones de propiedad ausentes en rutas de escritura). Ninguno de estos cambia el estado Hecho/Parcial/Pendiente de los módulos de abajo — eran fallos dentro de funcionalidad ya "Hecho", no funcionalidad nueva —, pero si el criterio para pasar a análisis es "sin fallos que corregir", este es el registro de que hoy sí los había. Detalle completo de cada fallo en el historial de commits de `main` del 20/08.

## Leyenda de estado

- **Hecho** — implementación real presente en `main` y verificable en código.
- **Parcial** — hay piezas construidas pero no cumple el criterio de aceptación completo tal como está descrito.
- **Pendiente** — no se ha encontrado implementación.

## Criterios de prioridad

### MUST

Imprescindible para que la V2 pueda utilizarse de principio a fin.

### SHOULD

Aporta mucho valor, pero la aplicación puede funcionar sin ello en una primera versión usable.

### COULD

Mejora útil que puede esperar si bloquea el avance de la V2.

### PARKING LOT

Idea futura fuera del alcance de la V2.

---

# Módulo 1 · Dashboard del entrenador

## MP-001 · Nueva home del entrenador

**Estado:** Hecho — `frontend/static/entrenador/index.html` + `js/entrenador/main.js`.

**Prioridad:** MUST

**Problema:** La pantalla actual muestra demasiada información y no guía al entrenador.

**Objetivo:** Convertir la pantalla inicial en un centro de acciones.

**Debe permitir:**

- Crear entrenamiento.
- Planificar semana.
- Gestionar atletas.
- Consultar historial y rendimiento.
- Revisar alertas y feedback.
- Acceder a configuración.

**Criterios de aceptación:**

- La home muestra botones grandes para las acciones principales.
- El entrenador entiende en pocos segundos qué puede hacer.
- La pantalla muestra tareas pendientes o avisos accionables cuando existan.

**Dependencias:** Ninguna.

---

# Módulo 2 · Biblioteca de entrenamientos

## MP-010 · Biblioteca de entrenamientos

**Estado:** Hecho — `frontend/static/entrenador/entrenamientos.html` + `js/entrenador/entrenamientos.js` (3724 líneas) y `js/entrenador/gestion_plantillas.js` (838 líneas).

**Prioridad:** MUST

**Objetivo:** Centralizar todos los entrenamientos reutilizables.

**Debe permitir:**

- Buscar entrenamientos.
- Filtrar por tipo o categoría.
- Duplicar entrenamientos.
- Editar entrenamientos.
- Marcar favoritos.
- Organizar por categorías.

**Criterios de aceptación:**

- El entrenador puede encontrar una plantilla existente sin crearla de nuevo.
- Una plantilla puede reutilizarse en una planificación semanal.
- Duplicar o editar una plantilla no altera entrenamientos históricos ya asignados.

**Dependencias:** Motor de entrenamientos.

---

# Módulo 3 · Creación de entrenamiento

## MP-020 · Asistente guiado

**Estado:** Hecho — wizard por pasos (`builder-wizard`, `wizard-title`, `wizard-help`) dentro de `js/entrenador/entrenamientos.js`.

**Prioridad:** MUST

**Problema:** Los formularios largos ralentizan el trabajo del entrenador.

**Objetivo:** Crear entrenamientos mediante un asistente por pasos.

**Debe permitir:**

- Seleccionar tipo de entrenamiento.
- Definir bloques.
- Configurar series, rodajes o sesiones de fuerza.
- Añadir observaciones.
- Guardar como entrenamiento único o plantilla.

**Criterios de aceptación:**

- El entrenador puede crear un entrenamiento completo sin usar un formulario largo.
- El entrenamiento queda disponible para asignación o reutilización.
- La estructura creada es compatible con VDOT, WhatsApp, atleta e historial.

**Dependencias:** Biblioteca y motor de entrenamientos.

---

# Módulo 4 · Planificación semanal

## MP-030 · Semana planificada

**Estado:** Hecho — `frontend/static/entrenador/planificacion_semanal.html` + `js/entrenador/planificacion_semanal.js`.

**Prioridad:** MUST

**Objetivo:** Sustituir la planificación semanal en Excel o libreta.

**Debe permitir:**

- Crear una semana desde cero.
- Copiar una semana anterior.
- Usar plantillas semanales.
- Planificar microciclos.
- Añadir doble sesión cuando proceda.
- Planificar por atleta, grupo o subgrupo.

**Criterios de aceptación:**

- El entrenador puede preparar una semana completa desde MindPace.
- Cada sesión queda asociada a un día y a un destinatario.
- La semana puede revisarse antes de asignar o enviar.

**Dependencias:** Biblioteca y asignación.

---

# Módulo 5 · Asignación

## MP-040 · Asignación rápida

**Estado:** Hecho — `asignar_grupo_entrenamiento`, `asignar_entrenamiento_lote` y `asignar_entrenamiento_a_atletas` en `backend/app.py`, más `js/entrenador/grupo_entrenamiento.js`.

**Prioridad:** MUST

**Objetivo:** Convertir entrenamientos o semanas en sesiones concretas para atletas concretos.

**Debe permitir:**

- Asignar a un atleta.
- Asignar a un grupo.
- Asignar a un subgrupo.
- Generar una versión personalizada por atleta.

**Criterios de aceptación:**

- Cada asignación conserva atleta, fecha, plantilla, versión y entrenador.
- Los valores personalizados quedan congelados en el momento de asignar.
- Cambios posteriores en plantilla o VDOT no alteran asignaciones históricas.

**Dependencias:** Planificación y personalización deportiva.

---

# Módulo 6 · VDOT

## MP-050 · Personalización automática

**Estado:** Hecho — el campo `vdot_usado` se congela en el momento de asignar (`backend/app.py`, funciones `calcular_zonas` / `guardar_zonas`).

**Prioridad:** MUST

**Objetivo:** Traducir una plantilla genérica a objetivos concretos por atleta.

**Ejemplo:**

```text
6x800 @ I
```

Debe generar tiempos como:

- 2:28
- 2:34
- 2:41

según el atleta.

**Criterios de aceptación:**

- La asignación usa el VDOT vigente del atleta.
- El VDOT usado queda guardado con la asignación.
- El entrenador puede ajustar manualmente si lo necesita.

**Dependencias:** Zonas de entrenamiento y asignación.

---

# Módulo 7 · WhatsApp

## MP-060 · Compartir entrenamiento

**Estado:** Hecho — `backend/services/whatsapp_service.py` + `backend/services/publication_service.py`.

**Prioridad:** MUST

**Objetivo:** Eliminar la foto del Excel o la libreta enviada por WhatsApp.

**Debe generar:**

- Mensaje limpio.
- Enlace al entrenamiento.
- Apertura de WhatsApp.
- Registro de envío.

**Criterios de aceptación:**

- El entrenador puede copiar el mensaje.
- El entrenador puede abrir WhatsApp con el contenido preparado.
- El sistema registra que el entrenamiento fue enviado.

**Dependencias:** Asignación y vista del atleta.

---

# Módulo 8 · Atleta

## MP-070 · Vista móvil del atleta

**Estado:** Hecho — panel atleta completo en `frontend/static/atleta/` (`index.html`, `entrenamientos.html`, `perfil.html`).

**Prioridad:** MUST

**Objetivo:** Mostrar el entrenamiento de forma extremadamente sencilla desde móvil.

**Debe permitir:**

- Ver el entrenamiento del día.
- Ver bloques, ritmos, recuperaciones y observaciones.
- Enviar feedback.

**Criterios de aceptación:**

- El atleta puede abrir el enlace desde WhatsApp.
- La pantalla se entiende sin navegación compleja.
- La vista no muestra información técnica innecesaria.

**Dependencias:** Comunicación y asignación.

---

## MP-071 · Feedback del atleta

**Estado:** Hecho — `js/atleta/feedbacks.js` (subida) + `backend/services/fit_service.py` (procesado FIT) + `js/entrenador/feedback.js` (revisión, incluye chips de RPE).

**Prioridad:** MUST

**Debe permitir:**

- Subir archivo FIT.
- Indicar RPE.
- Indicar fatiga.
- Indicar molestias.
- Añadir comentario.
- Marcar entrenamiento completado o no completado.

**Criterios de aceptación:**

- El feedback queda asociado al entrenamiento asignado exacto.
- El FIT queda asociado al mismo entrenamiento.
- El entrenador puede revisar el feedback desde su panel.

**Dependencias:** Vista móvil del atleta y procesamiento FIT.

---

# Módulo 9 · Revisión

## MP-080 · Revisión del entrenador

**Estado:** Parcial — las piezas existen por separado (`feedback.html`, `alertas.html`, `js/entrenador/analisis_atleta.js` con comparación plan vs. real por semana) pero no hay una pantalla única que las consolide y diga "a quién revisar primero". Es el hueco funcional real más claro del proyecto ahora mismo.

**Prioridad:** SHOULD

**Debe mostrar:**

- Feedback pendiente.
- FIT pendiente de revisión.
- Alertas.
- Entrenamientos no completados.
- Desviaciones relevantes.

**Criterios de aceptación:**

- El entrenador sabe qué atletas revisar primero.
- Cada aviso lleva a una acción o detalle concreto.
- La revisión conecta planificado, feedback y FIT.

**Dependencias:** Feedback, FIT, comparación y alertas.

---

# Módulo 10 · Historial

## MP-090 · Historial y rendimiento

**Estado:** Hecho, aunque no como pantalla dedicada: vive dentro de `js/entrenador/analisis_atleta.js` (navegación semanal, km planificados vs. realizados) y de `js/atleta/historial.js` para el propio atleta.

**Prioridad:** MUST

**Debe responder:**

- ¿Qué hizo este atleta hace tres meses?
- ¿Qué sensaciones tuvo?
- ¿Qué FIT subió?
- ¿Qué ritmo estaba planificado?
- ¿Qué hizo realmente?

**Criterios de aceptación:**

- El entrenador puede consultar entrenamientos antiguos por atleta.
- El historial conserva la versión recibida por el atleta.
- El historial conecta planificación, feedback, FIT y comparación.

**Dependencias:** Asignación, feedback, FIT y comparación.

---

# Módulo 11 · Estadísticas

## MP-100 · Estadísticas

**Estado:** Hecho — `frontend/static/entrenador/estadisticas.html` + `js/entrenador/estadisticas.js` (379 líneas), con `css/historial_entrenador.css`.

**Prioridad:** SHOULD

**Debe calcular por:**

- Atleta.
- Grupo.
- Semana.
- Mes.

**Criterios de aceptación:**

- El entrenador puede ver métricas básicas de carga y cumplimiento.
- Las estadísticas no sustituyen a los datos originales.
- Los datos pueden recalcularse desde el historial.

**Dependencias:** Historial.

---

# Módulo 12 · Alertas

## MP-110 · Alertas inteligentes

**Estado:** Hecho — rutas `/alertas/entrenador` (listar, resolver, reactivar) en `backend/app.py`, generación en `generar_alertas_resultado` / `_persistir_alertas`, frontend en `js/entrenador/alertas.js`.

**Prioridad:** SHOULD

**Debe detectar:**

- Fatiga elevada.
- Molestias.
- Incumplimientos.
- Exceso de carga.
- Falta de feedback.
- Desviaciones planificado vs realizado.

**Criterios de aceptación:**

- Las alertas son accionables.
- Cada alerta está asociada a un atleta.
- El entrenador puede marcar alertas como vistas, resueltas o descartadas.

**Dependencias:** Feedback, FIT, comparación y estadísticas.

---

# Parking Lot

Ideas fuera del alcance de la V2:

- IA generativa avanzada.
- Predicción de marcas.
- Nutrición.
- Calendario de competiciones.
- Integración directa con Garmin.
- Aplicación móvil nativa.
- Chat interno.

---

# Módulo 13 · Planificación individual por atleta

**Estado general:** Hecho — `frontend/static/entrenador/atleta_planificacion.html` + `js/entrenador/atleta_planificacion.js`, apoyado en `js/entrenador/calendario.js` (1070 líneas) y `js/entrenador/perfil_atleta.js` (554 líneas).

## MP-120 · Seleccionar atleta para planificación

**Prioridad:** MUST

**Debe permitir:**

- Buscar atleta por nombre.
- Filtrar por grupo, subgrupo y categoría.
- Abrir directamente la planificación del atleta seleccionado.

## MP-121 · Calendario mensual de planificación

**Prioridad:** MUST

**Debe permitir:**

- Consultar mes anterior, mes siguiente y mes actual.
- Identificar días con entrenamientos asignados.
- Diferenciar estados oculto, visible y programado sin saturar la pantalla.

## MP-122 · Gestión de sesiones asignadas

**Prioridad:** MUST

**Debe permitir:**

- Abrir un día y ver sesiones de mañana y tarde.
- Añadir una sesión desde la biblioteca privada.
- Editar nombre, fecha, franja y notas de una sesión asignada.
- Mover sesión a otra fecha.
- Duplicar sesión.
- Eliminar sesión de la planificación.
- Cambiar visibilidad o programar publicación.

**Criterios de aceptación:**

- La edición afecta solo a `entrenamientos_asignados` y `entrenamientos_asignados_detalle`.
- La plantilla original en `entrenamientos` y `entrenamientos_detalle` no se modifica.
- El entrenador solo accede a sus atletas.
- No se muestran métricas de rendimiento, FIT, RPE ni feedback.

---

# Módulo 14 · Publicación y WhatsApp

**Estado general:** Hecho — `frontend/static/entrenador/publicacion_pendientes.html` + `js/entrenador/publicacion_pendientes.js` + `backend/services/publication_service.py`.

## MP-130 · Panel de pendientes de publicar

**Prioridad:** MUST

**Debe permitir:**

- Abrir el panel desde `Pendientes de hoy -> Publicar`.
- Filtrar por Hoy, Mañana, Esta semana y Todos.
- Ver atleta, fecha, entrenamiento, resumen y estado.
- Seleccionar una o varias sesiones.

## MP-131 · Publicar o programar

**Prioridad:** MUST

**Debe permitir:**

- Publicar ahora una sesión o varias.
- Programar fecha y hora de publicación.
- Cambiar una programación existente.
- Mantener ocultas las sesiones programadas hasta su fecha.

## MP-132 · Aviso WhatsApp

**Prioridad:** MUST

**Debe permitir:**

- Generar el aviso cuando el entrenamiento pasa a visible.
- Registrar un único envío por entrenamiento asignado.
- Mantener el mensaje corto y sin enlace.

---

# Módulo 15 · Configuración

**Estado general:** Hecho en su mayoría — CRUD de atleta en `backend/routes/configuracion.py` (blueprint, 205 líneas); histórico y alta de zonas VDOT/VAM siguen sin migrar al blueprint y viven en `backend/app.py` (`calcular_zonas`, `guardar_zonas`, `obtener_historial_zonas_atleta`).

## MP-140 · Alta atleta

**Estado:** Hecho — `configuracion_crear_atleta`.

**Prioridad:** MUST

**Debe permitir:**

- Crear atleta con datos básicos.
- Asignar categoría, grupo y subgrupo.
- Generar o introducir contraseña temporal.
- Marcar `force_password_change`.

## MP-141 · Edición de datos

**Estado:** Hecho — `configuracion_actualizar_atleta`.

**Prioridad:** MUST

**Debe permitir:**

- Editar nombre, apellidos, email, teléfono, fecha de nacimiento y categoría.
- Rechazar emails duplicados.
- Mantener permisos entrenador-atleta.

## MP-142 · Grupo y subgrupo

**Estado:** Hecho — cubierto por `configuracion_actualizar_atleta` y `grupo_entrenamiento.js`.

**Prioridad:** MUST

**Debe permitir:**

- Cambiar grupo, subgrupo y categoría desde Configuración.
- Reutilizar el modelo actual de `usuarios`.

## MP-143 · Reset password

**Estado:** Hecho — `configuracion_reset_password_atleta`.

**Prioridad:** MUST

**Debe permitir:**

- Generar contraseña temporal.
- Guardar solo hash.
- Activar cambio obligatorio de contraseña.

## MP-144 · Histórico de zonas

**Estado:** Hecho — `obtener_historial_zonas_atleta` en `backend/app.py` (pendiente de mover al blueprint de configuración).

**Prioridad:** MUST

**Debe permitir:**

- Consultar configuraciones anteriores de zonas.
- Ver VDOT, VAM, ritmos, FC, método y fechas.

## MP-145 · Nueva configuración de zonas

**Estado:** Hecho — `guardar_zonas` en `backend/app.py` (cierra la configuración vigente con `fecha_fin` antes de insertar la nueva).

**Prioridad:** MUST

**Debe permitir:**

- Crear una configuración nueva.
- Cerrar la configuración vigente anterior.
- No sobrescribir históricos.

## MP-146 · Archivado/desactivación

**Estado:** Hecho — `configuracion_estado_atleta`.

**Prioridad:** MUST

**Debe permitir:**

- Desactivar atletas con historial.
- Borrar físicamente solo atletas sin datos asociados.

## MP-147 · Panel atleta V2

**Estado:** Parcial — la mayoría de puntos están cubiertos por el panel atleta (`frontend/static/atleta/`), pero no se ha localizado una pantalla específica de "evolución básica" separada del historial propio.

**Prioridad:** MUST

**Debe permitir:**

- Ver entrenamiento visible del día.
- Consultar planificación semanal visible.
- Abrir el detalle del entrenamiento en solo lectura.
- Completar feedback guiado.
- Subir FIT opcional.
- Consultar historial propio.
- Consultar evolución básica.
- Ver perfil y cambiar contraseña.

---

# Módulo 16 · Pantallas implementadas sin especificación formal

Estas pantallas existen en `main` con volumen de código real, pero no tienen un módulo correspondiente en este backlog — se construyeron directamente sin pasar por aquí. Se listan para que quede constancia y se les pueda dar una especificación (criterios de aceptación, dependencias) en la próxima revisión de planificación, en vez de seguir invisibles para este documento.

| Pantalla | Frontend | Backend relacionado | Tamaño (frontend JS) |
|---|---|---|---|
| Grupos de entrenamiento | `entrenador/grupo_entrenamiento.html` | `asignar_grupo_entrenamiento` (`app.py`) | 505 líneas |
| Calendario general | `entrenador/calendario.html` | — | 1070 líneas |
| Análisis de atleta (plan vs. real) | `entrenador/analisis_atleta.html` | comparación semanal km/zonas | 1207 líneas |
| Perfil de atleta (vista entrenador) | `entrenador/perfil_atleta.html` | — | 554 líneas |
| Editor de entrenamiento asignado | `entrenador/entrenamiento_asignado_editor.html` | — | 480 líneas |

**Recomendación:** antes de planificar la siguiente fase, decidir si estas pantallas se documentan retroactivamente como módulos propios o se consolidan dentro de los módulos existentes (p. ej. Análisis de atleta cubre de facto los Módulos 9 y 10).

**Actualización 2026-08-19:** Ciclos de entrenamiento (`ciclos.html`) y Gestión de plantillas (`gestion_plantillas.js`) — que aparecían aquí como pantallas sin especificar — se retiraron del código. Eran el modelo jerárquico de planificación de v1 (entrenamiento → microciclo → mesociclo → macrociclo), sustituido en v2 por entrenamiento + semana con "semanas tipo" (biblioteca de semanas reutilizables), ya cubierto por el Módulo 4 y `planificacion_semanal.js`. Ver commit `2e2efc7`.
