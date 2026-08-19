
# 01 · Hoja de Ruta — MindPace V2

## 0. Estado actual (auditoría 2026-08-19)

Esta hoja de ruta describía el plan cuando todo estaba por construir. A día de hoy la mayor parte ya está implementada en `main`; el detalle módulo a módulo, con evidencia en código, vive en `02_BACKLOG_FUNCIONAL.md` (incluye leyenda Hecho/Parcial/Pendiente). Resumen por fase:

| Fase | Estado |
|---|---|
| 0 · Reactivación y estabilización | Hecho |
| 1 · Nueva home del entrenador | Hecho |
| 2 · Creación guiada de entrenamientos | Hecho |
| 3 · Planificación semanal guiada | Hecho |
| 4 · Asignación rápida y personalización | Hecho |
| 5 · Envío por WhatsApp | Hecho |
| 6 · Vista simple del atleta | Hecho |
| 7 · Feedback y archivo FIT | Hecho |
| 8 · Revisión del entrenador | Parcial — piezas sueltas (feedback, alertas, análisis de atleta) sin pantalla única que las consolide |
| 9 · Historial y rendimiento | Hecho, integrado en Análisis de atleta y Estadísticas en vez de como pantalla separada |
| 10 · Alertas inteligentes | Hecho |
| 11 · Estadísticas avanzadas | Hecho |
| 12 · Pulido final de V2 | Pendiente |
| Bloque · Planificación individual por atleta | Hecho |
| Bloque · Publicación y comunicación | Hecho |
| Bloque · Configuración y gestión de atletas | Hecho |

Además existen pantallas construidas que no aparecen en ninguna fase de este documento (Grupos, Ciclos, Calendario, Gestión de plantillas, Análisis de atleta, Perfil de atleta, Editor de entrenamiento asignado) — ver Módulo 16 de `02_BACKLOG_FUNCIONAL.md`.

Consecuencia práctica: el trabajo pendiente real no es "seguir el orden de fases 0→12" tal como está escrito abajo, sino cerrar la Fase 8 (Revisión del entrenador) y luego la Fase 12 (pulido, navegación, limpieza, tests de los flujos principales). El resto del documento se conserva como referencia de diseño de cada fase, no como plan de ejecución vigente.

## 1. Decisión principal

MindPace V2 no se reinicia desde cero.

Se mantiene el núcleo actual de la aplicación:

- backend Flask;
- base de datos actual;
- sistema de usuarios y roles;
- atletas y entrenadores;
- entrenamientos;
- asignaciones;
- feedback;
- subida de archivos FIT;
- análisis planificado vs realizado;
- VDOT y zonas;
- tests existentes.

La nueva dirección del proyecto se aplicará mediante una evolución progresiva del producto, especialmente en la experiencia de usuario.

El objetivo no es tirar lo construido, sino convertir las funcionalidades actuales en un flujo sencillo, guiado y útil.

Nota: cuando este documento habla de fases futuras se refiere al producto V2 completo y a su experiencia de uso. Algunas capacidades técnicas ya existen parcial o mayoritariamente en el backend actual, pero todavía deben integrarse en el flujo guiado de la V2.

---

## 2. Objetivo de la V2

La V2 debe permitir que un entrenador pueda sustituir su flujo actual:

Excel o libreta → foto → WhatsApp → respuestas dispersas

por un flujo ordenado:

MindPace → planificación guiada → WhatsApp → feedback → FIT → historial → análisis.

La V2 estará terminada cuando un entrenador pueda:

1. crear un entrenamiento;
2. planificar una semana;
3. asignarla a un atleta o grupo;
4. personalizar ritmos si procede;
5. enviar el entrenamiento por WhatsApp;
6. recibir feedback y archivo FIT;
7. revisar lo planificado frente a lo realizado;
8. consultar el historial meses después.

---

## 3. Principio de desarrollo

Cada fase debe entregar valor real.

No se desarrollarán funcionalidades aisladas si no ayudan directamente a uno de estos objetivos:

