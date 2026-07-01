# 00 · Visión de Producto — MindPace

## 1. Propósito del proyecto

MindPace nace para sustituir el flujo de trabajo habitual de muchos entrenadores de atletismo:

**libreta o Excel → foto → WhatsApp → atleta → feedback disperso o perdido.**

El objetivo no es crear una aplicación compleja de análisis deportivo desde el primer día, sino digitalizar el proceso real que ya utilizan los entrenadores, manteniendo su sencillez y añadiendo orden, trazabilidad y análisis.

MindPace debe permitir que un entrenador pueda:

* crear entrenamientos de forma rápida y guiada;
* planificar semanas completas para atletas o grupos;
* enviar los entrenamientos por WhatsApp en un formato limpio;
* recibir feedback del atleta junto con el archivo FIT;
* revisar qué se planificó, qué se hizo realmente y qué sensaciones tuvo el atleta;
* consultar el historial meses después sin depender de conversaciones antiguas, fotos, hojas de cálculo o libretas.

La aplicación debe ahorrar tiempo al entrenador y conservar información que hoy normalmente se pierde.

---

## 2. Problema que resuelve

Actualmente muchos entrenadores trabajan así:

1. Preparan los entrenamientos en una libreta, Excel o documento personal.
2. Hacen una foto o copian el texto.
3. Lo envían al atleta o grupo por WhatsApp.
4. El atleta responde con sensaciones, tiempos o capturas.
5. La información queda repartida entre WhatsApp, archivos FIT, hojas sueltas y memoria del entrenador.

Este sistema funciona porque es rápido, pero tiene problemas claros:

* es difícil saber qué entrenamiento recibió cada atleta hace meses;
* el feedback queda desordenado;
* las sensaciones del atleta se pierden;
* los archivos FIT no quedan conectados al entrenamiento planificado;
* comparar planificado vs realizado requiere mucho trabajo manual;
* revisar la evolución de un atleta depende demasiado de la memoria del entrenador;
* planificar para grupos grandes consume mucho tiempo.

MindPace debe resolver estos problemas sin obligar al entrenador a cambiar radicalmente su manera de trabajar.

---

## 3. Propuesta de valor

MindPace digitaliza el flujo real del entrenador de atletismo.

No intenta sustituir al entrenador ni decidir por él. Su función es ayudarle a trabajar más rápido, con más orden y con mejor información.

La propuesta de valor principal es:

> MindPace permite al entrenador planificar, enviar y revisar entrenamientos desde un único lugar, manteniendo WhatsApp como canal de comunicación con el atleta y guardando todo el historial de planificación, ejecución y sensaciones.

---

## 4. Usuarios principales

### 4.1 Entrenador

Es el usuario principal de la aplicación.

Necesita:

* crear entrenamientos rápido;
* planificar semanas;
* asignar entrenamientos a atletas o grupos;
* enviar el entrenamiento de forma sencilla;
* revisar feedback;
* detectar atletas con molestias, fatiga o entrenamientos incompletos;
* consultar históricos;
* ver estadísticas útiles sin perderse en datos innecesarios.

El entrenador no quiere rellenar formularios largos. Quiere que la aplicación le guíe.

---

### 4.2 Atleta

El atleta no debe sentir que usa una aplicación compleja.

Necesita:

* recibir el entrenamiento de forma clara;
* poder abrirlo desde WhatsApp;
* entender qué tiene que hacer;
* subir el archivo FIT;
* indicar sensaciones, RPE, fatiga, molestias y comentarios;
* consultar su historial y evolución básica.

El atleta debe tener una experiencia móvil, rápida y limpia.

---

## 5. Principios del producto

### 5.1 La aplicación debe guiar, no obligar

MindPace no debe mostrar formularios enormes al entrenador.

Cada flujo importante debe funcionar como un asistente por pasos:

* crear entrenamiento;
* planificar semana;
* asignar entrenamiento;
* enviar por WhatsApp;
* revisar feedback;
* consultar estadísticas.

El entrenador debe sentir que la aplicación le acompaña.

---

### 5.2 WhatsApp forma parte del flujo

MindPace no debe luchar contra WhatsApp.

Los entrenadores ya usan WhatsApp porque es rápido, universal y cómodo. La aplicación debe aprovecharlo.

El entrenamiento debe poder enviarse por WhatsApp en un formato limpio, con enlace al detalle del entrenamiento.

Ejemplo:

🏃 Martes 8 julio
6 x 800 m
Objetivo: 2:27
Recuperación: 2'
Observaciones: última repetición controlada.

