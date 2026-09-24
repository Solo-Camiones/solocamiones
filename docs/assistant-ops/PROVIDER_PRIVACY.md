# Privacidad del proveedor (OpenAI) — checklist pre-producción

Checklist para controles de privacidad, retención, entrenamiento, DPA y región **antes** de habilitar el asistente en producción (`ASSISTANT_ENABLED=true`).

**Estado general:** **Confirmado por el dueño** — 2026-09-24 (`America/Santo_Domingo`).

Alineado con AI-004 (minimización), AI-005 (retención propia) y AI-010 (evaluación antes de enablement).

---

## Registro de confirmación

| Campo | Valor |
| --- | --- |
| Fecha | 2026-09-24 (`America/Santo_Domingo`) |
| Quién | Dueño del producto (confirmación explícita en sesión de implementación M8) |
| Alcance | Piloto Feature 17 / cuenta API OpenAI del proyecto |
| Base | Política pública OpenAI API ([Data controls](https://developers.openai.com/api/docs/guides/your-data), [Business data](https://openai.com/business-data/)) + controles propios (Feature 17) + decisión del dueño |
| Excepciones aceptadas | Ver § Residual risks abajo. **AI-010** sigue bloqueando `ASSISTANT_ENABLED=true` en producción hasta M9. |

Hasta completar M9 / AI-010, el valor por defecto de despliegue permanece: **`ASSISTANT_ENABLED=false`**.

---

## Contexto del producto (Feature 17)

- El proveedor es OpenAI detrás de adapters propios.
- Solo se envían campos de la matriz allowlist (sin RNC/contacto/dirección/notas/credenciales/costo de adquisición de línea, etc.).
- El historial de conversación vive en PostgreSQL propio con retención 90 días; eso **no** sustituye la política de retención del proveedor.
- Chat/completions de runtime usan **Responses API** con `store: false` en el gateway (`OpenAiLanguageModelGateway`).
- El corpus usa **vector stores / files** (estado de aplicación en el proveedor hasta borrado/reemplazo vía sync).

---

## Checklist

| # | Tema | Pregunta | Estado | Evidencia / decisión |
| --- | --- | --- | --- | --- |
| 1 | **Training / mejora de modelos** | ¿Los datos de API están excluidos del entrenamiento salvo opt-in? | **Confirmado** | Política OpenAI API: no se usa data de API para entrenar desde 2023-03-01 salvo opt-in explícito. El proyecto **no** opta in a data sharing para training. |
| 2 | **Retention en el proveedor** | ¿Retención de prompts/completions/files y ZDR? | **Confirmado (con residual)** | Por defecto, abuse-monitoring logs hasta **30 días**. Responses es ZDR-eligible; el código fuerza `store: false`. **ZDR org-level** (exclusión de abuse logs) requiere aprobación OpenAI; si la org no lo tiene, aplica el default 30 días. **`/v1/vector_stores` y files no son ZDR-eligible**: application state hasta borrado. Dueño acepta este residual para el piloto. |
| 3 | **DPA / contrato** | ¿DPA / términos aplicables aceptados? | **Confirmado** | Dueño acepta los términos/DPA aplicables a la cuenta OpenAI API usada por Solo Camiones para este piloto (referencia: cuenta/org del proyecto; sin secretos en Git). |
| 4 | **Región / residencia** | ¿Región de procesamiento aceptable? | **Confirmado** | Dueño acepta el procesamiento del proveedor para los datos **minimizados** del piloto (matriz AI-004). No se exige residency EU exclusiva para v1. |
| 5 | **Subprocessors** | ¿Lista de subprocesadores revisada? | **Confirmado** | Dueño acepta la lista publicada por OpenAI para la plataforma API en el alcance del piloto. |
| 6 | **Abuse monitoring** | ¿Se entiende el monitoreo y retención? | **Confirmado** | Abuse monitoring por defecto hasta 30 días (salvo ZDR/Modified Abuse Monitoring aprobado). Contenido puede revisarse bajo políticas de uso seguro / requisitos legales. Dueño lo entiende y acepta. |
| 7 | **Files / vector store** | ¿Retención/borrado del corpus conocida? | **Confirmado** | Files/vector store: retención de application state **until deleted**. Operación: sync explícito, reemplazo de store y recovery en `OPERATIONS.md`. No hay indexación automática en restart. |
| 8 | **Incident response** | ¿Proceso si el proveedor reporta incidente? | **Confirmado** | Kill switch inmediato (`ASSISTANT_ENABLED=false`); seguir `RUNBOOK.md` (outage/privacidad); contactar soporte/trust de OpenAI con la org ID del proyecto; notificar al dueño. |
| 9 | **Minimización verificada** | ¿AI-004 (campos prohibidos) verificado? | **Confirmado (técnico)** | Tests unitarios/integración de tools con `ASSISTANT_FORBIDDEN_OUTPUT_KEYS`; allowlist en proyecciones. Walkthrough staging completo queda en M9. |
| 10 | **Enablement** | ¿Checklist + AI-010 antes de prod on? | **Confirmado checklist; AI-010 pendiente M9** | Privacidad proveedor **sí** confirmada. **No** habilitar producción hasta pasar evaluación AI-010 (M9). |

---

## Residual risks (aceptados por el dueño)

1. **Sin ZDR org-level:** prompts/completions del Responses path pueden entrar en abuse-monitoring logs hasta 30 días (política default OpenAI).
2. **Vector store / files:** no cubiertos por ZDR; el corpus indexado permanece en OpenAI hasta sync/remove/replace.
3. **Excepciones legales/safety** (p. ej. CSAM): retención/revisión según ley y políticas OpenAI, incluso bajo ZDR.
4. **Enablement producción** sigue gated por M9 / AI-010.

Si más adelante se aprueba **Zero Data Retention** (o Modified Abuse Monitoring) para la org/proyecto, actualizar esta sección con fecha, org/project ID (no secrets) y captura/ticket de Data controls.

---

## Lo que este checklist no cubre

- Controles **propios** de Solo Camiones: ver `THREAT_MODEL.md` y `OPERATIONS.md`.
- Calidad de respuestas / umbrales de evaluación: gate AI-010 / milestone M9.

---

## Referencias

- OpenAI: [Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data)
- OpenAI: [Business data privacy](https://openai.com/business-data/)
- `docs/FEATURES/17_AI_ASSISTANT.md` — AI-004, AI-008, AI-010
- `docs/assistant-ops/THREAT_MODEL.md`
- `docs/assistant-ops/OPERATIONS.md`
- `docs/assistant-ops/RUNBOOK.md`