- planificar más rápido;
- comunicar mejor con el atleta;
- guardar el historial;
- revisar mejor el entrenamiento;
- detectar problemas;
- reducir trabajo manual.

La aplicación no debe convertirse en un desarrollo eterno.

---

# Fase 0 · Reactivación y estabilización

## Objetivo

Asegurar que la base actual funciona antes de construir nuevas pantallas.

## Tareas

- Confirmar que la aplicación arranca correctamente.
- Confirmar que los tests pasan.
- Revisar `.gitignore`.
- Limpiar archivos locales no versionables.
- Guardar los cambios actuales en Git.
- Documentar la nueva visión del producto.
- Crear hoja de ruta actualizada.

## Criterio de cierre

- La aplicación arranca en local.
- Los tests pasan.
- Existe documentación base:
  - `00_VISION_PRODUCTO.md`
  - `01_HOJA_RUTA.md`

---

# Fase 1 · Nueva home del entrenador

## Objetivo

Convertir la pantalla inicial en un centro de acciones claro.

El entrenador no debe entrar y ver tablas o menús dispersos. Debe ver botones grandes con las acciones principales.

## Funcionalidades

- Nueva pantalla principal del entrenador.
- Botones grandes:
  - Crear entrenamiento
  - Planificar semana
  - Gestionar atletas
  - Historial y rendimiento
  - Alertas y feedback
  - Configuración
- Diseño limpio, profesional y orientado a móvil/escritorio.
- Acceso rápido a tareas pendientes.

## Criterio de cierre

El entrenador puede entrar en la aplicación y entender en pocos segundos qué puede hacer.

---

# Fase 2 · Creación guiada de entrenamientos

## Objetivo

Sustituir formularios complejos por un asistente paso a paso.

## Funcionalidades

- Asistente para crear entrenamiento.
- Selección de tipo:
  - rodaje;
  - series;
  - umbral;
  - competición;
  - fuerza;
  - técnica;
  - descanso.
- Definición de bloques:
  - calentamiento;
  - bloque principal;
  - recuperación;
  - vuelta a la calma.
- Parámetros:
  - distancia;
  - repeticiones;
  - recuperación;
  - zona;
  - ritmo VDOT;
  - observaciones.
- Guardar como:
  - entrenamiento único;
  - plantilla reutilizable.

## Criterio de cierre

El entrenador puede crear un entrenamiento completo sin rellenar un formulario largo.

---

# Fase 3 · Planificación semanal guiada

## Objetivo

Permitir que el entrenador planifique una semana completa de forma rápida.

## Funcionalidades

- Crear semana desde cero.
- Copiar semana anterior.
- Usar plantilla semanal.
- Seleccionar atleta, grupo o subgrupo.
- Añadir entrenamientos por día.
- Permitir doble sesión si procede.
- Guardar planificación semanal.
- Vista resumen semanal.

## Criterio de cierre

El entrenador puede planificar una semana completa para un atleta o grupo sin usar Excel.

---

# Fase 4 · Asignación rápida y personalización

## Objetivo

Asignar entrenamientos a atletas o grupos y generar una versión concreta para cada atleta.

## Funcionalidades

- Asignar entrenamiento a un atleta.
- Asignar entrenamiento a varios atletas.
- Asignar entrenamiento a grupo o subgrupo.
- Aplicar VDOT automáticamente.
- Calcular ritmos y tiempos objetivo.
- Guardar el VDOT usado en el momento de la asignación.
- Mantener histórico aunque el VDOT cambie después.

## Criterio de cierre

Una plantilla genérica como `6x800 @ I` se transforma en objetivos concretos para cada atleta.

---

# Fase 5 · Envío por WhatsApp

## Objetivo

Eliminar la foto del Excel o la libreta enviada por WhatsApp.

## Funcionalidades

- Generar mensaje limpio del entrenamiento.
- Incluir:
  - fecha;
  - nombre;
  - bloques principales;
  - ritmos o zonas;
  - recuperación;
  - observaciones;
  - enlace al entrenamiento.
- Botón para copiar mensaje.
- Botón para abrir WhatsApp.
- Registrar estado de envío.

## Criterio de cierre