Abrir entrenamiento: enlace

---

### 5.3 Todo entrenamiento debe quedar registrado

Cada entrenamiento enviado debe quedar guardado con:

* atleta;
* fecha;
* contenido;
* ritmos o zonas planificadas;
* entrenador que lo asignó;
* estado de envío;
* feedback recibido;
* archivo FIT asociado;
* comparación planificado vs realizado.

La aplicación debe responder fácilmente a preguntas como:

* ¿Qué hizo este atleta hace tres meses?
* ¿Qué sesiones de 800 hizo este año?
* ¿Qué sensaciones tuvo antes de una competición?
* ¿Cuándo apareció una molestia?
* ¿Qué entrenamiento estaba planificado y qué hizo realmente?

---

### 5.4 La información importante debe volver al entrenador

El entrenador no debe buscar entre muchas pantallas para saber qué revisar.

La página principal debe mostrar acciones y avisos importantes:

* crear entrenamiento;
* planificar semana;
* gestionar atletas;
* historial y rendimiento;
* alertas y feedback;
* entrenamientos pendientes de revisión;
* atletas con molestias;
* sesiones no completadas;
* FIT subidos sin analizar.

La home debe funcionar como centro de mando.

---

### 5.5 La aplicación debe evitar el desarrollo eterno

MindPace debe avanzar por fases cerradas.

Cada fase debe entregar valor real y usable.

No se debe añadir una funcionalidad nueva si no ayuda directamente a uno de estos objetivos:

1. planificar más rápido;
2. comunicar mejor;
3. guardar el historial;
4. revisar mejor el entrenamiento;
5. entender la evolución del atleta.

---

## 6. Flujo ideal del entrenador

### 6.1 Pantalla principal

Al entrar, el entrenador ve botones grandes con las acciones principales:

* Crear entrenamiento
* Planificar semana
* Gestionar atletas
* Historial y rendimiento
* Alertas y feedback
* Configuración

La pantalla inicial no debe parecer una tabla administrativa. Debe parecer una herramienta de trabajo rápida.

---

### 6.2 Crear entrenamiento

El entrenador pulsa “Crear entrenamiento”.

La aplicación le guía:

1. Tipo de entrenamiento:

   * rodaje;
   * series;
   * umbral;
   * competición;
   * fuerza;
   * técnica;
   * descanso.

2. Estructura:

   * calentamiento;
   * bloque principal;
   * recuperación;
   * vuelta a la calma.

3. Parámetros:

   * distancia;
   * repeticiones;
   * recuperación;
   * zona;
   * ritmo VDOT;
   * observaciones.

4. Guardado:

   * guardar como entrenamiento único;
   * guardar como plantilla reutilizable;
   * añadir a biblioteca.

---

### 6.3 Planificar semana

El entrenador pulsa “Planificar semana”.

La aplicación le guía:

1. Elegir atleta, grupo o subgrupo.
2. Elegir semana.
3. Crear desde cero, copiar semana anterior o usar plantilla.
4. Añadir entrenamientos a cada día.
5. Aplicar ritmos personalizados si procede.
6. Revisar resumen semanal.
7. Guardar y preparar envío.

---

### 6.4 Asignar entrenamiento

La asignación debe ser rápida.

El entrenador debe poder:

* asignar a un atleta;
* asignar a varios atletas;
* asignar a un grupo;
* modificar ritmos por atleta;
* aplicar VDOT automáticamente;
* guardar la asignación como planificada.

Cuando un entrenamiento se asigna, debe generarse una versión concreta para cada atleta.

Ejemplo:

La plantilla dice:

6 x 800 m a ritmo I

Pero cada atleta recibe su propio objetivo:

* atleta A: 2:28
* atleta B: 2:35
* atleta C: 2:42

---

### 6.5 Enviar entrenamiento

El envío principal será por WhatsApp.

La aplicación debe generar un mensaje limpio, corto y entendible.

El entrenador puede copiarlo o abrir WhatsApp directamente.

El mensaje debe incluir:

* fecha;
* nombre del entrenamiento;
* estructura principal;
* ritmos o zonas;
* observaciones;
* enlace al entrenamiento.

---

## 7. Flujo ideal del atleta

### 7.1 Recepción

El atleta recibe el entrenamiento por WhatsApp.

No recibe una foto borrosa de una libreta ni una captura de Excel.

Recibe un mensaje claro con enlace.

---

### 7.2 Visualización

Al abrir el enlace, el atleta ve una pantalla móvil sencilla:

