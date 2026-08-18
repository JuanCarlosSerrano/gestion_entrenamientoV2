# Informe de seguridad para cliente final - MindPace V2

Fecha: 18-08-2026

## Resumen

MindPace V2 ha completado una revision de seguridad orientada a preparar la aplicacion para un uso mas seguro y una futura exposicion publica.

El trabajo se ha centrado en proteger el acceso de usuarios, evitar altas no autorizadas, reforzar la gestion de contraseñas, limitar acciones por rol, proteger formularios y asegurar que los archivos subidos por los atletas se validan antes de procesarse.

## Que se ha reforzado

### Acceso a la aplicacion

El registro publico ha sido deshabilitado. A partir de ahora, los usuarios no pueden crear cuentas por si mismos desde internet.

Las altas se realizan de forma controlada:

- Un administrador puede crear usuarios autorizados.
- Un entrenador puede crear solo atletas propios.
- Un atleta no puede crear otros usuarios.

### Contraseñas

Las contraseñas temporales ya no son fijas ni predecibles.

Cuando se crea una cuenta o se resetea una contraseña:

- la aplicacion genera una contraseña temporal segura;
- solo se muestra una vez;
- no se guarda en texto plano;
- el usuario debe cambiarla antes de utilizar la aplicacion normalmente.

### Sesiones y login

El inicio de sesion ha sido reforzado:

- no se registran contraseñas en logs;
- se limpia la sesion anterior al iniciar sesion;
- existe una proteccion basica contra intentos repetidos de acceso;
- las cookies de sesion estan configuradas con medidas de seguridad recomendadas.

### Permisos por rol

Se han revisado los permisos principales:

- Entrenador: solo puede gestionar sus atletas.
- Atleta: solo puede ver sus entrenamientos publicados.
- Administrador: puede gestionar usuarios segun la politica definida.

Esto reduce el riesgo de que un usuario acceda a datos de otro atleta o entrenador.

### Formularios y acciones sensibles

Las acciones que modifican datos usan proteccion CSRF. Esto ayuda a evitar que una pagina externa intente ejecutar acciones dentro de MindPace aprovechando una sesion abierta.

### Subida de archivos

La subida de archivos ha sido endurecida:

- Foto de perfil: solo JPG, PNG o WEBP.
- Actividad deportiva: solo archivos FIT.
- Los archivos FIT se guardan con nombres generados por el servidor.
- Se valida que el archivo pertenece a un entrenamiento del atleta antes de guardarlo.

### Conservacion del historial

Los atletas con entrenamientos, feedback o historico asociado ya no se eliminan fisicamente.

En su lugar se archivan, conservando la trazabilidad de la planificacion, sesiones, respuestas y datos historicos.

## Resultado de validacion

Se ha ejecutado la suite de pruebas del backend.

Resultado:

```text
46 pruebas superadas
```

Estas pruebas cubren login, permisos, altas, resets de contraseña, CSRF, subida de archivos, publicacion y proteccion de datos entre entrenadores y atletas.

## Estado actual

MindPace V2 queda en una base mas segura para continuar el desarrollo.

Los principales riesgos corregidos son:

- altas publicas no autorizadas;
- contraseñas temporales fijas;
- credenciales en logs;
- uso de la app sin cambiar contraseña temporal;
- subida de archivos no controlada;
- borrado accidental de atletas con historico.

## Punto pendiente antes de publicar

Existe una tarea tecnica pendiente relacionada con el repositorio de codigo: se han detectado archivos de desarrollo ya versionados, como sesiones locales, bases de datos SQLite y backups.

No se han eliminado automaticamente porque requiere una decision tecnica y controlada.

Antes de publicar el repositorio o abrirlo a terceros, se recomienda:

- retirar esos archivos del control de versiones;
- revisar si contienen datos reales;
- limpiar el historico Git si procede;
- rotar credenciales si algun archivo contiene secretos.

## Recomendaciones para produccion

Antes de poner MindPace V2 en un entorno publico:

1. Usar HTTPS obligatorio.
2. Activar cookies seguras.
3. Configurar solo el dominio real como origen permitido.
4. Usar un servidor de produccion, no el servidor de desarrollo de Flask.
5. Usar almacenamiento de sesiones preparado para produccion.
6. Mantener secretos fuera del repositorio.
7. Realizar una auditoria o pentest externo antes de abrir acceso publico.

## Conclusion

El sprint de seguridad ha cerrado vulnerabilidades importantes y ha establecido una politica clara de acceso, contraseñas, permisos y tratamiento de datos historicos.

MindPace V2 no debe considerarse aun listo para exposicion publica sin completar la limpieza del repositorio y la configuracion de produccion, pero la aplicacion queda preparada sobre una base mucho mas segura para continuar el desarrollo.
