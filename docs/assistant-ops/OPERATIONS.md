# Operaciones — Feature 17 AI Assistant

Procedimientos de operación continua: rotación de key, vector store, recuperación, kill switch, métricas, alertas, purga y sync.

Zona horaria de negocio y jobs: **`America/Santo_Domingo`**.

---

## Defaults de configuración relevantes

| Variable | Default | Notas |
| --- | --- | --- |
| `ASSISTANT_ENABLED` | `false` | Kill switch; feature off por defecto |
| `ASSISTANT_DAILY_MESSAGE_LIMIT` | `50` | Cuota por usuario / día |
| `ASSISTANT_GLOBAL_DAILY_MESSAGE_LIMIT` | `100` | Cuota global de emergencia / día |
| `ASSISTANT_RETENTION_DAYS` | `90` | Base de `expiresAt` + purge |
| `OPENAI_API_KEY` | — | Secreto; nunca al frontend |
| `OPENAI_VECTOR_STORE_ID` | — | Un vector store **por entorno** |
| `METRICS_BEARER_TOKEN` | — | Secreto para scrapear métricas |

---

## 1. Rotación de `OPENAI_API_KEY`

1. Crear una nueva API key en la cuenta OpenAI del entorno (staging o producción).
2. Actualizar el secreto cifrado en App Platform / secret store del entorno (**no** commit).
3. Desplegar o reiniciar el servicio API para que lea el nuevo valor.
4. Smoke: una pregunta documental y una consulta tool (solo si `ASSISTANT_ENABLED=true` en ese entorno).
5. Revocar la key anterior en el panel de OpenAI.
6. Verificar que sync CLI (`assistant:sync-knowledge`) también usa el secreto actualizado del entorno desde el que se ejecuta.

**No:** rotar la key de producción para depurar staging; no pegar la key en tickets.

---

## 2. Crear / reemplazar vector store y re-sync del corpus

**Regla (AI-009):** la sincronización es una **operación explícita de CLI**. **Nunca** corre automáticamente al reiniciar la aplicación.

### Alta inicial (por entorno)

1. Crear un vector store vacío en OpenAI para ese entorno.
2. Guardar el id en `OPENAI_VECTOR_STORE_ID` (secreto/config del entorno).
3. Desde un checkout del repo con DB del entorno y secretos cargados:

```bash
npm run assistant:sync-knowledge -- --dry-run
npm run assistant:sync-knowledge
```

4. Confirmar documentos `READY` en `AssistantKnowledgeDocument`.
5. Solo entonces considerar habilitar el flag (evaluación M9 en producción).

### Reemplazo del vector store

1. Crear el **nuevo** store; no borrar el viejo hasta validar.
2. Apuntar `OPENAI_VECTOR_STORE_ID` al nuevo id.
3. Ejecutar sync completo (dry-run → sync).
4. Smoke de retrieval; comparar que no se sirven source keys no aprobadas.
5. Retirar/archivar el store antiguo según política del proveedor (ver `PROVIDER_PRIVACY.md`).

### Recuperación tras sync parcial o `FAILED`

1. Inspeccionar estados `FAILED` / checksum mismatch (sin volcar contenido sensible a chats).
2. Corregir manifest/archivo o permisos del store.
3. Re-ejecutar sync explícito.
4. Si el store está corrupto: reemplazar store (pasos de arriba) en lugar de “arreglar a mano” files huérfanos sin procedimiento.

---

## 3. Recuperación ante incidentes

| Escenario | Acción primaria | Notas |
| --- | --- | --- |
| Key filtrada | Rotar key + kill switch hasta confirmar | Revisar logs por exposición |
| Respuestas peligrosas / sin evidencia | `ASSISTANT_ENABLED=false` | Corregir corpus/prompt; re-eval AI-010 |
| Outage OpenAI | Aislar; no tocar comercio | Ver `RUNBOOK.md` |
| Cuota global agotada | Kill switch o esperar reset diario | Revisar abuso / límites |
| DB restore | Restaurar según runbook de infra | Historial assistant vuelve con el backup; puede reaparecer data ya purgada (residual) |

Readiness de la app **no** debe depender de OpenAI. Tras cualquier recuperación, verificar `/api/health/ready` y una ruta comercial.

---

## 4. Feature kill switch

```text
ASSISTANT_ENABLED=false
```

