# 05 · Modelo del Dominio — MindPace V2

## Objetivo

Este documento define los conceptos principales del dominio de MindPace y las relaciones entre ellos.

No describe tablas SQL ni tecnologías concretas. Define los elementos del negocio sobre los que se construye toda la aplicación.

El objetivo es que cualquier evolución futura respete este modelo, independientemente de la implementación técnica.

---

# Principios del dominio

## 1. El atleta es el centro del sistema

Toda la información gira alrededor del atleta.

No se almacenan datos aislados.

Cada entrenamiento, feedback, archivo FIT o estadística debe estar relacionado con un atleta concreto.

---

## 2. Un entrenamiento existe en diferentes fases

Un mismo entrenamiento puede existir como:

Plantilla

↓

Entrenamiento planificado

↓

Entrenamiento asignado

↓

Entrenamiento realizado

↓

Histórico

No son entidades distintas desde el punto de vista funcional, sino diferentes estados de un mismo concepto.

---

## 3. Todo debe ser trazable

El sistema debe poder responder siempre:

- Qué entrenamiento se creó.
- Qué versión recibió el atleta.
- Qué VDOT tenía.
- Qué realizó realmente.
- Qué comentó.
- Qué métricas produjo.
- Qué ocurrió semanas o meses después.

---

# Entidades principales

---

# Usuario

Representa cualquier persona que utiliza el sistema.

## Tipos

- Administrador
- Entrenador
- Atleta

## Responsabilidades

Administrador

- Gestiona la aplicación.

Entrenador

- Gestiona atletas.
- Crea entrenamientos.
- Planifica semanas.
- Asigna entrenamientos.
- Analiza resultados.

Atleta

- Recibe entrenamientos.
- Consulta planificación.
- Envía feedback.
- Sube archivos FIT.

## Relaciones

Un entrenador puede gestionar muchos atletas.

Un atleta pertenece a un único entrenador.

---

# Entrenamiento (Plantilla)

Representa un entrenamiento reutilizable.

No pertenece a ningún atleta.

Es únicamente un modelo.

## Contiene

- Nombre
- Tipo
- Bloques
- Observaciones
- Objetivos
- Zonas
- Intensidades

## Puede reutilizarse

Sí.

Puede utilizarse cientos de veces.

Nunca debe modificarse una plantilla ya utilizada para alterar entrenamientos históricos.

---

# Entrenamiento asignado

Representa un entrenamiento concreto asignado a un atleta.

Es la entidad más importante del sistema.

## Se genera a partir de

Plantilla

+

Atleta

+

Fecha

+

VDOT vigente

=

Entrenamiento asignado

## Debe conservar

- Fecha
- Atleta
- Entrenador
- Plantilla utilizada
- VDOT utilizado
- Ritmos calculados
- Zonas utilizadas
- Observaciones
- Estado
- Fecha de envío
- Feedback asociado
- Archivo FIT asociado

Una vez creado, el entrenamiento asignado debe conservarse aunque posteriormente cambie la plantilla o el VDOT del atleta.

---

# Zonas de entrenamiento

Representan el perfil fisiológico del atleta.

No son una propiedad del entrenamiento.

Son una propiedad del atleta.

## Contienen

- VDOT
- Ritmos
- Tiempos
- Zonas
- Previsiones

## Función

Traducen una plantilla genérica:

6 × 800 @ I

en

6 × 800 @ 2:28

para un atleta concreto.

---

# Planificación semanal

Agrupa entrenamientos durante una semana.

## Puede pertenecer

- A un atleta
- A un grupo
- A un subgrupo

## Contiene

- Días
- Sesiones
- Observaciones
- Objetivos semanales

---

# Grupo

Permite organizar atletas.

## Un grupo puede contener

Muchos atletas.

## Un atleta pertenece

A un único grupo activo.

Puede pertenecer además a uno o varios subgrupos dentro de ese grupo, siempre que esos subgrupos no contradigan la relación principal entrenador-atleta.

---

# Feedback

Representa la respuesta del atleta tras completar un entrenamiento.

## Contiene

- Comentario
- RPE
- Sensación
- Fatiga
- Molestias
- Zona de dolor
- Entrenamiento completado

Siempre pertenece a un entrenamiento asignado.

Nunca existe un feedback sin entrenamiento.

---

# Archivo FIT

Representa los datos objetivos del entrenamiento realizado.

## Contiene

Información registrada por el dispositivo deportivo.

## Se utiliza para obtener

- Distancia
- Tiempo
- Ritmos
- Frecuencia cardíaca
- Potencia
- Cadencia
- Tiempo por zonas
- Distancia por zonas

Siempre pertenece a un entrenamiento asignado.

---

# Comparación

Representa la relación entre lo planificado y lo realizado.

## Entradas

