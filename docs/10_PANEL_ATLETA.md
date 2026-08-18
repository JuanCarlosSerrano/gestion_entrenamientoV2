# Panel del atleta

El panel del atleta de MindPace V2 prioriza una experiencia simple: el atleta entra, ve qué tiene que entrenar, ejecuta la sesión y comunica cómo ha ido.

## Filosofía

El flujo principal es:

```text
Recibir -> Entender -> Entrenar -> Informar
```

No se muestran datos administrativos, herramientas del entrenador ni pantallas de configuración compleja.

## Navegación

La sidebar del atleta contiene Inicio, Mi planificación, Historial, Mi evolución y Perfil.

## Home

La Home muestra el entrenamiento visible del día. Si no existen sesiones visibles para hoy, muestra un estado vacío claro.

## Mi Planificación

Muestra una semana sencilla con sesiones visibles y días de descanso. Permite navegar a semana anterior, actual y siguiente.

## Entrenamiento

El detalle usa bloques de entrenamiento en modo solo lectura. No muestra IDs, VDOT interno, botones de edición ni configuración.

## Feedback

El feedback se completa mediante pasos: completado, RPE, sensaciones, fatiga, molestias, comentario opcional y FIT opcional.

## FIT

La subida FIT reutiliza `/sesiones/<entrenamiento_id>/archivo`, `sesion_archivos`, `sesiones_realizadas` y el procesamiento FIT actual.

## Historial

El historial muestra sesiones propias, estado de feedback y detalle básico. No se convierte en dashboard avanzado.

## Evolución

Muestra kilómetros recientes, sesiones completadas, RPE medio, VDOT y zonas actuales. No compara con otros atletas.

## Perfil

Permite ver y actualizar datos personales, cambiar contraseña y ver grupo, categoría, entrenador y zonas actuales. Grupo, categoría, entrenador, zonas y VDOT son información de lectura para el atleta.

## Seguridad

- El atleta solo ve sus entrenamientos.
- El atleta solo ve entrenamientos visibles.
- El atleta no modifica planificación.
- El atleta no cambia zonas, VDOT, grupo, categoría ni entrenador.
- El atleta solo puede enviar feedback y FIT sobre entrenamientos propios.

## Criterios De Aceptación

1. Mantiene la identidad visual de MindPace.
2. La Home muestra el entrenamiento visible del día.
3. Los entrenamientos ocultos no aparecen.
4. La planificación semanal permite navegar semanas.
5. El detalle de entrenamiento es claro y solo lectura.
6. El feedback es guiado.
7. FIT es opcional.
8. Historial y evolución muestran solo datos propios.
9. Perfil no permite editar campos deportivos gestionados por el entrenador.
10. Los tests existentes siguen pasando.
