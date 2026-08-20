# Informe de seguridad para cliente final — MindPace V2

Fecha: 20-08-2026 (revisión del informe del 19-08-2026)

## Resumen

Desde la revisión anterior, MindPace V2 dejó de ser solo un entorno de desarrollo: **se publicó de verdad** en `https://mind-pace.net`, con un entrenador y un atleta reales usándolo. Ese uso real hizo aparecer un problema de seguridad de verdad (no una hipótesis de auditoría) y dos problemas de fiabilidad de datos, los tres corregidos el mismo día en que se detectaron. Además, precisamente por haber encontrado uno de ellos, se hizo una revisión sistemática para comprobar si el mismo tipo de fallo se repetía en otro sitio — y sí, se encontró y se cerró también.

Esto no es una mala noticia: es exactamente para lo que sirve empezar a usar la aplicación de verdad antes de ampliar su alcance. La conclusión general sigue siendo positiva — ningún control de seguridad de fondo se ha perdido —, pero esta vez sí hubo algo que corregir, y aquí se explica qué fue.

## Qué se encontró y se corrigió

### Un entrenador podía responder al feedback de un atleta que no era suyo

Al añadir la función de que un entrenador responda al feedback de un atleta, se comprobó que el atleta perteneciera al entrenador en la mayoría de las acciones relacionadas — pero se olvidó comprobarlo justo en la de "responder". Se ha corregido y se ha añadido una prueba automática que se ejecuta en cada cambio futuro para que no pueda volver a colarse sin darse cuenta.

Por esa misma razón, se revisaron **todas** las acciones que modifican datos en la aplicación (unas 36) buscando el mismo tipo de descuido. Se encontró un caso más: un entrenador podía usar el identificador de una plantilla de entrenamiento privada de otro entrenador (si lo llegaba a conocer) para asignársela a sus propios atletas. También corregido, con sus pruebas correspondientes.

### Dos entrenamientos podían duplicarse o fallar al guardar el feedback

Estos dos no son fallos de acceso indebido, sino de fiabilidad de los datos: en la base de datos real de producción, una columna estaba configurada con el tipo equivocado (impedía guardar el nivel de fatiga del feedback) y a otra le faltaba una regla que le habría dicho "esto ya existe, actualízalo" en vez de crear un duplicado. Ambos se descubrieron con uso real porque las pruebas automáticas, al correr sobre una base de datos de prueba más permisiva, no los detectaban. Corregidos en la base de datos real y en la plantilla de la que nace una nueva, con pruebas que sí comprueban esto de ahora en adelante.

## Qué se ha confirmado que sigue funcionando

Todo lo ya confirmado en la revisión anterior sigue vigente sin regresiones: registro público deshabilitado, altas controladas, contraseñas temporales seguras y de un solo uso, sesiones sin contraseñas en los logs, protección CSRF activa, reglas de subida de archivos, y atletas con historial archivados en vez de eliminados.

## Novedad: cabeceras de seguridad del navegador

Se ha añadido un conjunto de cabeceras HTTP que instruyen al navegador para reforzarse por su cuenta: forzar siempre HTTPS, no permitir que MindPace se cargue dentro de otra página, y una política de contenido (CSP) que limita desde dónde puede cargarse código y qué puede hacer, calculada específicamente a partir de lo que la aplicación usa de verdad — no una plantilla genérica.

## Novedad: producción activa de verdad

Los puntos pendientes "antes de producción" de la revisión anterior ya están hechos: servidor de producción (no el de desarrollo), dominio y cookies seguras configurados, y copia de seguridad automática cada noche de la base de datos real.

## Resultado de la validación de esta revisión

```text
126 pruebas superadas
```

(85 en la revisión anterior; 41 nuevas, entre ellas las de los tres problemas descritos arriba).

## Puntos pendientes

1. Varias páginas todavía usan un estilo de código (`style=""` en el HTML) que obliga a mantener una excepción algo más permisiva en la política de contenido del navegador; corregirlo es un trabajo de frontend, no de seguridad urgente.
2. Si en el futuro se necesita atender a muchos más usuarios a la vez, el control de intentos de inicio de sesión repetidos necesitará moverse a un almacén compartido (hoy vive en el propio proceso, suficiente para el volumen actual).
3. Los avisos de WhatsApp fuera de las 24 horas desde el último mensaje del atleta no se pueden entregar sin plantillas aprobadas por Meta — es una limitación de la plataforma de WhatsApp, no de MindPace, y requiere una gestión aparte, fuera del código.
4. Auditoría o pentest externo si en algún momento el volumen de atletas lo justifica.

## Conclusión

La base de seguridad se mantiene sólida, y esta revisión demuestra que el proceso de detectar y corregir funciona: lo encontrado con uso real se cerró el mismo día, con pruebas automáticas que evitan que vuelva a pasar. MindPace V2 ya está publicado y en uso real sobre los tres pilares actuales (crear entrenamiento, planificar, gestionar atletas); el criterio para ampliar a análisis y estadísticas sigue siendo el mismo de antes — que estos tres sigan probándose sin encontrar nada más que corregir, no una fecha fija.
