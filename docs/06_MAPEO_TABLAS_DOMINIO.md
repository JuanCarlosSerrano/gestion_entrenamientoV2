# 06 · Mapeo Tablas ↔ Dominio — MindPace V2

## 1. Objetivo del documento

Este documento relaciona el modelo de dominio de MindPace con las tablas actuales de la base de datos.

Su objetivo es dejar claro:

- qué concepto del negocio representa cada tabla;
- qué tablas forman parte del núcleo actual;
- qué tablas están parcialmente alineadas;
- qué tablas deben considerarse legacy o en revisión;
- qué tablas nuevas serán necesarias para completar la V2.

Este documento no sustituye al esquema SQL. Sirve como guía funcional para decidir sobre qué tablas construir nuevas funcionalidades.

---

## 2. Criterios de clasificación

| Estado | Significado |
|---|---|
| ✅ Núcleo | Tabla válida y alineada con el dominio actual. Se puede seguir desarrollando sobre ella. |
| 🟡 Revisar | Tabla útil, pero requiere aclaración, refactor o normalización futura. |
| ⚠️ Legacy | Tabla probablemente antigua o duplicada. No construir nuevas funcionalidades encima salvo necesidad. |
| 🔴 Falta | Concepto necesario que aún no tiene tabla clara. |

---

## 3. Resumen ejecutivo

El esquema actual **sí es reutilizable** para la nueva visión de MindPace V2.

No se recomienda empezar desde cero.

El núcleo actual ya cubre:

- usuarios y roles;
- atletas y entrenadores;
- plantillas de entrenamientos;
- detalle por pasos;
- entrenamientos asignados personalizados;
- zonas de entrenamiento;
- feedback;
- sesiones realizadas;
- archivos FIT;
- métricas reales;
- ciclos de planificación.

La evolución recomendada es:

1. Mantener el núcleo actual.
2. Construir nuevas pantallas guiadas sobre estas tablas.
3. No usar tablas legacy para funcionalidades nuevas.
4. Añadir tablas nuevas solo donde falten conceptos reales del dominio.
5. Posponer grandes refactors hasta que el flujo V2 esté funcionando.

---

# 4. Núcleo principal del dominio

---

## 4.1 `usuarios`

### Concepto del dominio

Representa cualquier persona del sistema:

- administrador;
- entrenador;
- atleta.

### Papel en MindPace

Es la tabla base de identidad, roles y relaciones entrenador-atleta.

### Campos relevantes

- `id`
- `nombre`
- `apellidos`
- `email`
- `password_hash`
- `rol`
- `entrenador_id`
- `telefono`
- `categoria`
- `grupo`
- `subgrupo`
- `vdot_val`
- `vdot_fecha`
- `vdot_distancia_m`
- `vdot_tiempo_seg`

### Relaciones principales

Un entrenador puede tener muchos atletas.

Un atleta pertenece a un entrenador mediante `entrenador_id`.

### Estado

✅ Núcleo

### Decisión

Mantener como tabla principal de usuarios.

### Observaciones

Actualmente también contiene datos deportivos del atleta, como VDOT. Esto es funcional, pero a medio plazo podría separarse en una tabla histórica de rendimiento para evitar mezclar identidad con estado deportivo.

---

## 4.2 `entrenamientos`

### Concepto del dominio

Representa una plantilla reutilizable de entrenamiento.

### Papel en MindPace

Es el equivalente digital a un entrenamiento tipo que el entrenador puede reutilizar muchas veces.

Ejemplo:

- rodaje 50 minutos;
- 6 × 800;
- 3 × 2000;
- fuerza general;
- técnica de carrera.

### Campos relevantes

- `id`
- `nombre`
- `objetivo`
- `notas`
- `km_totales`
- `creador_id`

### Relaciones principales

Se relaciona con:

- `entrenamientos_detalle`
- `entrenamientos_asignados`

### Estado

✅ Núcleo

### Decisión

Mantener como tabla de plantillas.

### Observaciones

No debe usarse para representar un entrenamiento concreto de un atleta. Para eso existe `entrenamientos_asignados`.

---

