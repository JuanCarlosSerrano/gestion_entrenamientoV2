# 08 · Flujos Funcionales — MindPace V2

## Objetivo

Este documento describe los flujos principales de uso de MindPace V2 pantalla por pantalla.

Su finalidad es servir como guía directa para el desarrollo de la interfaz y evitar construir pantallas aisladas sin conexión con el flujo real de trabajo del entrenador y del atleta.

MindPace debe permitir completar el ciclo:

**Planificar → Personalizar → Comunicar → Ejecutar → Revisar → Recordar**

---

# Principios de los flujos

## 1. Tablet primero

Los flujos están pensados para que el entrenador pueda trabajar cómodamente desde tablet, con botones grandes, pocos campos de texto y navegación táctil.

## 2. Pocos pasos

Cada flujo debe completarse con el menor número posible de pantallas.

## 3. Sin formularios largos

Cuando una tarea sea compleja, se dividirá en pasos guiados.

## 4. Siempre volver al Centro de Control

El Centro de Control será el punto de entrada y retorno natural del entrenador.

---

# Flujo 1 · Centro de Control del entrenador

## Objetivo

Permitir que el entrenador inicie rápidamente cualquier tarea importante y vea avisos relevantes.

## Pantallas

1. Login
2. Centro de Control

## Flujo

```text
Login
  ↓
Centro de Control
  ↓
Elegir acción principal
```

## Centro de Control

Debe mostrar:

- Planificar semana
- Crear entrenamiento
- Gestionar atletas
- Historial y rendimiento
- Centro de actividad
- Configuración

## Columna lateral

Debe mostrar actividad reciente:

- feedback nuevo;
- FIT recibido;
- molestias;
- RPE alto;
- entrenamientos sin revisar;
- sesiones sin feedback;
- entrenamientos pendientes de envío.

## Resultado

El entrenador puede iniciar una acción en menos de 10 segundos.

---

# Flujo 2 · Crear entrenamiento guiado

## Objetivo

Crear una plantilla reutilizable de entrenamiento.

## Pantallas

1. Centro de Control
2. Crear entrenamiento
3. Tipo de entrenamiento
4. Construcción por bloques
5. Revisión
6. Guardado

## Flujo

```text
Centro de Control
  ↓
Crear entrenamiento
  ↓
Seleccionar tipo
  ↓
Añadir bloques
  ↓
Definir objetivos
  ↓
Revisar resumen
  ↓
Guardar plantilla
```

## Paso 1 · Tipo

Opciones:

- Rodaje
- Series
- Umbral
- Cuestas
- Fuerza
- Técnica
- Competición
- Descanso

## Paso 2 · Bloques

Debe permitir añadir:

- calentamiento;
- bloque principal;
- recuperación;
- vuelta a la calma;
- observaciones.

## Paso 3 · Objetivos

Debe permitir definir:

- distancia;
- tiempo;
- repeticiones;
- recuperación;
- zona;
- intensidad;
- ritmo VDOT.

## Resultado

Se crea un registro en:

- `entrenamientos`
- `entrenamientos_detalle`

---

# Flujo 3 · Planificar semana

## Objetivo

Planificar una semana completa para un atleta, grupo o subgrupo.

## Pantallas

1. Centro de Control
2. Planificar semana
3. Selección de destinatario
4. Selección de semana
5. Editor semanal
6. Revisión semanal
7. Guardado

## Flujo

```text
Centro de Control
  ↓
Planificar semana
  ↓
Elegir atleta / grupo / subgrupo
  ↓
Elegir semana
  ↓
Crear desde cero / copiar semana / usar plantilla
  ↓
Añadir entrenamientos
  ↓
Revisar semana
  ↓
Guardar planificación
```

## Editor semanal

Debe permitir:

- añadir entrenamientos por día;
- doble sesión;
- arrastrar o seleccionar sesiones;
- copiar sesiones;
- eliminar sesiones;
- ver km previstos;
- ver número de sesiones.

## Resultado

La semana queda planificada y preparada para asignar o enviar.

---

# Flujo 4 · Asignar entrenamiento a atletas

## Objetivo

Convertir una plantilla o sesión planificada en entrenamientos personalizados.

## Pantallas

1. Selección de entrenamiento
2. Selección de atletas
3. Personalización automática
4. Revisión
5. Confirmación

## Flujo

```text
Seleccionar entrenamiento
  ↓
Elegir atleta / grupo / subgrupo
  ↓
Consultar zonas vigentes
  ↓
Generar copia personalizada
  ↓
Revisar objetivos por atleta
  ↓
Confirmar asignación
```

