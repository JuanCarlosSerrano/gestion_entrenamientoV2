# 13 · Próximos pasos y alcance de Análisis — MindPace V2

Fecha: 2026-08-20. Escrito tras la ronda de hardening de hoy (ver `docs/01_HOJA_RUTA.md`, actualización 2026-08-20) para responder a dos preguntas concretas: **¿cuándo pasamos a Análisis?** y **¿qué debería incluir Análisis para no desviar la aplicación de su identidad?**

## 1. Cuándo pasamos a Análisis: no es una fecha, es una condición

El criterio ya estaba fijado desde el 19/08 (`01_HOJA_RUTA.md`): los tres pilares (crear entrenamiento, planificar, gestionar atletas) tienen que estar "sólidos y probados" antes de invertir esfuerzo en Análisis. Hoy se ha probado ese criterio de verdad: con uso real en producción aparecieron ~20 fallos, incluida una fuga de seguridad real y dos incidentes de datos, todos corregidos.

Eso no significa que hoy ya se cumpla la condición — significa que el proceso para verificarla funciona. La condición se cumple cuando:

- [ ] El entrenador ha usado los tres pilares en producción durante varios días más (no una sola sesión) sin encontrar nada que corregir.
- [ ] Se ha probado explícitamente el ciclo completo al menos una vez de principio a fin: crear un entrenamiento → planificarlo en una semana → asignarlo a un atleta real → el atleta lo ve, lo hace, manda feedback → el entrenador lo lee y responde → el atleta ve la respuesta. Hoy se ha probado por piezas sueltas, no ese ciclo entero seguido.
- [ ] `git log` de `main` lleva unos días sin un commit `fix(...)` sobre crear entrenamiento, planificar o gestionar atletas. Mientras sigan apareciendo fixes reales sobre estos tres, no ha llegado el momento — no por disciplina arbitraria, sino porque cada fix de hoy demuestra que hay superficie sin probar todavía.

Ninguna de las tres es "listo para siempre" — es "listo para que merezca la pena invertir en la siguiente capa en vez de en seguir puliendo esta".

## 2. Qué es Análisis y qué NO es Análisis en MindPace

Petición explícita del entrenador: *"no quiero convertir la aplicación en un análisis de entrenamiento sino, en planificar y comunicar entrenador-atleta"*. Esa frase es el criterio de diseño para todo lo que sigue, no una advertencia genérica — cada propuesta de abajo se ha filtrado por ella.

La pregunta que decide si algo entra en el alcance no es "¿es interesante saberlo?" sino: **¿esta pantalla cambia lo que el entrenador va a planificar la semana que viene, o lo que le va a decir al atleta?** Si la respuesta es no, no entra, por interesante que sea.

### Dentro de alcance (v1 de Análisis)

1. **Comparativa por entrenamiento: planificado vs. realizado.**
   Ya existe la infraestructura (`resultados_entrenamientos`, `sesiones_realizadas`, `_km_totales_personalizado`, zonas por atleta) — el trabajo de esta fase es pulir y verificar que sea fiable, no construir algo nuevo. Un entrenamiento, un vistazo: qué se planificó por bloque, qué se hizo, la diferencia. Esto informa directamente si el próximo entrenamiento parecido hay que ajustarlo.

2. **Resumen semanal por atleta, a nivel de planificación.**
   Km planificados vs. realizados, sesiones completadas vs. pendientes, RPE/sensación medios de la semana. A propósito **a nivel de semana, no de temporada** — coincide con el ciclo real en que el entrenador planifica (semana a semana), y es la unidad de tiempo que ya usa "Planificar semana". Esto es lo que el entrenador mira antes de decidir la semana siguiente.

3. **El resumen vive donde el entrenador ya está, no en una pantalla nueva que invite a explorar.**
   Dentro de "Gestionar atletas" (al abrir un atleta) y dentro del propio flujo de "Planificar" (al elegir a quién planificar la semana que viene). No como una tercera sección de nivel superior tipo "Estadísticas" que compite por atención con Planificar y Atletas — eso es exactamente el patrón que puede acabar convirtiendo la app en "un panel de análisis con planificación al lado" en vez de al revés.

4. **Feedback y respuesta como conversación, no como dataset.**
   Ya construido hoy (aviso de respuesta del entrenador en "Hoy"). La ampliación natural aquí es que el hilo de feedback→respuesta de las últimas sesiones sea visible junto al resumen semanal, para que el entrenador tenga contexto de comunicación al planificar, no gráficos sueltos de RPE en el tiempo.

### Fuera de alcance (deliberadamente, no por falta de tiempo)

- Modelado fisiológico (carga de entrenamiento, ACWR, curvas de fitness-fatiga, VO2max estimado más allá del VDOT que ya existe). Esto es lo que literalmente significa "convertir en un análisis de entrenamiento" — es la línea que no se cruza.
- Comparar atletas entre sí, rankings, clasificaciones.
- Gráficas históricas de temporada completa o multi-temporada.
- Cualquier cosa que exija capturar datos nuevos que hoy no se capturan (más allá de lo que ya sale de FIT, resultado manual y feedback).
- Una pantalla "Estadísticas" como destino propio de navegación con entidad igual a Planificar/Atletas. Ya existe una construida (`estadisticas.html`) desde antes de esta fase de pausa — cuando se retome Análisis, la decisión concreta a tomar es si esa pantalla se reconvierte en las vistas integradas de los puntos 1-4, o si se retira y todo vive dentro de Atletas/Planificar. Esa decisión no se toma en este documento, se toma cuando se retome el módulo.

## 3. Qué hacer primero cuando se decida retomar Análisis

En este orden, no en paralelo:

1. Confirmar contigo el alcance de la sección 2 antes de escribir código — es una propuesta, no una decisión tomada.
2. Auditar qué de los Módulos 9, 10 y 11 (`docs/02_BACKLOG_FUNCIONAL.md`) ya sirve tal cual para los 4 puntos de alcance, qué hay que adaptar y qué se retira.
3. Empezar por el punto 1 (comparativa por entrenamiento) porque es la pieza más pequeña y ya más cerca de estar hecha — no por el resumen semanal, que depende de que la pieza por entrenamiento sea fiable primero.

## 4. Documentación actualizada hoy

Para referencia — todo esto se actualizó como parte de esta misma tarea, con los cambios reales de hoy:

- `docs/01_HOJA_RUTA.md` — sección "Estado actual", nueva actualización 2026-08-20.
- `docs/02_BACKLOG_FUNCIONAL.md` — nota de estado en cabecera.
- `docs/09_SEGURIDAD.md` — webhook de WhatsApp, auditoría de rutas/esquema, archivos sensibles (el hallazgo antiguo ya no aplica), variables de producción reales.
- `docs/11_INFORME_SEGURIDAD_TECNICO.md` y `docs/12_INFORME_SEGURIDAD_CLIENTE.md` — reescritos contra el código y los incidentes reales de hoy, no una revalidación superficial del informe anterior.
- `README.md` — nueva sección "Producción" (cadena de despliegue, cómo publicar un cambio).
