# 04 · Arquitectura Funcional — MindPace V2

## 1. Objetivo del documento

Este documento describe cómo fluye la información dentro de MindPace.

No define todavía tecnologías, frameworks ni detalles de implementación. Su función es explicar cómo se conectan las partes principales del sistema desde el punto de vista funcional.

MindPace debe cubrir el ciclo completo:

**Planificar → Comunicar → Ejecutar → Recordar → Analizar**

---

## 2. Flujo funcional principal

```text
ENTRENADOR
    │
    ▼
Crear entrenamiento
    │
    ▼
Biblioteca de entrenamientos
    │
    ▼
Planificación semanal
    │
    ▼
Asignación a atleta / grupo
    │
    ▼
Personalización deportiva
VDOT / zonas / ritmos
    │
    ▼
Generación de mensaje WhatsApp
    │
    ▼
ATLETA
    │
    ▼
Visualiza entrenamiento
    │
    ▼
Realiza entrenamiento
    │
    ▼
Envía feedback + archivo FIT
    │
    ▼
Procesamiento FIT
    │
    ▼
Comparación planificado vs realizado
    │
    ▼
Historial + alertas + estadísticas
    │
    ▼
ENTRENADOR
```

---

## 3. Actores principales

## 3.1 Entrenador

El entrenador es el usuario principal.

Sus acciones principales son:

* crear entrenamientos;
* planificar semanas;
* asignar entrenamientos;
* enviar entrenamientos por WhatsApp;
* revisar feedback;
* analizar rendimiento;
* consultar historial;
* gestionar atletas.

---

## 3.2 Atleta

El atleta debe tener una experiencia sencilla.

Sus acciones principales son:

* recibir el entrenamiento;
* abrirlo desde WhatsApp;
* entender la sesión;
* realizar el entrenamiento;
* subir archivo FIT;
* enviar feedback;
* consultar su historial básico.

---

## 3.3 Sistema

El sistema actúa como memoria y motor de cálculo.

Debe encargarse de:

* guardar entrenamientos;
* guardar asignaciones;
* personalizar ritmos;
* generar mensajes;
* procesar FIT;
* comparar planificado vs realizado;
* generar estadísticas;
* generar alertas;
* conservar el historial.

---

## 4. Bloques funcionales

## 4.1 Home del entrenador

La home es el punto de entrada del entrenador.

Debe funcionar como centro de mando.

Debe mostrar:

* Crear entrenamiento
* Planificar semana
* Gestionar atletas
* Historial y rendimiento
* Alertas y feedback
* Configuración

También debe mostrar avisos accionables:

* feedback pendiente;
* FIT pendiente de revisión;
* atletas con molestias;
* entrenamientos no completados;
* alertas de fatiga;
* desviaciones importantes.

La home no debe ser una tabla administrativa. Debe ser una pantalla de acciones.

---

## 4.2 Creación de entrenamiento

La creación de entrenamiento debe ser guiada.

El entrenador no debe rellenar un formulario largo.

El sistema debe permitir crear entrenamientos mediante pasos:

1. Tipo de entrenamiento.
2. Bloques del entrenamiento.
3. Parámetros.
4. Intensidad o zona.
5. Observaciones.
6. Guardado.

Un entrenamiento debe poder guardarse como:

* entrenamiento único;
* plantilla reutilizable;
* parte de una semana planificada.

---

## 4.3 Biblioteca de entrenamientos

La biblioteca almacena entrenamientos reutilizables.

Debe permitir:

* buscar;
* filtrar;
* duplicar;
* editar;
* marcar favoritos;
* clasificar por tipo;
* reutilizar en semanas futuras.

La biblioteca evita que el entrenador repita manualmente entrenamientos habituales.

---

## 4.4 Planificación semanal

La planificación semanal organiza entrenamientos por fechas.

Debe permitir:

* crear semana desde cero;
* copiar semana anterior;
* usar plantilla semanal;
* planificar por atleta;
* planificar por grupo;
* planificar doble sesión;
* revisar resumen semanal.

La planificación semanal es el sustituto directo del Excel o la libreta.

---

## 4.5 Asignación

La asignación convierte una planificación en entrenamientos concretos para atletas concretos.

Debe poder hacerse a:

* un atleta;
* varios atletas;
* un grupo;
* un subgrupo.

Cuando se asigna un entrenamiento, debe generarse una instancia concreta para cada atleta.

