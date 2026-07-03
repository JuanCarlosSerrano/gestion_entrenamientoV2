# 09 · Flujo de creación de entrenamientos

## Objetivo

El proceso de creación de un entrenamiento es el núcleo de MindPace.

Debe ser un proceso rápido, guiado e intuitivo, evitando que el entrenador tenga que enfrentarse a una pantalla en blanco.

La aplicación debe actuar como un asistente, guiando al entrenador paso a paso hasta obtener un entrenamiento completamente definido y listo para guardar o asignar.

---

# Principios de diseño

Todo el flujo debe cumplir las siguientes reglas.

## Nunca comenzar desde cero

El entrenador nunca verá un editor vacío.

Siempre partirá de:

- una plantilla inteligente
- un entrenamiento existente
- un entrenamiento de su biblioteca

La aplicación debe minimizar el trabajo repetitivo.

---

## Una decisión por pantalla

Cada paso del asistente debe responder únicamente a una pregunta.

Ejemplos:

- ¿Cómo quieres empezar?
- ¿Qué tipo de entrenamiento vas a crear?
- ¿Qué estructura tendrá?
- ¿Qué deseas hacer al finalizar?

Evitar pantallas con múltiples decisiones simultáneas.

---

## Priorizar el uso táctil

La aplicación está pensada principalmente para tablets.

Por tanto:

- botones grandes
- pocos campos de texto
- muchas selecciones mediante pulsaciones
- listas simples
- navegación clara

---

## Reutilización

Todo entrenamiento debe poder reutilizarse posteriormente.

La biblioteca personal del entrenador constituye uno de los activos más importantes del sistema.

---

# Flujo general

```
Crear entrenamiento

        │

        ▼

¿Cómo quieres empezar?

        │

 ┌──────┼────────┐

 ▼      ▼        ▼

Nuevo  Biblioteca  Duplicar

        │

        ▼

Tipo de entrenamiento

        │

        ▼

Plantilla inteligente

        │

        ▼

Editor de bloques

        │

        ▼

Información general

        │

        ▼

Guardar o asignar
```

---

# Paso 1 · ¿Cómo quieres empezar?

El entrenador deberá elegir una de las siguientes opciones.

## Crear entrenamiento nuevo

Inicia un entrenamiento utilizando una plantilla inteligente según el tipo seleccionado.

---

## Elegir de mi biblioteca

Permite buscar cualquier entrenamiento previamente guardado.

Al seleccionarlo podrá:

- visualizarlo
- editarlo
- duplicarlo
- asignarlo

---

## Duplicar entrenamiento existente

Permite crear rápidamente una copia de un entrenamiento anterior para realizar pequeñas modificaciones.

---

# Paso 2 · Selección del tipo de entrenamiento

Si el entrenador decide crear un entrenamiento nuevo, el siguiente paso consiste en seleccionar su categoría.

Tipos iniciales:

- Rodaje
- Series
- Cuestas
- Umbral
- Competición
- Fuerza
- Técnica
- Recuperación
- Personalizado

Cada tipo dispondrá de una plantilla inicial distinta.

---

# Paso 3 · Plantilla inteligente

La aplicación nunca abrirá un entrenamiento vacío.

Según el tipo seleccionado generará automáticamente una estructura inicial.

Ejemplo:

## Rodaje

- Calentamiento
- Rodaje principal
- Progresivos
- Vuelta a la calma

---

## Series

- Calentamiento
- Activación
- Bloque principal
- Recuperaciones
- Enfriamiento

---

## Fuerza

- Movilidad
- Circuito principal
- Core
- Estiramientos

---

Estas plantillas únicamente sirven como punto de partida.

Todo podrá modificarse posteriormente.

---

# Paso 4 · Editor de bloques

Una vez creada la plantilla se abrirá el editor principal.

El editor utilizará el mismo concepto visual empleado por Garmin y COROS:

bloques anidados.

Cada bloque podrá:

- editarse
- duplicarse
- eliminarse
- mover su posición
- contener otros bloques

Ejemplo:

```
Calentamiento

↓

4 rectas

↓

6 × 800

↓

Recuperación

↓

Vuelta a la calma
```

Toda la edición deberá realizarse mediante componentes gráficos.

Evitar formularios largos.

---

# Paso 5 · Personalización

Una vez finalizada la estructura, el entrenador podrá completar la información general.

Campos:

- Nombre
- Objetivo
- Notas
- Kilómetros previstos
- Tiempo estimado (opcional)
- Etiquetas futuras

Estos datos complementan el entrenamiento, pero no forman parte de su estructura.

---

# Paso 6 · Finalización

Al completar el entrenamiento, el entrenador deberá decidir qué hacer.

Opciones disponibles:

## Guardar en biblioteca

El entrenamiento quedará disponible para reutilizarlo posteriormente.

---

## Asignar a un atleta

La aplicación redirigirá automáticamente al flujo de asignación.

No será necesario volver al menú principal.

---

## Asignar a un grupo

Se abrirá el asistente de asignación múltiple.

Posteriormente podrán realizarse modificaciones individuales para cada atleta.

---

## Planificar semana

Permitirá colocar inmediatamente el entrenamiento dentro de una planificación semanal.

---

## Continuar editando

Regresa al editor sin abandonar el flujo.

---

# Biblioteca personal

Cada entrenador dispone de una biblioteca privada.

Los entrenamientos pertenecen exclusivamente a su creador.

Un entrenador nunca podrá visualizar los entrenamientos almacenados por otro entrenador.

Cada entrenamiento podrá:

- editarse
- duplicarse
- archivarse
- eliminarse
- asignarse

---

# Relación con la planificación

La planificación nunca modifica el entrenamiento original.

Siempre genera una copia.

```
Biblioteca

↓

Entrenamiento

↓

Asignación

↓

Entrenamiento asignado

↓

Personalización individual

↓

Atleta
```

De esta forma:

- la biblioteca permanece intacta
- cada atleta recibe una copia independiente
- cualquier modificación posterior afecta únicamente al entrenamiento asignado

---

# Personalización por atleta

Cuando un entrenamiento se asigna a varios atletas:

Todos reciben inicialmente la misma estructura.

Posteriormente el entrenador podrá modificar únicamente la copia de un atleta concreto.

Ejemplos:

- cambiar kilómetros
- modificar ritmos
- añadir una serie
- eliminar un bloque
- cambiar recuperaciones

El resto de atletas no se verán afectados.

---

# Integración con las zonas del atleta

Los entrenamientos utilizarán siempre zonas deportivas.

Ejemplo:

```
6 × 1000 m

Zona Z4

Recuperación Z1
```

Nunca almacenarán ritmos absolutos.

Durante la asignación, el sistema traducirá automáticamente dichas zonas utilizando el histórico vigente del atleta en la fecha del entrenamiento.

Esto permitirá mantener la coherencia cuando un atleta actualice sus zonas tras nuevos tests.

---

# Principios de usabilidad

El entrenador debe poder crear un entrenamiento habitual en menos de dos minutos.

Para conseguirlo:

- nunca comenzar desde una pantalla vacía;
- minimizar el uso del teclado;
- utilizar botones grandes;
- reutilizar entrenamientos existentes;
- mostrar únicamente la información necesaria en cada paso;
- mantener una única decisión por pantalla.

---

# Objetivo final

El proceso de creación de entrenamientos debe transmitir la sensación de que la aplicación acompaña al entrenador durante todo el proceso.

MindPace no pretende ser un editor complejo.

Pretende ser un asistente inteligente que permita transformar una idea en un entrenamiento listo para enviar al atleta con el menor número posible de acciones.