El entrenador puede enviar un entrenamiento por WhatsApp sin hacer capturas ni copiar texto manualmente.

---

# Fase 6 · Vista simple del atleta

## Objetivo

Que el atleta vea el entrenamiento de forma clara desde el móvil.

## Funcionalidades

- Pantalla móvil limpia.
- Entrenamiento del día.
- Bloques claros.
- Ritmos y recuperaciones visibles.
- Observaciones del entrenador.
- Botón para enviar feedback.
- Acceso desde enlace de WhatsApp.

## Criterio de cierre

El atleta puede abrir el enlace recibido y entender el entrenamiento sin navegar por la aplicación.

---

# Fase 7 · Feedback y archivo FIT

## Objetivo

Conectar lo realizado con lo planificado.

## Funcionalidades

- Subida de archivo FIT.
- Comentario libre.
- RPE.
- Fatiga.
- Molestias.
- Zona de dolor.
- Entrenamiento completado o no completado.
- Asociación directa con el entrenamiento asignado.
- Guardado de métricas extraídas del FIT.

## Criterio de cierre

Cada entrenamiento puede tener feedback y FIT asociados.

---

# Fase 8 · Revisión del entrenador

## Objetivo

Que el entrenador pueda revisar rápidamente lo que necesita atención.

## Funcionalidades

- Feedback pendiente.
- FIT pendientes de revisión.
- Atletas con molestias.
- Entrenamientos no completados.
- RPE alto.
- Desviaciones importantes.
- Vista de detalle planificado vs realizado.

## Criterio de cierre

El entrenador sabe qué atletas necesita revisar primero.

---

# Fase 9 · Historial y rendimiento

## Objetivo

Permitir consultar lo ocurrido meses atrás.

## Funcionalidades

- Historial por atleta.
- Filtros por:
  - fecha;
  - tipo de entrenamiento;
  - distancia;
  - zona;
  - VDOT;
  - molestias;
  - competición.
- Comparación planificado vs realizado.
- Evolución semanal.
- Estadísticas básicas.

## Criterio de cierre

El entrenador puede responder preguntas como:

- qué hizo este atleta hace tres meses;
- qué sensaciones tuvo;
- qué FIT subió;
- qué ritmo estaba planificado;
- qué hizo realmente.

---

# Fase 10 · Alertas inteligentes

## Objetivo

Ayudar al entrenador a detectar problemas sin revisar todo manualmente.

## Funcionalidades

- Alertas por RPE alto.
- Alertas por fatiga repetida.
- Alertas por molestias.
- Alertas por entrenamiento no completado.
- Alertas por desviación planificado vs realizado.
- Alertas por falta de feedback.
- Alertas por exceso de carga.

## Criterio de cierre

La home del entrenador muestra avisos útiles y accionables.

---

# Fase 11 · Estadísticas avanzadas

## Objetivo

Convertir los datos acumulados en información útil.

## Funcionalidades

- Estadísticas por atleta.
- Estadísticas por grupo.
- Estadísticas semanales y mensuales.
- Km planificados vs realizados.
- Tiempo por zona.
- Distancia por zona.
- Evolución de VDOT.
- Evolución de sensaciones.
- Tendencias de fatiga y molestias.

## Criterio de cierre

El entrenador puede analizar la evolución de un atleta o grupo sin usar hojas externas.

---

# Fase 12 · Pulido final de V2

## Objetivo

Cerrar la V2 como una versión usable y coherente.

## Tareas

- Revisar navegación completa.
- Eliminar pantallas antiguas que ya no se usen.
- Mejorar diseño visual.
- Revisar responsive móvil.
- Revisar textos.
- Añadir tests mínimos de los flujos principales.
- Crear documentación de uso.
- Preparar backup y despliegue.

## Criterio de cierre

MindPace V2 puede usarse de principio a fin por un entrenador real.

---

## 4. Orden recomendado de desarrollo