- Entrenamiento asignado
- Feedback
- Archivo FIT

## Salidas

- Cumplimiento
- Desviaciones
- Resumen
- Indicadores

No necesita almacenarse completamente.

Puede calcularse cuando sea necesario.

---

# Historial

Representa la memoria deportiva del atleta.

No almacena datos nuevos.

Relaciona:

- Entrenamientos
- Feedback
- FIT
- Estadísticas
- Alertas

Su función es permitir consultar la evolución del atleta.

---

# Alerta

Representa una situación que requiere atención del entrenador.

## Ejemplos

- Fatiga elevada
- Molestias
- RPE alto
- Entrenamiento incompleto
- FIT pendiente
- Desviación importante

Las alertas siempre están asociadas a un atleta.

---

# Estadística

Representa información agregada.

Nunca sustituye a los datos originales.

Debe poder calcularse por:

- atleta;
- grupo;
- semana;
- mes;
- temporada.

---

# Relaciones principales

```text
Entrenador
│
├──────────────┐
│              │
▼              ▼
Grupo       Atleta
                 │
                 ▼
       Zonas de entrenamiento
                 │
                 ▼
      Entrenamiento (Plantilla)
                 │
                 ▼
     Entrenamiento asignado
        │        │        │
        │        │        │
        ▼        ▼        ▼
    Feedback    FIT   Comparación
        │
        └───────────────┐
                        ▼
                   Historial
                        │
                        ▼
                  Estadísticas
                        │
                        ▼
                     Alertas
```

---

# Estados del entrenamiento

Todo entrenamiento asignado evoluciona siguiendo este ciclo.

```
Plantilla

↓

Asignado

↓

Personalizado

↓

Enviado

↓

Visualizado

↓

Realizado

↓

Feedback recibido

↓

FIT recibido

↓

Revisado

↓

Histórico
```

---

# Reglas del dominio

## Regla 1

Una plantilla nunca pertenece a un atleta.

---

## Regla 2

Todo entrenamiento realizado procede de un entrenamiento asignado.

---

## Regla 3

El VDOT utilizado en una asignación queda congelado.

Los cambios posteriores del atleta no modifican entrenamientos ya enviados.

---

## Regla 4

Un feedback siempre pertenece a un único entrenamiento asignado.

---

## Regla 5

Un archivo FIT siempre pertenece a un único entrenamiento asignado.

---

## Regla 6

Las estadísticas nunca sustituyen a los datos originales.

Siempre pueden recalcularse.

---

## Regla 7

Las alertas nunca modifican información.

Solo ayudan al entrenador a detectar situaciones relevantes.

---

## Regla 8

El historial nunca debe perder información.

Debe permitir reconstruir exactamente qué recibió y realizó un atleta en cualquier momento de su trayectoria.

---

# Reglas de negocio

Las siguientes reglas son obligatorias en todo el sistema y cualquier desarrollo futuro deberá respetarlas.

---

## RN-001 · Propiedad de los entrenamientos

Todo entrenamiento pertenece a un único entrenador.

Un entrenador únicamente podrá visualizar, modificar o eliminar los entrenamientos que haya creado.

Los entrenamientos nunca serán compartidos automáticamente entre entrenadores.

El administrador podrá acceder únicamente con fines de mantenimiento.

---

## RN-002 · Biblioteca privada

Cada entrenador dispone de una biblioteca propia de entrenamientos.

La biblioteca es independiente del resto de entrenadores.

Las acciones permitidas son:

- crear
- editar
- duplicar
- archivar
- eliminar
- buscar
- clasificar

---

## RN-003 · Asignación de entrenamientos

Una plantilla nunca se entrega directamente al atleta.

Siempre debe existir una copia personalizada.

Flujo:

Plantilla

↓

Entrenamiento asignado

↓

Personalización

↓

Entrega al atleta

La plantilla original nunca se modifica.

---

## RN-004 · Personalización individual

Aunque un entrenamiento se asigne inicialmente a un grupo de atletas, cada copia será completamente independiente.

El entrenador podrá modificar únicamente la copia de un atleta sin afectar al resto.

Ejemplos:

- cambiar ritmos
- cambiar repeticiones
- eliminar una serie
- añadir observaciones
- modificar recuperaciones

---

## RN-005 · Visibilidad

Los entrenamientos asignados permanecen ocultos para el atleta hasta que el entrenador decida mostrarlos.

Existen tres estados posibles:

- Oculto
- Visible
- Programado

---

## RN-006 · Publicación programada

El entrenador podrá indicar una fecha y hora de publicación.

Mientras no llegue ese momento, el atleta no podrá acceder al entrenamiento.

Al alcanzarse la fecha programada, el entrenamiento pasará automáticamente a estado Visible.

---

## RN-007 · Envío por WhatsApp

El envío mediante WhatsApp nunca sustituye al entrenamiento asignado.