## Personalización

El sistema debe:

- consultar las zonas vigentes del atleta;
- calcular ritmos o tiempos;
- crear una copia independiente;
- guardar referencia a la configuración de zonas utilizada;
- congelar los valores calculados.

## Resultado

Se crean registros en:

- `entrenamientos_asignados`
- `entrenamientos_asignados_detalle`

---

# Flujo 5 · Gestionar visibilidad

## Objetivo

Controlar cuándo puede ver el atleta un entrenamiento asignado.

## Estados

- Oculto
- Visible
- Programado

## Flujo

```text
Entrenamiento asignado
  ↓
Seleccionar visibilidad
  ↓
Oculto / Visible / Programado
  ↓
Guardar
```

## Reglas

- Todo entrenamiento asignado nace oculto por defecto.
- El atleta no puede verlo hasta que el entrenador lo active.
- Si está programado, solo será visible al llegar la fecha y hora.
- Cambiar visibilidad no modifica el contenido del entrenamiento.

---

# Flujo 6 · Enviar entrenamiento por WhatsApp

## Objetivo

Enviar al atleta un entrenamiento limpio sin capturas de Excel o libreta.

## Pantallas

1. Entrenamiento asignado
2. Vista previa del mensaje
3. Acción de envío
4. Registro del envío

## Flujo

```text
Abrir entrenamiento asignado
  ↓
Enviar por WhatsApp
  ↓
Generar mensaje
  ↓
Revisar mensaje
  ↓
Copiar / abrir WhatsApp
  ↓
Registrar envío
```

## Mensaje generado

Debe incluir:

- fecha;
- nombre del entrenamiento;
- bloques principales;
- objetivo;
- recuperación;
- observaciones;
- enlace al entrenamiento.

## Resultado

Se crea registro en:

- `entrenamientos_envios`

---

# Flujo 7 · Atleta recibe entrenamiento

## Objetivo

Permitir que el atleta entienda el entrenamiento desde móvil.

## Pantallas

1. WhatsApp
2. Vista simple del entrenamiento
3. Feedback

## Flujo

```text
WhatsApp
  ↓
Abrir enlace
  ↓
Ver entrenamiento
  ↓
Realizar sesión
  ↓
Enviar feedback
```

## Vista del atleta

Debe mostrar:

- fecha;
- nombre;
- bloques;
- ritmos;
- recuperación;
- observaciones;
- botón de feedback.

No debe mostrar:

- menús administrativos;
- estadísticas complejas;
- configuración;
- información de otros atletas.

---

# Flujo 8 · Atleta envía feedback y FIT

## Objetivo

Registrar lo que ocurrió después del entrenamiento.

## Pantallas

1. Vista del entrenamiento
2. Formulario de feedback
3. Subida FIT
4. Confirmación

## Flujo

```text
Entrenamiento
  ↓
Enviar feedback
  ↓
Completado / no completado
  ↓
RPE
  ↓
Fatiga
  ↓
Molestias
  ↓
Comentario
  ↓
Subir FIT
  ↓
Enviar
```

## Datos

Debe registrar:

- comentario;
- RPE;
- sensación;
- fatiga;
- dolor;
- zona de dolor;
- completado;
- archivo FIT.

## Resultado

Se actualizan o crean registros en:

- `feedbacks`
- `sesiones_realizadas`
- `sesion_archivos`
- `sesion_metricas`

---

# Flujo 9 · Procesar FIT

## Objetivo

Extraer datos reales del entrenamiento.

## Flujo

```text
FIT recibido
  ↓
Guardar archivo
  ↓
Procesar
  ↓
Extraer métricas
  ↓
Guardar sesión realizada
  ↓
Actualizar comparación
```

## Métricas iniciales

- distancia;
- duración;
- ritmo medio;
- FC media;
- FC máxima;
- cadencia;
- potencia;
- tiempo por zonas;
- distancia por zonas.

## Resultado

El archivo FIT queda conectado al entrenamiento asignado.

---

# Flujo 10 · Revisión del entrenador

## Objetivo

Permitir que el entrenador revise sesiones que requieren atención.

## Pantallas

1. Centro de Control
2. Centro de actividad
3. Detalle de sesión
4. Comparación planificado vs realizado
5. Marcar como revisado

## Flujo

```text
Centro de Control
  ↓
Actividad pendiente
  ↓
Abrir sesión
  ↓
Ver planificado vs realizado
  ↓
Leer feedback
  ↓
Revisar FIT
  ↓
Marcar como revisado
```

## Debe mostrar

