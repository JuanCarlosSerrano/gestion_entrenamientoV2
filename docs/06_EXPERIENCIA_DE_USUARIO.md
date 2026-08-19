# 06 · EXPERIENCIA DE USUARIO (UX)

## Objetivo

Este documento define la experiencia que debe ofrecer MindPace al entrenador y al atleta.

No describe cómo implementar la interfaz.

Describe cómo debe sentirse utilizar la aplicación.

Todas las decisiones de diseño futuras deberán respetar este documento.

---

# Filosofía

MindPace no es un ERP.

No es un gestor administrativo.

No pretende mostrar toda la información posible.

MindPace es un asistente para entrenadores.

Debe ayudar a tomar decisiones rápidas.

El entrenador debe poder abrir la aplicación y comenzar a trabajar en menos de 10 segundos.

La interfaz debe eliminar pasos innecesarios.

Cada pantalla debe responder únicamente a una pregunta:

> ¿Qué necesita hacer ahora el entrenador?

---

# Principios de diseño

Toda la aplicación debe cumplir los siguientes principios.

## 1. Prioridad a la acción

La aplicación debe mostrar primero acciones.

Nunca información.

Ejemplo:

✔ Crear entrenamiento

✔ Planificar semana

✔ Gestionar atletas

y después

estadísticas

tablas

configuración

---

## 2. Un objetivo por pantalla

Cada pantalla debe tener un único propósito.

Incorrecto

Crear entrenamiento + estadísticas + atletas + configuración

Correcto

Crear entrenamiento.

Nada más.

---

## 3. Flujo guiado

El entrenador nunca debe rellenar formularios enormes.

Todas las tareas importantes estarán divididas en pasos.

Ejemplo

Crear entrenamiento

↓

Información básica

↓

Construcción del entrenamiento

↓

Revisión

↓

Guardar

---

## 4. Reducir escritura

Siempre que sea posible se utilizarán

botones

listas

selección

drag & drop

chips

calendarios

Nunca campos de texto si pueden evitarse.

---

## 5. Pensado para tablet

MindPace se diseña primero para tablet.

Después se adapta a escritorio.

No al revés.

Toda la interfaz debe poder utilizarse cómodamente con el dedo.

---

# Dispositivos objetivo

Prioridad

1. Tablet horizontal (11"-13")
2. Portátil
3. Monitor
4. Móvil (principalmente atletas)

---

# Pantalla principal del entrenador

La Home es el centro de operaciones.

No es un dashboard.

No es un menú.

Su objetivo es iniciar acciones.

Debe estar formada por tres zonas.

---

## Zona izquierda

Acciones principales.

Grandes tarjetas.

Ejemplo

📅 Planificar semana

🏃 Crear entrenamiento

👥 Gestionar atletas

📊 Rendimiento

🔔 Centro de actividad

---

## Zona central

Contenido dinámico.

Dependiendo de la acción elegida.

Nunca permanece fija.

---

## Zona derecha

Centro de actividad.

Debe mostrar únicamente información que requiere atención.

Ejemplos

Nuevo feedback

Nuevo FIT

Molestias

RPE elevado

Entrenamientos pendientes

Semanas sin asignar

Nunca mostrará información histórica.

---

# Tarjetas

Toda acción importante será una tarjeta.

Una tarjeta contiene

Icono

Título

Descripción corta

Estado (opcional)

Acción

Ejemplo

📅

Planificar semana

Continúa la planificación actual.

Semana 8

4 atletas pendientes.

---

# Navegación

MindPace elimina menús complejos.

La navegación debe requerir el menor número posible de clics.

Objetivo

Cualquier acción frecuente debe realizarse en menos de tres clics.

---

# Menú lateral

Debe ser permanente.

Muy sencillo.

Solo iconos y texto.

Nunca más de ocho opciones.

---

# Colores

Los colores tienen significado.

No son decorativos.

Verde

Acción completada

Azul

Información

Naranja

Advertencia

Rojo

Problema que requiere atención

Gris

Información secundaria

---

# Tipografía

Debe priorizar la lectura rápida.

Títulos grandes.

Mucho espacio en blanco.

Evitar bloques largos de texto.

---

# Iconografía

Toda acción importante tendrá un icono.

Los iconos deben repetirse siempre con el mismo significado.

Nunca cambiar.

---

# Espaciado

La interfaz debe respirar.

Se prioriza espacio en blanco frente a mostrar más información.

---

# Centro de actividad

El antiguo concepto de "Alertas" desaparece.

Se sustituye por un Centro de actividad.

Su función es reunir todos los eventos relevantes.

Ejemplos

Carlos ha enviado un FIT.

Lucía informa de molestias.

Pedro no ha enviado feedback.

Nueva semana pendiente.

Todo aparecerá ordenado cronológicamente.

---

# Accesos rápidos

La parte inferior de la Home podrá mostrar accesos rápidos.

Último entrenamiento editado

Plantillas recientes

Buscar atleta

Calendario

Semana actual

---

# Experiencia del entrenador

El entrenador debe sentir que:

la aplicación le guía

la aplicación recuerda lo que estaba haciendo

la aplicación reduce trabajo administrativo

la aplicación nunca obliga a buscar funciones

---

# Experiencia del atleta

El atleta debe percibir MindPace como una extensión de WhatsApp.

Recibe el entrenamiento.

Lo entiende en pocos segundos.

Entrena.

Sube el FIT.

Envía feedback.

No necesita aprender a utilizar la aplicación.

---

# Regla de oro

Antes de añadir cualquier nueva funcionalidad deberá responderse esta pregunta:

> ¿Hace que el entrenador necesite menos tiempo para entrenar mejor a sus atletas?

Si la respuesta es no, la funcionalidad deberá replantearse.
