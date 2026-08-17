# 03 · Capacidades del Sistema

## Objetivo

Este documento describe las capacidades fundamentales de **MindPace**.

Una capacidad representa algo que el sistema sabe hacer independientemente de cómo se implemente o de la interfaz utilizada.

Las capacidades constituyen el núcleo del sistema y son la base sobre la que se construyen todas las funcionalidades visibles para entrenadores y atletas.

Este documento no describe pantallas ni flujos de usuario. Describe únicamente las capacidades internas del sistema.

---

# Los cinco motores de MindPace

Toda la aplicación se construye sobre cinco grandes motores funcionales.

Cada nueva funcionalidad debe pertenecer a uno de ellos.

---

# Motor 1 · Planificación

Responsable de crear, organizar y asignar entrenamientos.

Incluye:

- Gestión de usuarios deportivos
- Biblioteca de entrenamientos
- Motor de entrenamientos
- Planificación semanal
- Asignación a atletas
- Personalización mediante VDOT

---

# Motor 2 · Comunicación

Responsable de hacer llegar la planificación al atleta.

Incluye:

- Generación de mensajes
- WhatsApp
- Compartición de entrenamientos
- Vista móvil del entrenamiento

---

# Motor 3 · Ejecución

Responsable de recoger todo lo que ocurre después del entrenamiento.

Incluye:

- Feedback
- Archivo FIT
- Procesamiento FIT
- Comparación planificado vs realizado

---

# Motor 4 · Memoria

Responsable de conservar y relacionar toda la información.

Incluye:

- Historial
- Auditoría
- Versionado
- Relaciones entre entrenamientos y feedback

---

# Motor 5 · Inteligencia

Responsable de transformar los datos en información útil.

Incluye:

- Alertas
- Estadísticas
- Evolución deportiva
- Comparativas
- Predicciones futuras

---

# Catálogo de capacidades

## Criterio de estado

El estado indica si la capacidad está disponible para el flujo V2 completo, no solo si existen piezas técnicas en el backend.

| Estado | Significado |
|--------|-------------|
| 🟢 Implementado | Disponible y conectado al flujo principal. |
| 🟡 Parcial | Existe total o parcialmente, pero falta integración, UX o cierre funcional. |
| 🔴 Pendiente | No existe todavía o no está conectado de forma útil. |

---

# CAP-001 · Gestión de usuarios

## Objetivo

Gestionar los distintos perfiles del sistema.

## Debe permitir

- Administradores
- Entrenadores
- Atletas

## Debe conocer

- Relaciones entrenador ↔ atleta
- Grupos
- Subgrupos
- Permisos

## Utilizado por

- Todo el sistema

## Dependencias

Ninguna

## Estado

🟡 Parcial

---

# CAP-002 · Motor de entrenamientos

## Objetivo

Representar cualquier entrenamiento mediante un modelo único basado en bloques.

## Tipos soportados

- Rodaje
- Series
- Cuestas
- Fuerza
- Técnica
- Competición

## Diseño

Todos los entrenamientos deben representarse mediante bloques independientes.

Esto permitirá reutilizar el mismo motor para cualquier modalidad deportiva.

## Utilizado por

- Biblioteca
- Planificación
- Asignación
- WhatsApp
- Vista del atleta

## Dependencias

CAP-001

## Estado

🟡 Parcial

Avance: muy avanzado.

---

# CAP-003 · Biblioteca de entrenamientos

## Objetivo

Almacenar entrenamientos reutilizables.

## Debe permitir

- Buscar
- Filtrar
- Editar
- Duplicar
- Favoritos
- Categorías
- Versionado

## Utilizado por

- Creación guiada
- Planificación semanal

## Dependencias

CAP-002

## Estado

🟡 Parcial

---

# CAP-004 · Planificación

## Objetivo

Construir la planificación deportiva independientemente de cómo se visualice.

## Debe permitir

- Día
- Semana
- Microciclo
- Mesociclo
- Macrociclo

## Utilizado por

- Calendario
- Asignación
- Historial

## Dependencias

CAP-002
CAP-003

## Estado

🟡 Parcial

---

# CAP-005 · Personalización deportiva

## Objetivo

Adaptar automáticamente un entrenamiento al nivel del atleta.

## Entradas

- Atleta
- Entrenamiento
- Fecha
- VDOT vigente

## Salidas

- Ritmos
- Tiempos
- Zonas
- Previsiones

## Utilizado por

- Asignación
- WhatsApp
- Vista del atleta

## Dependencias

CAP-002

## Estado

🟡 Parcial

Avance: muy avanzado.

---

# CAP-006 · Comunicación

## Objetivo

Generar automáticamente formatos de comunicación.

## Canales

- WhatsApp
- Email (futuro)
- PDF (futuro)
- Impresión (futuro)

## Utilizado por

- Entrenador

## Dependencias

CAP-004
CAP-005

## Estado

🔴 Pendiente

---

# CAP-007 · Feedback

## Objetivo

Registrar la respuesta del atleta tras realizar un entrenamiento.

## Debe almacenar

- Comentario
- RPE
- Fatiga
- Molestias
- Zona de dolor
- Entrenamiento completado