## RN-008 · Publicación de entrenamiento asignado

Todo entrenamiento asignado en la planificación V2 nace oculto. La visibilidad puede cambiarse con publicación inmediata o mediante programación.

La publicación y la comunicación son eventos relacionados: cuando un entrenamiento pasa a visible se registra `publicado_en` y se prepara el aviso en `entrenamientos_envios`.

El mensaje de WhatsApp no forma parte del entrenamiento. Es una comunicación independiente asociada al entrenamiento asignado.

Si el envío por WhatsApp falla, la publicación no se invalida ni se revierte. El entrenamiento permanece visible y el error de comunicación queda registrado para revisión o reintento.

El mensaje únicamente actúa como medio de comunicación.

La información oficial permanecerá almacenada en MindPace.

---

## RN-008 · Historial permanente

Una vez enviado un entrenamiento, la información quedará congelada.

Aunque posteriormente se modifique la plantilla original, el entrenamiento enviado conservará exactamente los datos originales.

---

## RN-009 · Relación entrenador-atleta

Un atleta pertenece a un único entrenador activo.

Un entrenador puede gestionar múltiples atletas.

Toda consulta realizada por el entrenador quedará limitada exclusivamente a sus atletas.

---

## RN-010 · Seguridad

El sistema impedirá:

- acceder a atletas de otro entrenador
- modificar entrenamientos de otro entrenador
- consultar historial ajeno
- editar feedback de atletas ajenos
- visualizar entrenamientos privados de otro entrenador

---

## RN-011 · Integridad deportiva

Todo entrenamiento asignado deberá conservar para siempre:

- la plantilla utilizada
- los ritmos calculados
- las zonas utilizadas
- el VDOT empleado
- la fecha de asignación

Esto permitirá reconstruir exactamente qué entrenamiento recibió el atleta en cualquier momento del futuro.

---

## RN-012 · Trazabilidad

Toda modificación importante deberá quedar registrada.

Como mínimo deberá conocerse:

- quién realizó la acción
- cuándo se realizó
- sobre qué entidad
- cuál fue el resultado

---

## RN-013 · El entrenador nunca trabaja directamente sobre el historial

Los entrenamientos ya realizados son inmutables.

Si el entrenador necesita cambiar una sesión futura deberá modificar únicamente las sesiones pendientes.

Nunca podrá alterarse la información histórica del atleta.

El historial deportivo constituye el registro oficial de la planificación y del entrenamiento realizado.

---

## RN-014 · Histórico de zonas del atleta

Las zonas de entrenamiento de un atleta deben conservarse históricamente.

Un atleta puede tener varias configuraciones de zonas a lo largo del tiempo, pero solo una debe estar vigente para una fecha concreta.

Cada registro de zonas debe incluir:

- atleta;
- método de cálculo;
- VDOT o VAM utilizado;
- ritmos o zonas resultantes;
- fecha de inicio de vigencia;
- fecha de fin de vigencia;
- fuente del cálculo;
- observaciones.

Cuando se asigna un entrenamiento, el sistema debe utilizar las zonas vigentes en la fecha de asignación o en la fecha prevista del entrenamiento.

El entrenamiento asignado debe guardar referencia a la configuración de zonas utilizada.

Los cambios posteriores en las zonas del atleta nunca deben modificar entrenamientos ya asignados o realizados.

Esto permite reconstruir correctamente qué ritmos correspondían a un atleta en cualquier momento histórico.

---

# Modelo conceptual

La filosofía de MindPace puede resumirse así:

Una plantilla representa el conocimiento del entrenador.

La personalización adapta ese conocimiento a cada atleta.

El entrenamiento asignado es la fotografía exacta de lo que se envió.

El feedback y el archivo FIT representan lo que realmente ocurrió.

El historial conecta toda esa información.

Las estadísticas y alertas ayudan al entrenador a tomar mejores decisiones sin sustituir su criterio profesional.

---

# Planificación individual del atleta

La ficha de planificación del atleta representa únicamente lo que el atleta tiene planificado.

## Tabla de trabajo

La vista trabaja exclusivamente con:

- `entrenamientos_asignados`
- `entrenamientos_asignados_detalle`

## Reglas

- Añadir una sesión desde biblioteca crea una copia asignada independiente.
- Editar una sesión individual modifica solo la asignación y su detalle.
- Mover una sesión cambia la fecha de `entrenamientos_asignados`.
- Cambiar mañana/tarde modifica la franja de la asignación.
- Cambiar visibilidad no modifica el contenido.
- La plantilla original nunca se modifica desde esta vista.

## Separación de dominio

Atletas / planificación responde:

```text
Qué tiene planificado el atleta.
```

Historial y rendimiento responde:

```text
Qué realizó el atleta y cómo respondió.
```