## 4.3 `entrenamientos_detalle`

### Concepto del dominio

Representa los pasos o bloques que componen una plantilla de entrenamiento.

### Papel en MindPace

Permite estructurar entrenamientos complejos.

Ejemplo:

- calentamiento;
- bloque principal;
- repeticiones;
- recuperación;
- vuelta a la calma.

### Campos relevantes

- `entrenamiento_id`
- `parent_id`
- `orden`
- `tipo_paso`
- `repeticiones`
- `objetivo_tipo`
- `objetivo_valor`
- `unidad`
- `zona`
- `recuperacion_valor`
- `recuperacion_unidad`
- `intensidad`
- `descripcion`

### Relaciones principales

Pertenece a `entrenamientos`.

Puede tener jerarquía interna mediante `parent_id`.

### Estado

✅ Núcleo

### Decisión

Usar como estructura principal de pasos/bloques para plantillas.

### Observaciones

Esta tabla es más potente que `entrenamiento_bloques` y debe ser la referencia para desarrollo nuevo.

---

## 4.4 `entrenamientos_asignados`

### Concepto del dominio

Representa un entrenamiento concreto asignado a un atleta en una fecha determinada.

### Papel en MindPace

Es una de las tablas más importantes del sistema.

Una plantilla se convierte en entrenamiento real de un atleta cuando se asigna.

### Campos relevantes

- `id`
- `atleta_id`
- `fecha`
- `entrenamiento_id`
- `visible`
- `nombre`
- `objetivo`
- `notas`
- `km_previstos`
- `ciclo_tipo`
- `macrociclo_id`
- `mesociclo_id`
- `microciclo_id`
- `created_at`
- `updated_at`

### Relaciones principales

Se relaciona con:

- `usuarios` mediante `atleta_id`
- `entrenamientos`
- `entrenamientos_asignados_detalle`
- `feedbacks`
- `sesiones_realizadas`
- `km_realizados_entrenamientos`
- `resultados_entrenamientos`

### Estado

✅ Núcleo

### Decisión

Mantener como tabla principal del entrenamiento planificado para un atleta.

### Observaciones

Debe evolucionar para conservar información congelada del momento de asignación:

- VDOT usado;
- método de zonas;
- estado de envío;
- fecha de envío;
- versión de la plantilla;
- canal de comunicación.

No se recomienda modificar entrenamientos históricos cuando cambie la plantilla original.

---

## 4.5 `entrenamientos_asignados_detalle`

### Concepto del dominio

Representa los pasos personalizados de un entrenamiento asignado.

### Papel en MindPace

Es la copia concreta de los pasos que recibe un atleta.

Permite que una misma plantilla genere objetivos distintos según el atleta.

### Campos relevantes

- `entrenamiento_asignado_id`
- `parent_id`
- `orden`
- `tipo_paso`
- `repeticiones`
- `objetivo_tipo`
- `objetivo_valor`
- `unidad`
- `zona`
- `recuperacion_valor`
- `recuperacion_unidad`
- `intensidad`
- `descripcion`

### Relaciones principales

Pertenece a `entrenamientos_asignados`.

Puede tener jerarquía interna mediante `parent_id`.

### Estado

✅ Núcleo

### Decisión

Usar como estructura principal para guardar el entrenamiento personalizado que recibe el atleta.

### Observaciones

Esta tabla debe conservar lo que se envió al atleta, aunque posteriormente cambien la plantilla o las zonas.

---

## 4.6 `zonas_entrenamiento`

### Concepto del dominio

Representa el perfil de zonas del atleta.

### Papel en MindPace

Permite traducir plantillas genéricas a objetivos concretos.

Ejemplo:

Plantilla:

```text
6 × 800 @ I
```

Atleta:

```text
Zona / ritmo I = 2:28 por 800
```

Entrenamiento asignado:

```text
6 × 800 en 2:28
```

### Campos relevantes

- `atleta_id`
- `vam`
- `z1`
- `z2`
- `z3`
- `z4`
- `z5`
- `z6`
- `fc_z1`
- `fc_z2`
- `fc_z3`
- `fc_z4`
- `fc_z5`
- `fc_z6`
- `metodo`
- `fecha_creacion`