* entrenamiento del día;
* bloques;
* ritmos;
* recuperación;
* observaciones;
* botón para enviar feedback.

---

### 7.3 Feedback

Después del entrenamiento, el atleta puede enviar:

* archivo FIT;
* RPE;
* sensación general;
* fatiga;
* dolor o molestias;
* zona de dolor;
* comentario libre;
* completado o no completado.

El feedback debe quedar asociado al entrenamiento exacto.

---

## 8. Historial y rendimiento

Una de las funciones clave de MindPace será poder recuperar información antigua.

El entrenador debe poder consultar:

* entrenamientos enviados por atleta;
* entrenamientos enviados por grupo;
* sesiones similares;
* feedback histórico;
* molestias repetidas;
* rendimiento antes de competiciones;
* evolución semanal;
* comparación planificado vs realizado.

Esta sección no debe llamarse solo “Estadísticas”.

Debe llamarse:

**Historial y rendimiento**

Porque su valor no está solo en mostrar gráficos, sino en recordar lo que ocurrió.

---

## 9. Alertas

Las alertas deben ayudar al entrenador a decidir qué revisar primero.

Ejemplos:

* atleta con RPE alto;
* atleta con molestias;
* entrenamiento no completado;
* FIT subido pendiente de revisión;
* desviación alta entre planificado y realizado;
* demasiada carga en una semana;
* atleta sin feedback;
* varios días con fatiga elevada.

Las alertas no deben ser decorativas. Deben llevar a una acción concreta.

---

## 10. Funcionalidades clave de la V2

### Entrenador

* Home con botones grandes y acciones principales.
* Creación rápida y guiada de entrenamientos.
* Biblioteca de entrenamientos.
* Planificación semanal guiada.
* Asignación rápida a atletas o grupos.
* Envío por WhatsApp.
* Revisión de entrenamientos completados.
* Feedback y alertas.
* Historial y rendimiento.
* Estadísticas por atleta, grupo y semana.

---

### Atleta

* Recepción del entrenamiento por WhatsApp.
* Vista limpia del entrenamiento.
* Envío de feedback.
* Subida de archivo FIT.
* Consulta de historial.
* Estadísticas básicas personales.

---

### Sistema

* Registro de entrenamientos planificados.
* Registro de entrenamientos realizados.
* Asociación entre entrenamiento, feedback y archivo FIT.
* Comparación planificado vs realizado.
* Cálculo de zonas y ritmos personalizados.
* Historial consultable.
* Seguridad por rol: administrador, entrenador y atleta.

---

## 11. Qué NO debe ser MindPace

MindPace no debe convertirse en:

* un Excel dentro de una web;
* una aplicación llena de formularios interminables;
* una herramienta que obligue al entrenador a cambiar completamente su flujo;
* un sistema donde WhatsApp quede fuera;
* una plataforma con muchas métricas pero poca utilidad práctica;
* un desarrollo infinito sin fases cerradas.

---

## 12. Criterio para aceptar nuevas funcionalidades

Antes de añadir una nueva funcionalidad, debe responderse al menos una de estas preguntas:

1. ¿Ayuda al entrenador a planificar más rápido?
2. ¿Mejora la comunicación con el atleta?
3. ¿Permite guardar mejor el historial?
4. ¿Facilita revisar lo realizado frente a lo planificado?
5. ¿Ayuda a detectar problemas de fatiga, molestias o incumplimiento?
6. ¿Reduce trabajo manual?
7. ¿Hace más clara la experiencia del atleta?

Si la respuesta es no, la funcionalidad debe quedar fuera o ir al parking lot.

---

## 13. Objetivo de la V2

La V2 debe entregar un flujo completo y usable:

1. El entrenador crea o selecciona un entrenamiento.
2. Lo asigna a un atleta o grupo.
3. La aplicación personaliza ritmos si procede.
4. El entrenador lo envía por WhatsApp.
5. El atleta abre el enlace.
6. El atleta realiza el entrenamiento.
7. El atleta sube FIT y feedback.
8. El entrenador revisa alertas, sensaciones y comparación.
9. Todo queda guardado en el historial.

Si este flujo funciona bien, MindPace ya tendrá valor real aunque todavía no tenga todas las estadísticas avanzadas.

---

## 14. Frase guía del proyecto

MindPace debe sustituir la foto del Excel enviada por WhatsApp, pero sin perder la rapidez que hizo que ese sistema funcionara.

La aplicación debe ser:

* rápida;
* guiada;
* sencilla;
* útil;
* centrada en el entrenador;
* cómoda para el atleta;
* orientada al historial y al rendimiento.