- Deshabilita la feature sin rollback de imagen (cambio de config).
- Clientes deben recibir `503` / `ASSISTANT_DISABLED` en la superficie del asistente.
- Credenciales OpenAI ausentes **no** deben impedir el boot mientras el flag esté en `false`.
- Re-enable en producción solo tras mitigación y gate de evaluación/aprobación del dueño.

Detalle de pasos: `RUNBOOK.md` → sección Kill switch.

---

## 5. Métricas — `GET /metrics`

Exposition Prometheus (`@prometheus-io/client`). Si `METRICS_BEARER_TOKEN` está vacío/ausente → **404** (scrape deshabilitado). Con token → exige `Authorization: Bearer …`.

```http
GET /metrics
Authorization: Bearer <METRICS_BEARER_TOKEN>
```

**Uso**

- Scraping desde el sistema de monitoreo (p. ej. Better Stack / exporter interno).
- **No** exponer en el edge público de Cloudflare sin el secreto; **no** poner el token en el frontend.
- Readiness (`/api/health/ready`) permanece independiente de OpenAI y de este endpoint.

**Series del asistente**

| Serie | Qué mide |
| --- | --- |
| `assistant_runs_total{status}` | Runs `COMPLETED` / `FAILED` / `CANCELLED` |
| `assistant_ttft_seconds` | Tiempo hasta el primer token visible al cliente |
| `assistant_latency_seconds` | Latencia end-to-end del run |
| `assistant_tokens_total{direction}` | Tokens `input` / `output` |
| `assistant_errors_total{code}` | Errores por `errorCode` seguro |
| `assistant_quota_rejections_total{scope}` | Rechazos `user` / `global` antes del proveedor |
| `assistant_tool_calls_total{tool}` | Ejecuciones de tools allowlisted |
| `assistant_knowledge_sync_failures_total` | Fallos de pasos de sync |

Los logs de aplicación asociados al run deben incluir IDs, modelo, latencia, tokens, tools, status y `errorCode` — **sin** prompts, respuestas completas, chunks ni payloads de tools.

---

## 6. Ideas de alertas

Configurar en el stack de monitoreo (DigitalOcean + Better Stack u equivalente). Umbrales exactos: ajustar en piloto.

| Alerta | Condición sugerida | Severidad | Acción |
| --- | --- | --- | --- |
| Assistant 5xx | Tasa de 5xx en `/api/assistant/*` por encima de baseline | High | Runbook outage / logs `errorId` |
| Timeout | Timeouts o latencia P95 > umbral sostenido | Medium | Runbook timeout; status OpenAI |
| 429 rate limit | Ráfaga de 429 HTTP del assistant | Medium | ¿abuso o límite demasiado bajo? |
| Cuota user/global | Rechazos por `ASSISTANT_DAILY_*` / global | Medium/High | Costo; posible kill switch si global |
| Sync failed | Job/CLI de sync con exit ≠ 0 o docs `FAILED` | High | Runbook sync; no ignorar en staging pre-piloto |

Alertas de plataforma existentes (CPU, memoria, health checks) siguen aplicando; un fallo de OpenAI **no** debe marcar ready como down.

---

## 7. Purga programada

- Retención: **90 días** (`ASSISTANT_RETENTION_DAYS`).
- Comando: `npm run assistant:purge` (probar antes con `--dry-run`).
- Schedule objetivo: diario ~**03:00** `America/Santo_Domingo`.
- Fragmento App Platform: `purge.job.fragment.yaml` (debe **mergearse** en App Specs futuros; no es un spec completo).

### Retención residual en backups

La purge elimina filas assistant en la base primaria. **Copias residuales** pueden permanecer en backups automáticos de PostgreSQL hasta que expire la retención de backup del proveedor de infra. Eso es esperado; no implica que la app siga sirviendo esas conversaciones por API tras la purge.

---

## 8. Sync vs restart (recordatorio)

| Operación | ¿Automática en app restart? |
| --- | --- |
| Carga de config / kill switch | Sí (lee env) |
| `assistant:sync-knowledge` | **No** — solo CLI/ops explícito |
| `assistant:purge` | **No** en restart — job programado o CLI manual |

---

## Referencias

- `docs/assistant-ops/RUNBOOK.md`
- `docs/assistant-ops/THREAT_MODEL.md`
- `docs/assistant-ops/PROVIDER_PRIVACY.md`
- `docs/assistant-ops/purge.job.fragment.yaml`
- `docs/FEATURES/17_AI_ASSISTANT.md`
- `docs/INFRASTRUCTURE_PLAN.md` (dependencia opcional OpenAI)
