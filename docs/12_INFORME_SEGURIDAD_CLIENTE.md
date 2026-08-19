# Informe de seguridad para cliente final - MindPace V2

Fecha: 19-08-2026 (revision del informe del 18-08-2026)

## Resumen

Se ha vuelto a revisar la seguridad de MindPace V2 para confirmar que las mejoras aplicadas en la revisión anterior siguen vigentes y no se han deteriorado con el desarrollo posterior. La conclusión es positiva: **ningún control de seguridad se ha perdido**, y algunas comprobaciones se han reforzado porque las funcionalidades nuevas (planificación individual por atleta, publicación programada, feedback) incorporaron sus propias protecciones de acceso.

En paralelo, el desarrollo se centra ahora en tres funciones principales — crear entrenamiento, planificar y gestionar atletas — dejando en pausa el módulo de análisis y estadística hasta que esas tres funciones estén probadas a fondo. Esta revisión de seguridad cubre igualmente toda la aplicación, incluida la parte que queda en pausa, porque el código sigue publicado y accesible.

## Qué se ha confirmado que sigue funcionando

### Acceso a la aplicación

El registro público sigue deshabilitado. Las altas de usuario se siguen haciendo de forma controlada por un administrador o por el propio entrenador, solo para sus atletas.

### Contraseñas

Las contraseñas temporales se siguen generando de forma segura, se muestran una sola vez y nunca se guardan en texto plano. Sigue existiendo el cambio obligatorio antes de poder usar la aplicación con normalidad.

### Sesiones y login

El inicio de sesión sigue sin registrar contraseñas en los logs, sigue limpiando la sesión anterior al iniciar una nueva, y sigue teniendo protección básica contra intentos repetidos.

### Permisos por rol

Aquí es donde más ha mejorado desde la revisión anterior: las funciones que se han construido después (planificación individual de cada atleta, publicación de entrenamientos, feedback) se han probado una a una para confirmar que un entrenador no puede ver ni modificar datos de un atleta que no es suyo. Antes esta comprobación cubría el núcleo de la aplicación; ahora cubre también estas ampliaciones.

### Formularios y acciones sensibles

La protección contra formularios falsificados (CSRF) sigue activa en todas las acciones que modifican datos, incluidas las más recientes como el feedback.

### Subida de archivos

Las reglas para fotos de perfil y archivos de actividad deportiva (FIT) se mantienen sin cambios: solo se aceptan los formatos previstos y los archivos se guardan con nombres generados por el servidor.

### Conservación del historial

Los atletas con historial siguen archivándose en vez de eliminarse. No se ha detectado ningún cambio que ponga esto en riesgo.

## Punto pendiente de la revisión anterior: resuelto

La revisión anterior señalaba archivos técnicos (sesiones locales, bases de datos, copias de seguridad) que estaban registrados en el control de versiones del repositorio. Se ha comprobado de nuevo y **ese punto ya no existe**: ninguno de esos archivos está en el repositorio a día de hoy.

## Resultado de la validación de esta revisión

Se ha vuelto a ejecutar la suite completa de pruebas automáticas del backend.

Resultado:

```text
85 pruebas superadas
```

De esas, 46 son pruebas específicas de seguridad (login, permisos, altas, resets de contraseña, CSRF, subida de archivos, publicación y protección de datos entre entrenadores y atletas) — el mismo número que en la revisión anterior, ahora ampliado con casos nuevos para las funciones construidas después. Las 39 restantes son pruebas funcionales del resto de la aplicación.

## Estado actual

MindPace V2 mantiene la base de seguridad establecida en la revisión anterior, sin regresiones, y con cobertura de permisos ampliada a las funciones más recientes.

## Puntos pendientes antes de un uso público (sin cambios de fondo respecto a la revisión anterior)

1. Activar cookies seguras (`SESSION_COOKIE_SECURE`) en cuanto exista un entorno con HTTPS.
2. Configurar solo el dominio real como origen permitido cuando exista.
3. Usar un servidor de producción, no el servidor de desarrollo de Flask.
4. Preparar un almacenamiento de sesiones y un control de intentos de login pensado para producción, no solo para un único proceso en desarrollo.
5. Mantener secretos fuera del repositorio (ya se cumple; mantenerlo como práctica).
6. Realizar una auditoría o pentest externo antes de abrir acceso público.

## Conclusión

La base de seguridad establecida en la revisión anterior se mantiene intacta y se ha reforzado de forma natural al construir las últimas funciones. MindPace V2 sigue sin estar lista para exposición pública sin completar la configuración de producción (HTTPS, servidor de producción, sesiones), pero no hay ningún retroceso de seguridad que corregir antes de continuar el desarrollo centrado en crear entrenamiento, planificar y gestionar atletas.
