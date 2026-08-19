# 07 · Casos de Uso — MindPace V2

## Objetivo

Este documento define los casos de uso principales de MindPace V2.

Cada caso de uso describe una acción completa que un entrenador o atleta necesita realizar dentro de la aplicación.

La finalidad es evitar desarrollar pantallas sueltas sin conexión entre ellas.

---

# Casos de uso principales

## CU-001 · Entrenador accede al Centro de Control

### Actor principal

Entrenador

### Objetivo

Entrar en MindPace y ver rápidamente qué puede hacer y qué necesita atención.

### Flujo principal

1. El entrenador inicia sesión.
2. Accede a la pantalla principal.
3. Ve las acciones principales:

   * Planificar semana
   * Crear entrenamiento
   * Gestionar atletas
   * Historial y rendimiento
   * Centro de actividad
4. Ve una columna lateral con avisos relevantes.
5. Selecciona la acción que quiere realizar.

### Resultado esperado

El entrenador puede iniciar una tarea importante en menos de 10 segundos.

### Criterios de aceptación

* La pantalla está optimizada para tablet.
* Los botones principales son grandes y táctiles.
* El Centro de actividad muestra avisos recientes.
* No hay tablas complejas en la pantalla inicial.

---

## CU-002 · Entrenador crea un entrenamiento guiado

### Actor principal

Entrenador

### Objetivo

Crear un entrenamiento reutilizable sin rellenar un formulario complejo.

### Flujo principal

1. El entrenador pulsa “Crear entrenamiento”.
2. Selecciona el tipo:

   * Rodaje
   * Series
   * Umbral
   * Competición
   * Fuerza
   * Técnica
   * Descanso
3. Define los bloques del entrenamiento.
4. Añade distancia, repeticiones, recuperación, zona o intensidad.
5. Revisa el resumen.
6. Guarda el entrenamiento como plantilla.

### Resultado esperado

El entrenamiento queda guardado en la biblioteca.

### Criterios de aceptación

* El proceso está dividido en pasos.
* El entrenador puede avanzar sin escribir demasiado.
* El entrenamiento se guarda en `entrenamientos`.
* Los pasos se guardan en `entrenamientos_detalle`.

---

## CU-003 · Entrenador planifica una semana

### Actor principal

Entrenador

### Objetivo

Crear una planificación semanal para un atleta, grupo o subgrupo.

### Flujo principal

1. El entrenador pulsa “Planificar semana”.
2. Elige atleta, grupo o subgrupo.
3. Selecciona la semana.
4. Decide si crear desde cero, copiar semana anterior o usar plantilla.
5. Añade entrenamientos a los días.
6. Revisa el resumen semanal.
7. Guarda la planificación.

### Resultado esperado

La semana queda preparada para asignación y envío.

### Criterios de aceptación

* Debe poder planificarse con pocos clics.
* Debe admitir doble sesión.
* Debe mostrar resumen de kilómetros previstos.
* Debe poder reutilizar entrenamientos existentes.

---

## CU-004 · Entrenador asigna entrenamiento a atletas

### Actor principal

Entrenador

### Objetivo

Convertir una plantilla genérica en entrenamientos personalizados para atletas concretos.

### Flujo principal

1. El entrenador selecciona una plantilla o una sesión de la semana.
2. Elige atleta, varios atletas, grupo o subgrupo.
3. El sistema consulta las zonas/VDOT de cada atleta.
4. El sistema genera una versión personalizada.
5. El entrenador revisa los objetivos generados.
6. Confirma la asignación.

### Resultado esperado

Cada atleta tiene un entrenamiento asignado propio.

### Criterios de aceptación

* Se crea un registro en `entrenamientos_asignados`.
* Se crean pasos en `entrenamientos_asignados_detalle`.
* Los ritmos quedan congelados en el momento de asignación.
* La plantilla original no se modifica.

---

## CU-005 · Entrenador envía entrenamiento por WhatsApp

### Actor principal

Entrenador

### Objetivo

Enviar el entrenamiento al atleta sin hacer capturas de Excel o libreta.

### Flujo principal

1. El entrenador abre un entrenamiento asignado.
2. Pulsa “Enviar por WhatsApp”.
3. MindPace genera un mensaje limpio.
4. El entrenador revisa el texto.
5. Abre WhatsApp o copia el mensaje.
6. El sistema registra el envío.

### Resultado esperado

El atleta recibe el entrenamiento con formato claro y enlace.

### Criterios de aceptación

* El mensaje incluye fecha, entrenamiento, objetivos, recuperación y observaciones.
* El mensaje incluye enlace al entrenamiento.
* Se registra el intento de envío.
* Debe funcionar bien desde tablet.

