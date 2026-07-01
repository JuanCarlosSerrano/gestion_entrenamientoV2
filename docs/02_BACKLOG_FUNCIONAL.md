# 02 · Backlog Funcional — MindPace V2

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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

**Estado:** Pendiente

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