### Relaciones principales

Pertenece a `usuarios` cuando `rol = atleta`.

### Estado

🟡 Revisar

### Decisión

Mantener como tabla actual de zonas.

### Observaciones

Funciona actualmente, pero debe evolucionar para soportar mejor:

- VDOT histórico;
- ritmos tipo Daniels/VDOT;
- fecha de vigencia;
- fuente del cálculo;
- versión usada en cada asignación.

No se recomienda eliminarla. Sí se recomienda normalizarla en una fase posterior.

---

# 5. Ejecución, feedback y datos reales

---

## 5.1 `feedbacks`

### Concepto del dominio

Representa la respuesta subjetiva del atleta después del entrenamiento.

### Papel en MindPace

Recoge sensaciones y contexto que el FIT no puede explicar.

### Campos relevantes

- `id`
- `entrenamiento_asignado_id`
- `atleta_id`
- `comentario`
- `fecha`
- `leido`
- `respuesta`
- `url_datos`
- `rpe`
- `sensacion`
- `fatiga`
- `dolor`
- `zona_dolor`
- `completado`

### Relaciones principales

Se relaciona con:

- `entrenamientos_asignados`
- `usuarios`

### Estado

✅ Núcleo

### Decisión

Mantener como tabla de feedback subjetivo.

### Observaciones

Existe cierta duplicidad con `sesiones_realizadas` en campos como RPE, fatiga, dolor y comentario.

Por ahora se mantiene porque ya está integrada en la aplicación.

A futuro habría que decidir si:

- `feedbacks` conserva la parte subjetiva;
- `sesiones_realizadas` conserva el resumen real ejecutado;
- o se unifican parcialmente.

---

## 5.2 `sesiones_realizadas`

### Concepto del dominio

Representa la sesión real ejecutada por el atleta.

### Papel en MindPace

Es la contraparte real del entrenamiento asignado.

### Campos relevantes

- `entrenamiento_asignado_id`
- `atleta_id`
- `fecha_real`
- `km_real`
- `duracion_real_seg`
- `rpe`
- `sensacion`
- `fatiga`
- `dolor`
- `zona_dolor`
- `completado`
- `comentario`
- `origen_datos`
- `archivo_principal_id`

### Relaciones principales

Se relaciona con:

- `entrenamientos_asignados`
- `usuarios`
- `sesion_metricas`
- `sesion_archivos`

### Estado

✅ Núcleo

### Decisión

Mantener como tabla de sesión realizada.

### Observaciones

Es una tabla muy alineada con la visión V2.

Debe consolidarse como fuente principal del entrenamiento ejecutado.

---

## 5.3 `sesion_metricas`

### Concepto del dominio

Representa métricas extraídas o registradas de una sesión real.

### Papel en MindPace

Permite guardar métricas flexibles sin añadir columnas nuevas constantemente.

### Campos relevantes

- `sesion_id`
- `metrica`
- `valor`
- `unidad`

### Relaciones principales

Pertenece a `sesiones_realizadas`.

### Estado

✅ Núcleo

### Decisión

Mantener como tabla flexible de métricas.

### Observaciones

Muy útil para almacenar métricas procedentes de FIT:

- ritmo;
- FC;
- potencia;
- cadencia;
- tiempo por zonas;
- distancia por zonas.

---

## 5.4 `sesion_archivos`

### Concepto del dominio

Representa archivos asociados a una sesión real.

### Papel en MindPace

Permite asociar archivos FIT u otros documentos al entrenamiento realizado.

### Campos relevantes

- `sesion_id`
- `atleta_id`
- `origen`
- `filename`
- `mime`
- `tamano`
- `ruta_storage`
- `hash_sha256`
- `fecha_subida`
- `procesado`
- `error_procesado`

### Relaciones principales

Se relaciona con:

- `sesiones_realizadas`
- `usuarios`

### Estado

✅ Núcleo

### Decisión

Mantener como tabla de archivos.

### Observaciones

Debe ser la referencia para subida de FIT.

---