---

## CU-006 · Atleta abre entrenamiento desde WhatsApp

### Actor principal

Atleta

### Objetivo

Ver el entrenamiento recibido de forma clara desde móvil.

### Flujo principal

1. El atleta recibe un mensaje de WhatsApp.
2. Pulsa el enlace.
3. Se abre la vista simple del entrenamiento.
4. Consulta bloques, ritmos, recuperación y observaciones.
5. Realiza el entrenamiento.

### Resultado esperado

El atleta entiende la sesión sin navegar por la aplicación.

### Criterios de aceptación

* Vista optimizada para móvil.
* Información clara y mínima.
* Acceso directo al feedback.
* No se muestran menús innecesarios.

---

## CU-007 · Atleta envía feedback y archivo FIT

### Actor principal

Atleta

### Objetivo

Informar al entrenador de cómo fue el entrenamiento y subir el archivo FIT.

### Flujo principal

1. El atleta abre el entrenamiento.
2. Pulsa “Enviar feedback”.
3. Indica si completó la sesión.
4. Añade RPE, fatiga, sensaciones y molestias.
5. Escribe comentario opcional.
6. Sube archivo FIT.
7. Envía el feedback.

### Resultado esperado

El feedback y el FIT quedan asociados al entrenamiento exacto.

### Criterios de aceptación

* Se registra el feedback en `feedbacks`.
* Se crea o actualiza `sesiones_realizadas`.
* El archivo se guarda en `sesion_archivos`.
* El entrenador recibe aviso en el Centro de actividad.

---

## CU-008 · Entrenador revisa entrenamientos completados

### Actor principal

Entrenador

### Objetivo

Revisar lo que ha hecho el atleta y compararlo con lo planificado.

### Flujo principal

1. El entrenador entra en el Centro de actividad.
2. Ve feedbacks o FIT pendientes.
3. Abre una sesión.
4. Revisa planificado vs realizado.
5. Consulta comentario, RPE, fatiga y molestias.
6. Marca la sesión como revisada.

### Resultado esperado

El entrenador entiende rápidamente si la sesión fue correcta o requiere atención.

### Criterios de aceptación

* Debe mostrar resumen planificado vs real.
* Debe mostrar feedback subjetivo.
* Debe mostrar archivo FIT si existe.
* Debe permitir marcar como revisado.

---

## CU-009 · Entrenador consulta historial de un atleta

### Actor principal

Entrenador

### Objetivo

Recuperar información antigua de un atleta.

### Flujo principal

1. El entrenador abre “Historial y rendimiento”.
2. Selecciona un atleta.
3. Filtra por fecha, tipo de entrenamiento, distancia, zona o molestias.
4. Abre una sesión histórica.
5. Consulta qué se planificó, qué se hizo y qué sensaciones tuvo.

### Resultado esperado

El entrenador puede saber qué ocurrió hace semanas o meses sin buscar en WhatsApp o Excel.

### Criterios de aceptación

* Debe permitir filtros básicos.
* Debe conectar entrenamiento, feedback y FIT.
* Debe mostrar información histórica sin modificarla.
* Debe poder usarse como memoria deportiva del atleta.

---

## CU-010 · Sistema genera alertas

### Actor principal

Sistema

### Objetivo

Detectar situaciones importantes sin que el entrenador revise todo manualmente.

### Flujo principal

1. El sistema recibe feedback o FIT.
2. Evalúa reglas activas.
3. Detecta casos relevantes:

   * RPE alto
   * Fatiga elevada
   * Molestias
   * Sesión incompleta
   * Falta de feedback
   * Desviación importante
4. Crea una alerta.
5. La muestra en el Centro de actividad.

### Resultado esperado

El entrenador sabe qué necesita revisar primero.

### Criterios de aceptación

* Las alertas deben estar asociadas a atleta.
* Deben tener severidad.
* Deben tener estado.
* Deben llevar a una acción concreta.

---

# Orden recomendado de implementación

1. CU-001 · Centro de Control
2. CU-002 · Crear entrenamiento guiado
3. CU-003 · Planificar semana
4. CU-004 · Asignar entrenamiento
5. CU-005 · Enviar por WhatsApp
6. CU-006 · Vista atleta
7. CU-007 · Feedback + FIT
8. CU-008 · Revisión entrenador
9. CU-009 · Historial
10. CU-010 · Alertas

---

# Regla de validación

Un caso de uso no se considera completado hasta que:

* el flujo puede ejecutarse de principio a fin;
* los datos quedan guardados correctamente;
* la experiencia es usable en tablet o móvil;
* no rompe funcionalidades existentes;
* tiene criterios de aceptación verificables.