- entrenamiento planificado;
- entrenamiento realizado;
- diferencias;
- comentario;
- RPE;
- molestias;
- archivo FIT;
- estado de revisión.

## Resultado

El entrenador entiende qué ocurrió y puede actuar.

---

# Flujo 11 · Historial y rendimiento

## Objetivo

Consultar información antigua de un atleta.

## Pantallas

1. Centro de Control
2. Historial y rendimiento
3. Selección de atleta
4. Filtros
5. Detalle histórico

## Flujo

```text
Centro de Control
  ↓
Historial y rendimiento
  ↓
Elegir atleta
  ↓
Filtrar sesiones
  ↓
Abrir sesión histórica
  ↓
Consultar planificación + feedback + FIT
```

## Filtros

Debe permitir buscar por:

- fecha;
- tipo de entrenamiento;
- distancia;
- zona;
- molestias;
- RPE;
- competición;
- VDOT;
- grupo.

## Resultado

El entrenador puede recuperar información sin buscar en WhatsApp, Excel o libretas.

---

# Flujo 12 · Alertas y centro de actividad

## Objetivo

Priorizar lo que necesita revisión.

## Flujo

```text
Nuevo feedback / FIT / evento
  ↓
Evaluar reglas
  ↓
Crear alerta o actividad
  ↓
Mostrar en Centro de Control
  ↓
Entrenador abre alerta
  ↓
Resuelve o descarta
```

## Tipos de alerta

- RPE alto;
- fatiga elevada;
- molestias;
- entrenamiento incompleto;
- falta de feedback;
- FIT pendiente de procesamiento;
- desviación planificado vs realizado;
- exceso de carga.

## Resultado

El entrenador sabe qué revisar primero.

---

# Flujo 13 · Gestionar atletas

## Objetivo

Administrar los atletas del entrenador.

## Pantallas

1. Centro de Control
2. Gestionar atletas
3. Lista de atletas
4. Ficha de atleta

## Flujo

```text
Centro de Control
  ↓
Gestionar atletas
  ↓
Ver atletas propios
  ↓
Abrir ficha
  ↓
Editar datos / ver historial / ver zonas
```

## Reglas

- Un entrenador solo ve sus atletas.
- No puede acceder a atletas de otro entrenador.
- La ficha debe mostrar grupo, subgrupo, zonas, historial y contacto.

---

# Flujo 14 · Actualizar zonas del atleta

## Objetivo

Registrar nuevas zonas o VDOT sin perder histórico.

## Pantallas

1. Ficha de atleta
2. Zonas de entrenamiento
3. Nuevo test / nueva configuración
4. Confirmación

## Flujo

```text
Ficha atleta
  ↓
Zonas
  ↓
Añadir nueva configuración
  ↓
Definir método / VDOT / ritmos
  ↓
Fecha inicio
  ↓
Cerrar configuración anterior
  ↓
Guardar nueva
```

## Reglas

- Las zonas antiguas no se borran.
- Solo una configuración debe estar vigente para una fecha.
- Los entrenamientos ya asignados no cambian.
- Las nuevas zonas solo afectan a futuras asignaciones.

---

# Flujo 15 · Buscar sesión antigua

## Objetivo

Permitir al entrenador recuperar sesiones concretas.

## Flujo

```text
Historial
  ↓
Buscar atleta
  ↓
Aplicar filtro
  ↓
Abrir sesión
  ↓
Ver qué se planificó y qué ocurrió
```

## Ejemplos de búsqueda

- “series de 800”
- “entrenamientos con molestias”
- “sesiones con RPE 9”
- “semana previa al campeonato”
- “entrenamientos en zona 4”

## Resultado

MindPace sustituye la memoria dispersa de WhatsApp y Excel.

---

# Orden recomendado de desarrollo

## Sprint 1

- Flujo 1 · Centro de Control
- Flujo 13 · Gestionar atletas básico

## Sprint 2

- Flujo 2 · Crear entrenamiento guiado
- Flujo 4 · Asignar entrenamiento

## Sprint 3

- Flujo 3 · Planificar semana
- Flujo 5 · Gestionar visibilidad

## Sprint 4

- Flujo 6 · Enviar WhatsApp
- Flujo 7 · Vista atleta

## Sprint 5

- Flujo 8 · Feedback + FIT
- Flujo 9 · Procesamiento FIT

## Sprint 6

- Flujo 10 · Revisión entrenador
- Flujo 12 · Centro de actividad

## Sprint 7

- Flujo 11 · Historial y rendimiento
- Flujo 15 · Buscar sesión antigua

## Sprint 8

- Flujo 14 · Actualizar zonas del atleta
- Consolidación de estadísticas