## Utilizado por

- Historial
- Alertas
- Estadísticas

## Dependencias

CAP-004

## Estado

🟡 Parcial

Avance: muy avanzado.

---

# CAP-008 · Procesamiento FIT

## Objetivo

Extraer automáticamente las métricas del entrenamiento.

## Entradas

- Archivo FIT

## Salidas

- Distancia
- Tiempo
- Ritmo
- Frecuencia cardíaca
- Potencia
- Cadencia
- Tiempo por zonas
- Distancia por zonas

## Utilizado por

- Comparación
- Estadísticas
- Alertas

## Dependencias

CAP-007

## Estado

🟡 Parcial

Avance: muy avanzado.

---

# CAP-009 · Comparación planificado vs realizado

## Objetivo

Comparar automáticamente el entrenamiento previsto con el realmente ejecutado.

## Entradas

- Planificación
- Datos FIT
- Feedback

## Salidas

- Cumplimiento
- Desviaciones
- Resumen comparativo

## Utilizado por

- Historial
- Alertas
- Estadísticas

## Dependencias

CAP-004
CAP-007
CAP-008

## Estado

🟡 Parcial

Avance: muy avanzado.

---

# CAP-010 · Historial deportivo

## Objetivo

Relacionar toda la información de un atleta.

## Debe conectar

- Planificación
- Entrenamientos
- FIT
- Feedback
- Estadísticas

## Utilizado por

- Entrenador
- Atleta

## Dependencias

Todas las capacidades anteriores

## Estado

🟡 Parcial

---

# CAP-011 · Alertas

## Objetivo

Detectar automáticamente situaciones que requieren atención.

## Ejemplos

- Fatiga alta
- Molestias
- Entrenamiento incompleto
- RPE elevado
- Desviaciones importantes
- Falta de feedback

## Utilizado por

- Dashboard del entrenador

## Dependencias

CAP-007
CAP-008
CAP-009

## Estado

🟡 Parcial

Avance: inicial.

---

# CAP-012 · Estadísticas

## Objetivo

Transformar los datos almacenados en información útil.

## Debe calcular

- Atleta
- Grupo
- Semana
- Mes
- Temporada

## Utilizado por

- Dashboard
- Historial

## Dependencias

CAP-010

## Estado

🟡 Parcial

---

# CAP-013 · Auditoría

## Objetivo

Registrar todas las acciones relevantes realizadas en el sistema.

## Debe registrar

- Quién creó un entrenamiento
- Quién lo modificó
- Cuándo se modificó
- Qué versión recibió cada atleta
- Qué VDOT estaba vigente
- Historial de cambios

## Utilizado por

- Historial
- Administración

## Dependencias

CAP-001

## Estado

🔴 Pendiente

---

# CAP-014 · Seguridad

## Objetivo

Garantizar que cada usuario solo acceda a la información autorizada.

## Incluye

- Roles
- Permisos
- CSRF
- Control entrenador ↔ atleta
- Validación de sesiones

## Utilizado por

- Todo el sistema

## Dependencias

CAP-001

## Estado

🟢 Implementado

---

# CAP-015 · API

## Objetivo

Permitir que todas las funcionalidades sean accesibles mediante API.

## Permitirá

- Aplicación móvil
- Integraciones externas
- Automatizaciones
- Futuras aplicaciones

## Dependencias

Todas las capacidades anteriores

## Estado

🟡 Parcial

---

# Estado global del sistema

| Capacidad | Estado |
|-----------|--------|
| Gestión de usuarios | 🟡 |
| Motor de entrenamientos | 🟡 |
| Biblioteca | 🟡 |
| Planificación | 🟡 |
| Personalización deportiva | 🟡 |
| Comunicación | 🔴 |
| Feedback | 🟡 |
| Procesamiento FIT | 🟡 |
| Comparación | 🟡 |
| Historial | 🟡 |
| Alertas | 🟡 |
| Estadísticas | 🟡 |
| Auditoría | 🔴 |
| Seguridad | 🟢 |
| API | 🟡 |

---

# CAP-016 · Publicación y comunicación

## Objetivo

Gestionar el paso de un entrenamiento asignado de oculto a visible y preparar el aviso WhatsApp asociado.

## Incluye

- Pendientes de publicar.
- Publicación inmediata.
- Programación de publicación.
- Registro independiente en `entrenamientos_envios`.
- Idempotencia para no duplicar avisos.
- Integración inicial con WhatsApp Cloud API de Meta mediante servicio aislado.

## Regla

El aviso WhatsApp solo se genera cuando el entrenamiento pasa a visible. Mientras permanece oculto o programado no se genera comunicación.

Si `WHATSAPP_ENABLED=false`, la publicación no llama a Meta y el intento queda registrado como deshabilitado.

## Estado

🟡 Parcial

---

# Objetivo final

Todas las capacidades descritas en este documento deben funcionar de forma coordinada para que MindPace pueda cubrir el ciclo completo de trabajo de un entrenador:

**Planificar → Comunicar → Ejecutar → Recordar → Analizar**

Este ciclo representa la esencia del producto y servirá como referencia para cualquier evolución futura.