1. Fase 0 — Reactivación y estabilización.
2. Fase 1 — Nueva home del entrenador.
3. Fase 2 — Creación guiada de entrenamientos.
4. Fase 3 — Planificación semanal guiada.
5. Fase 4 — Asignación rápida y personalización.
6. Fase 5 — Envío por WhatsApp.
7. Fase 6 — Vista simple del atleta.
8. Fase 7 — Feedback y archivo FIT.
9. Fase 8 — Revisión del entrenador.
10. Fase 9 — Historial y rendimiento.
11. Fase 10 — Alertas inteligentes.
12. Fase 11 — Estadísticas avanzadas.
13. Fase 12 — Pulido final.

---

## 5. Qué queda fuera de la V2

Para evitar un desarrollo infinito, quedan fuera de la V2 inicial:

- IA generativa avanzada;
- nutrición;
- pagos;
- aplicación móvil nativa;
- chat interno;
- integración directa con Garmin/Strava;
- predicción avanzada de marcas;
- gestión médica completa;
- marketplace de entrenadores.

Estas ideas pueden ir al parking lot para futuras versiones.

---

## 6. Criterio final de éxito

MindPace V2 tendrá éxito si consigue que un entrenador deje de usar Excel o libreta para planificar y deje de enviar fotos por WhatsApp, pero mantiene la misma rapidez y comodidad de comunicación con sus atletas.

---

# Bloque funcional · Gestión de planificación individual por atleta

## Objetivo

Permitir que el entrenador consulte y modifique exclusivamente la planificación futura o pendiente de un atleta concreto.

## Flujo

```text
Centro de Control
  ↓
Atletas
  ↓
Seleccionar atleta
  ↓
Calendario mensual
  ↓
Seleccionar día
  ↓
Modificar entrenamientos asignados
  ↓
Volver al calendario o al Centro de Control
```

## Alcance

- Selección de atleta con búsqueda y filtros.
- Calendario mensual de planificación.
- Días con sesiones planificadas visibles de forma compacta.
- Añadir, editar, mover, duplicar, eliminar y cambiar visibilidad de sesiones asignadas.

## Límites

Este bloque no incluye análisis, FIT, RPE, feedback, estadísticas ni rendimiento. Esa información pertenece a Historial y rendimiento.

La aplicación debe recordar lo que hoy se pierde.

---

# Bloque funcional · Publicación y comunicación

## Objetivo

Conectar la planificación asignada con la comunicación al atleta sin añadir pasos duplicados al Centro de Control.

## Flujo

```text
Entrenamiento asignado
  ↓
Oculto por defecto
  ↓
Pendientes de hoy > Publicar
  ↓
Publicar ahora o programar
  ↓
Visible
  ↓
Aviso WhatsApp preparado
```

## Alcance

- Todo entrenamiento nuevo de planificación nace oculto.
- El acceso al panel de publicación se hace desde el aviso existente `Pendientes de hoy -> Publicar`.
- La publicación inmediata registra `publicado_en` y genera un único aviso WhatsApp.
- La programación guarda `publicar_en` y mantiene el entrenamiento oculto hasta la fecha.
---

# Bloque · Configuración y gestión de atletas

## Objetivo

Centralizar la configuración operativa del entrenador sin mezclarla con planificación ni análisis.

## Alcance

- Alta guiada de atletas.
- Edición de datos básicos.
- Gestión de grupo, subgrupo y categoría.
- Activación y desactivación de atletas.
- Reset de contraseña temporal con cambio obligatorio.
- Consulta del histórico de zonas.
- Creación de nuevas configuraciones de VDOT, VAM y zonas.

## Criterio de cierre

- El entrenador solo gestiona sus propios atletas.
- Los atletas con historial no se eliminan físicamente.
- Las zonas anteriores se conservan al crear una nueva configuración.
- La pantalla mantiene la estética V2 y el uso tablet-first.

# Bloque funcional · Panel del atleta

Objetivo: ofrecer una experiencia simple, móvil y guiada para que el atleta entienda qué debe entrenar y pueda informar cómo ha ido.

Incluye Home, Mi planificación, detalle de entrenamiento, feedback guiado, FIT opcional, historial propio, evolución básica y perfil personal con campos deportivos en lectura.