## 5.5 `resultados_entrenamientos`

### Concepto del dominio

Representa resultados reales por paso o repetición.

### Papel en MindPace

Permite guardar tiempos reales de series o bloques concretos.

### Campos relevantes

- `entrenamiento_asignado_id`
- `paso_detalle_id`
- `repeticion`
- `tiempo_real_seg`
- `fecha`

### Relaciones principales

Se relaciona con:

- `entrenamientos_asignados`
- `entrenamientos_asignados_detalle`

### Estado

🟡 Revisar

### Decisión

Mantener como tabla útil para resultados por repetición.

### Observaciones

Debe aclararse si los datos proceden de introducción manual, FIT o ambos.

También conviene asegurar que `paso_detalle_id` referencia siempre `entrenamientos_asignados_detalle`.

---

## 5.6 `km_realizados_entrenamientos`

### Concepto del dominio

Resumen simple de kilómetros planificados y realizados.

### Papel en MindPace

Permite consultas rápidas de volumen.

### Campos relevantes

- `entrenamiento_asignado_id`
- `km_planificados`
- `km_realizados`
- `fecha`

### Relaciones principales

Se relaciona con `entrenamientos_asignados`.

### Estado

🟡 Revisar

### Decisión

Mantener como tabla resumen temporal.

### Observaciones

No debe ser la fuente principal de la verdad.

La fuente principal debería ser:

- `entrenamientos_asignados`
- `sesiones_realizadas`
- `sesion_metricas`

Podría mantenerse como tabla derivada o cache.

---

# 6. Planificación y ciclos

---

## 6.1 `macrociclos`

### Concepto del dominio

Representa una estructura larga de planificación.

### Estado

🟡 Revisar

### Decisión

Mantener, pero no priorizar en la primera fase V2.

### Observaciones

Es útil para planificación avanzada, pero el objetivo inmediato es resolver semana y comunicación.

---

## 6.2 `mesociclos`

### Concepto del dominio

Representa una estructura media de planificación.

### Estado

🟡 Revisar

### Decisión

Mantener, pero no priorizar en la primera fase V2.

---

## 6.3 `microciclos`

### Concepto del dominio

Representa una semana o unidad corta de planificación.

### Estado

🟡 Revisar

### Decisión

Puede servir como base para planificación semanal guiada.

---

## 6.4 `microciclos_entrenamientos`

### Concepto del dominio

Relaciona microciclos con entrenamientos.

### Estado

🟡 Revisar

### Decisión

Revisar antes de implementar planificación semanal guiada.

---

## 6.5 `mesociclos_microciclos`

### Concepto del dominio

Relaciona mesociclos con microciclos.

### Estado

🟡 Revisar

### Decisión

Mantener para planificación avanzada.

---

## 6.6 `macrociclos_mesociclos`

### Concepto del dominio

Relaciona macrociclos con mesociclos.

### Estado

🟡 Revisar

### Decisión

Mantener para planificación avanzada.

---

# 7. Alertas

---

## 7.1 `alertas_reglas`

### Concepto del dominio

Representa reglas configurables para generar alertas.

### Papel en MindPace

Define condiciones del tipo:

- RPE alto;
- fatiga elevada;
- molestias;
- desviación importante;
- falta de feedback.

### Campos relevantes

- `entrenador_id`
- `codigo`
- `parametros_json`
- `activo`
- `created_at`

### Estado

🟡 Revisar

### Decisión

Mantener como tabla de reglas.

### Observaciones

Falta una tabla complementaria para alertas generadas.

---

## 7.2 Tabla pendiente: `alertas`

### Concepto del dominio

Representará alertas reales generadas por el sistema.

### Estado

🔴 Falta

### Campos propuestos

- `id`
- `entrenador_id`
- `atleta_id`
- `entrenamiento_asignado_id`
- `feedback_id`
- `sesion_id`
- `tipo`
- `severidad`
- `titulo`
- `mensaje`
- `estado`
- `created_at`
- `resolved_at`

### Decisión

Crear en una fase posterior, cuando se implemente la nueva home y la revisión del entrenador.

---

# 8. Comunicación