Esa instancia debe conservar:

* fecha;
* atleta;
* entrenamiento asignado;
* versión del entrenamiento;
* VDOT usado;
* ritmos calculados;
* zonas calculadas;
* observaciones;
* estado de envío;
* feedback posterior;
* archivo FIT asociado.

---

## 4.6 Personalización deportiva

La personalización deportiva adapta el entrenamiento al atleta.

Ejemplo:

La plantilla dice:

```text
6 x 800 m @ I
```

El sistema genera:

```text
Atleta A → 2:28
Atleta B → 2:35
Atleta C → 2:42
```

La personalización puede basarse en:

* VDOT;
* zonas;
* ritmos personalizados;
* historial del atleta;
* configuración manual del entrenador.

El valor calculado en el momento de la asignación debe quedar congelado para preservar el historial.

---

## 4.7 Comunicación por WhatsApp

WhatsApp forma parte del flujo oficial de MindPace.

El sistema debe generar un mensaje limpio, corto y entendible.

Ejemplo:

```text
🏃 Martes 8 julio

6 x 800 m

Objetivo:
2:28

Recuperación:
2'

Observaciones:
Última repetición controlada.

Abrir entrenamiento:
https://mindpace.app/t/abc123
```

El entrenador debe poder:

* copiar el mensaje;
* abrir WhatsApp;
* enviar a un atleta;
* enviar a un grupo;
* registrar que el entrenamiento fue enviado.

---

## 4.8 Vista del atleta

El atleta debe ver una pantalla limpia y móvil.

Debe mostrar:

* fecha;
* nombre del entrenamiento;
* bloques;
* ritmos;
* recuperaciones;
* observaciones;
* botón de feedback.

No debe mostrar información técnica innecesaria.

La vista del atleta debe estar pensada para abrirse desde WhatsApp.

---

## 4.9 Feedback del atleta

Después del entrenamiento, el atleta debe poder enviar:

* comentario;
* RPE;
* fatiga;
* molestias;
* zona de dolor;
* completado / no completado;
* archivo FIT.

El feedback debe quedar asociado al entrenamiento exacto.

---

## 4.10 Procesamiento FIT

Cuando el atleta sube un archivo FIT, el sistema debe extraer métricas relevantes.

Métricas posibles:

* distancia;
* duración;
* ritmo medio;
* ritmo por tramo;
* frecuencia cardíaca;
* potencia;
* cadencia;
* tiempo por zonas;
* distancia por zonas.

El FIT no debe quedar aislado como archivo. Debe formar parte del historial del entrenamiento.

---

## 4.11 Comparación planificado vs realizado

El sistema debe comparar:

```text
Entrenamiento planificado
        vs
Entrenamiento realizado
```

Debe calcular:

* diferencia de distancia;
* diferencia de duración;
* diferencia de ritmo;
* cumplimiento de zonas;
* cumplimiento de series;
* desviaciones;
* resumen de cumplimiento.

Esta comparación alimenta:

* historial;
* estadísticas;
* alertas;
* revisión del entrenador.

---

## 4.12 Historial y rendimiento

El historial es una de las piezas clave de MindPace.

Debe permitir recuperar información antigua de forma útil.

Preguntas que debe poder responder:

* ¿Qué hizo este atleta hace tres meses?
* ¿Qué entrenamientos de 800 hizo este año?
* ¿Qué sensaciones tuvo antes de una competición?
* ¿Cuándo empezaron las molestias?
* ¿Qué entrenamiento estaba planificado?
* ¿Qué hizo realmente?
* ¿Qué VDOT tenía entonces?

El historial debe conectar:

* planificación;
* entrenamiento asignado;
* atleta;
* feedback;
* FIT;
* métricas;
* estadísticas;
* alertas.

---

## 4.13 Alertas

Las alertas deben ayudar al entrenador a priorizar.

Ejemplos:

* RPE alto;
* fatiga elevada;
* molestias;
* entrenamiento no completado;
* FIT pendiente de revisión;
* falta de feedback;
* desviación importante entre planificado y realizado;
* exceso de carga semanal.

Cada alerta debe llevar a una acción concreta.

---

## 4.14 Estadísticas

Las estadísticas deben convertir el historial en información útil.

Deben poder calcularse por:

* atleta;
* grupo;
* semana;
* mes;
* temporada.

Métricas iniciales:

* kilómetros planificados;
* kilómetros realizados;
* tiempo planificado;
* tiempo realizado;
* tiempo por zona;
* distancia por zona;
* número de sesiones;
* sesiones completadas;
* RPE medio;
* evolución de VDOT;
* molestias registradas.

---

## 5. Relaciones funcionales principales

## 5.1 Entrenamiento

Un entrenamiento puede ser:

* plantilla;
* entrenamiento creado para un día;
* entrenamiento asignado;
* entrenamiento enviado;
* entrenamiento realizado.

Debe mantenerse la relación entre todas esas fases.

---

## 5.2 Atleta

Un atleta tiene relación con:

* entrenador;
* grupo;
* entrenamientos asignados;
* feedback;
* archivos FIT;
* VDOT;
* estadísticas;
* alertas;
* historial.

---

## 5.3 Semana

Una semana tiene relación con:

* atleta o grupo;
* días;
* entrenamientos;
* volumen previsto;
* carga prevista;
* volumen realizado;
* feedback;
* estadísticas.

---

## 5.4 Feedback

Un feedback debe estar relacionado con:

* atleta;
* entrenamiento asignado;
* fecha;
* sensaciones;
* archivo FIT;
* estado de revisión.

---

## 6. Estados principales

## 6.1 Estado de entrenamiento asignado

Un entrenamiento asignado puede estar en estos estados:

* creado;
* planificado;
* enviado;
* visto por el atleta;
* completado;
* feedback recibido;
* FIT recibido;
* revisado por el entrenador.

---

## 6.2 Estado de feedback

Un feedback puede estar en estos estados:

* pendiente;
* recibido;
* leído;
* revisado;
* respondido.

---

## 6.3 Estado de alerta

Una alerta puede estar en estos estados:

* nueva;
* vista;
* resuelta;
* descartada.

---

## 7. Principios funcionales

## 7.1 No duplicar trabajo

Si un dato ya existe, el sistema debe reutilizarlo.

Ejemplo:

Si el atleta tiene VDOT actualizado, no se deben introducir ritmos manualmente salvo decisión explícita del entrenador.

---

## 7.2 Todo debe quedar conectado

No deben existir datos importantes aislados.

Un FIT sin entrenamiento asociado pierde valor.

Un feedback sin entrenamiento asociado pierde contexto.

Un entrenamiento sin atleta y fecha no sirve para el historial.

---

## 7.3 El entrenador debe poder intervenir

Aunque el sistema automatice cálculos, el entrenador debe poder ajustar manualmente:

* ritmos;
* zonas;
* observaciones;
* asignaciones;
* planificación.

MindPace ayuda, pero no decide por el entrenador.

---

## 7.4 La comunicación debe seguir siendo rápida

Si enviar un entrenamiento desde MindPace tarda más que hacer una foto al Excel, la experiencia no es suficientemente buena.

---

## 7.5 El historial debe ser fiable

Lo que recibió el atleta en una fecha concreta no debe cambiar aunque después cambie:

* el entrenamiento plantilla;
* el VDOT;
* las zonas;
* los ritmos;
* el grupo del atleta.

---

## 8. Alcance funcional de la V2

La V2 debe cubrir el flujo completo:

1. Crear entrenamiento.
2. Planificar semana.
3. Asignar a atleta o grupo.
4. Personalizar ritmos.
5. Enviar por WhatsApp.
6. Visualizar en móvil.
7. Enviar feedback.
8. Subir FIT.
9. Comparar planificado vs realizado.
10. Revisar por el entrenador.
11. Consultar historial.
12. Ver estadísticas básicas.
13. Generar alertas útiles.

---

## 9. Fuera de alcance de esta arquitectura inicial

Quedan fuera de la arquitectura funcional inicial:

* aplicación móvil nativa;
* chat interno;
* integración directa con Garmin;
* integración directa con Strava;
* pagos;
* nutrición;
* gestión médica avanzada;
* IA generativa avanzada;
* predicción avanzada de marcas.

Estas funciones podrán estudiarse en futuras versiones.

---

## 10. Frase resumen

MindPace debe funcionar como una cadena continua:

```text
El entrenador planifica.
El sistema personaliza.
WhatsApp comunica.
El atleta ejecuta.
El FIT confirma.
El feedback explica.
El historial recuerda.
Las estadísticas ayudan.
Las alertas priorizan.
```