---

## 8.1 Tabla pendiente: `entrenamientos_envios`

### Concepto del dominio

Representará el envío de entrenamientos al atleta.

### Papel en MindPace

Es clave para sustituir la foto del Excel enviada por WhatsApp.

### Estado

🔴 Falta

### Campos propuestos

- `id`
- `entrenamiento_asignado_id`
- `atleta_id`
- `entrenador_id`
- `canal`
- `telefono_destino`
- `mensaje_generado`
- `url_publica`
- `estado`
- `created_at`
- `sent_at`

### Estados posibles

- generado;
- copiado;
- abierto_whatsapp;
- enviado_manual;
- error.

### Decisión

Crear antes de implementar el envío por WhatsApp.

---

# 9. Tablas legacy o en revisión

---

## 9.1 `entrenamiento_bloques`

### Concepto del dominio

Representa una estructura simple de bloques de entrenamiento.

### Estado

⚠️ Legacy

### Motivo

Parece una versión anterior o simplificada de `entrenamientos_detalle`.

### Decisión

No usar para nuevas funcionalidades.

### Observaciones

Antes de eliminarla hay que comprobar si alguna pantalla o endpoint sigue dependiendo de ella.

---

## 9.2 `textos_descriptivos`

### Concepto del dominio

Tabla auxiliar de textos.

### Estado

🟡 Revisar

### Decisión

Revisar uso real antes de decidir.

---

# 10. Decisiones principales

## Decisión 1

No se reinicia la base de datos desde cero.

## Decisión 2

`entrenamientos` representa plantillas.

## Decisión 3

`entrenamientos_asignados` representa el entrenamiento real planificado para un atleta.

## Decisión 4

`entrenamientos_asignados_detalle` debe conservar la versión exacta que recibe el atleta.

## Decisión 5

`zonas_entrenamiento` se mantiene, pero deberá evolucionar para soportar mejor VDOT histórico.

## Decisión 6

`sesiones_realizadas`, `sesion_metricas` y `sesion_archivos` serán el núcleo de lo realizado.

## Decisión 7

`feedbacks` seguirá representando la parte subjetiva del atleta.

## Decisión 8

`entrenamiento_bloques` queda marcado como legacy.

## Decisión 9

Se crearán nuevas tablas solo donde el dominio lo exija claramente.

Primero:

- `entrenamientos_envios`
- `alertas`

---

# 11. Prioridad de evolución del modelo

## Prioridad 1

Mantener y consolidar núcleo:

- `usuarios`
- `entrenamientos`
- `entrenamientos_detalle`
- `entrenamientos_asignados`
- `entrenamientos_asignados_detalle`
- `zonas_entrenamiento`
- `feedbacks`
- `sesiones_realizadas`
- `sesion_metricas`
- `sesion_archivos`

## Prioridad 2

Añadir comunicación:

- `entrenamientos_envios`

## Prioridad 3

Añadir alertas reales:

- `alertas`

## Prioridad 4

Normalizar VDOT histórico.

## Prioridad 5

Revisar legacy:

- `entrenamiento_bloques`
- `km_realizados_entrenamientos`
- `textos_descriptivos`

---

# 12. Criterio para modificar el esquema

Antes de modificar la base de datos, se debe responder:

1. ¿Qué concepto del dominio representa?
2. ¿Ya existe una tabla que cubra ese concepto?
3. ¿Es dato fuente o dato derivado?
4. ¿Debe conservarse históricamente?
5. ¿Afecta a entrenamientos ya enviados?
6. ¿Es necesario para el flujo V2?

Si no hay respuesta clara, no se modifica el esquema.

---

# 13. Conclusión

El esquema actual es suficientemente sólido para continuar MindPace V2.

La estrategia recomendada es evolución controlada:

- reutilizar el núcleo existente;
- no construir sobre tablas legacy;
- añadir comunicación y alertas;
- normalizar VDOT histórico más adelante;
- priorizar primero el flujo completo entrenador → WhatsApp → atleta → feedback → FIT → revisión.

El modelo actual permite construir la nueva experiencia sin reiniciar el proyecto.