# Runbook — Feature 17 AI Assistant

Guía operativa para diagnosticar fallos del asistente sin exponer secretos. Zona de negocio: `America/Santo_Domingo`.

**Principio:** no pegar `OPENAI_API_KEY`, tokens, prompts, chunks RAG ni payloads de tools en tickets, chat o capturas. Usar `errorId`, `runId`, `conversationId` y códigos de error seguros.

---

## Chequeos previos (siempre)

1. Confirmar entorno (local / staging / producción).
2. Verificar `ASSISTANT_ENABLED` **sin** imprimir otros secretos:
   - En App Platform: UI de variables → solo el valor booleano.
   - Local: `echo` del nombre de variable, no del resto del `.env`.
3. Confirmar rol: solo `ADMINISTRATOR` (AI-001).
4. Confirmar que ventas/CxC/health siguen OK (el outage del asistente no debe tumbar comercio).
5. Revisar métricas/alertas (`GET /metrics` con bearer; ver `OPERATIONS.md`) si están cableadas en el entorno.

Verificación segura de salud de la app (no prueba OpenAI):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://<host>/api/health/live
curl -sS -o /dev/null -w "%{http_code}\n" https://<host>/api/health/ready
```

Esperado: ambos `200` aunque OpenAI esté caído.

---

## 401 Unauthorized

**Síntoma:** llamadas a `/api/assistant/*` responden `401`.

**Causas probables**

- Sesión ausente, expirada o cookie `sid` no enviada (`credentials: include`).
- CSRF faltante o inválido en `POST`/`DELETE`.

**Acciones**

1. Re-login como Administrator en el mismo origen.
2. Confirmar que mutaciones envían header CSRF del contrato de Access.
3. Si solo el asistente falla pero `/api/auth/session` también es 401 → problema de sesión, no de OpenAI.

**No hacer:** rotar `OPENAI_API_KEY` por un 401 de sesión.

---

## 403 Forbidden

**Síntoma:** `403` en rutas del asistente.

**Causas probables**

- Usuario autenticado con rol `SELLER` o `MECHANIC`.
- Middleware de autorización rechaza el rol (esperado por AI-001).

**Acciones**

1. Verificar rol del actor en Users (sin compartir contraseñas).
2. Usar una cuenta Administrator de prueba en staging.
3. Si un Administrator recibe 403 de forma consistente, revisar despliegue/middleware — no es cuota ni OpenAI.

**Nota:** conversaciones ajenas deben verse como **404**, no 403 (evitar enumeración).

---

## 429 — Rate limit y cuotas diarias

Hay **tres** capas conceptuales; el cliente ve `429` / `TOO_MANY_REQUESTS` o un error de cuota seguro según la implementación.

### A) Rate limit HTTP dedicado del asistente

**Síntoma:** ráfaga corta de requests → 429; otras APIs comerciales OK.

**Acciones**

1. Esperar la ventana del limiter; no reintentar en bucle desde el panel.
2. Confirmar que no hay script/cliente duplicado golpeando SSE.
3. Si el límite es demasiado agresivo para el piloto, ajustar config en un cambio controlado (no “abrir” sin métricas).

### B) Cuota diaria por usuario

**Default:** `ASSISTANT_DAILY_MESSAGE_LIMIT=50` mensajes/usuario/día.

**Síntoma:** mensajes rechazados tras uso normal; otros Administrators pueden seguir OK.

**Acciones**

1. Confirmar con métricas/logs de run (conteos, no contenido) si el usuario agotó el día.
2. No subir el límite en producción sin aprobación de costo.
3. Informar al usuario que espere al reset diario (calendario de negocio).

### C) Cuota global de emergencia

**Default:** `ASSISTANT_GLOBAL_DAILY_MESSAGE_LIMIT=100` mensajes/día (todos los usuarios).

**Síntoma:** varios Administrators fallan cerca del mismo umbral; métrica de cuota global dispara.

**Acciones**

1. Tratar como incidente de costo: activar kill switch si el gasto es anómalo (`ASSISTANT_ENABLED=false`).
2. Revisar alertas de 429/cuota (ver `OPERATIONS.md`).
3. Solo subir el global con aprobación explícita del dueño.

**Verificación segura:** consultar métricas agregadas o conteos de runs del día; **no** exportar textos de mensajes.

---

## Timeout

**Síntoma:** error de timeout / run `FAILED`; default `ASSISTANT_REQUEST_TIMEOUT_MS=45000`.

**Causas probables**

- Latencia de OpenAI o red.
- Tools lentas / demasiadas llamadas (tope `ASSISTANT_MAX_TOOL_CALLS`).
- Cliente abortó (Stop) — puede mapear a `CANCELLED`.

**Acciones**

1. Reintentar **una** vez con el mismo `clientRequestId` si el UI lo soporta (idempotencia).
2. Verificar status de OpenAI (status page) sin pegar API keys.
3. Confirmar que readiness comercial sigue `200`.
4. Si timeouts son sostenidos → degradación controlada o kill switch; no reiniciar la app “por si acaso”.

---

## Outage de OpenAI

**Síntoma:** 5xx/503 del asistente, `errorCode` de proveedor mapeado; ventas y `/api/health/ready` OK.

**Acciones**

1. Confirmar aislamiento: emitir factura/listar CxC de prueba en staging; health ready `200`.
2. Comunicar “asistente temporalmente no disponible”; no implica caída del ERP.
3. Opcional: `ASSISTANT_ENABLED=false` para silenciar reintentos de usuarios hasta recuperación.
4. Tras recuperación del proveedor: re-habilitar flag; smoke de una pregunta documental y una tool viva.

**No hacer:** cambiar `OPENAI_VECTOR_STORE_ID` ni re-sync masivo solo por outage transitorio.

---

## Fallo de knowledge sync

**Síntoma:** CLI `npm run assistant:sync-knowledge` falla; documentos en `FAILED` / no `READY`; retrieval vacío o pobre.

**Acciones**

1. Ejecutar primero dry-run si está disponible:  
   `npm run assistant:sync-knowledge -- --dry-run`
2. Verificar (sin imprimir secretos):
   - presencia de `OPENAI_API_KEY` y `OPENAI_VECTOR_STORE_ID` en el entorno del CLI;
   - manifest y checksums del corpus aprobado;
   - que el vector store ID corresponde al **mismo** entorno (staging ≠ producción).
3. Corregir checksum/manifest o permisos del store; reintentar sync **explícito**.
4. Confirmar estados en `AssistantKnowledgeDocument` (`READY` vs `FAILED`).

**Reglas**

- Sync **nunca** corre en restart de la app (AI-009).
- No indexar archivos fuera del manifest.
- `ASSISTANT_ENABLED` puede seguir `false` mientras se repara el corpus.

---

## Purge (retención 90 días)

**Comandos** (desde la raíz del monorepo):

```bash
npm run assistant:purge -- --dry-run
npm run assistant:purge
```

| Modo | Efecto |
| --- | --- |
| `--dry-run` | Lista/cuenta candidatos; **no** borra |
| sin flag | Elimina conversaciones expiradas en lotes (cascade solo tablas assistant) |

**Acciones ante fallo de purge**

1. Correr dry-run; capturar conteos, no contenidos.
2. Verificar `DATABASE_URL` del job (rol con DML suficiente; no usar credenciales de backup write).
3. Confirmar que el schedule del job (~03:00 `America/Santo_Domingo`) está mergeado en el App Spec — ver `purge.job.fragment.yaml`.
4. Reintentar una vez; si persiste, abrir incidente (crecimiento de tablas assistant).

**No hacer:** `prisma migrate reset` ni borrar tablas comerciales.

**Residual:** filas purgadas pueden existir aún en backups de DB hasta que expire la retención de backup.

---

## Kill switch (`ASSISTANT_ENABLED=false`)

**Cuándo usarlo**

- Sospecha de exposición de PII/secretos.
- Respuestas sin evidencia / alucinación grave en piloto.
- Costo anómalo o cuota global agotada de forma inesperada.
- Outage prolongado del proveedor con ruido de soporte.

**Pasos**

1. En el entorno afectado, set `ASSISTANT_ENABLED=false` (secret/variable de App Platform).
2. Redeploy o restart según cómo el runtime lea env (sin rollback de imagen si solo cambia config).
3. Verificar: `POST/GET` assistant → `503` con razón `ASSISTANT_DISABLED`; launcher oculto o capability off.
4. Verificar: health ready y rutas comerciales OK.
5. Registrar incidente (qué, cuándo, `errorId`s).

**Re-habilitar:** solo tras mitigación + (en producción) gate AI-010 / aprobación del dueño según proceso M9.

---

## Matriz rápida

| Señal | Mirar primero | Evitar |
| --- | --- | --- |
| 401 | Sesión / CSRF | Rotar OpenAI key |
| 403 | Rol no Admin | Subir cuotas |
| 429 | Rate limit vs cuota user/global | Reintentos agresivos |
| Timeout | Proveedor / tools / abort | Sync del corpus |
| Outage OpenAI | Aislamiento + status page | Restart masivo app |
| Sync fail | Manifest / store / CLI env | Sync en boot |
| Purge fail | Dry-run + DB job | Reset DB |
| Incidente seguridad/costo | Kill switch | Dejar flag on “para depurar en prod” |

---

## Referencias

- `docs/assistant-ops/THREAT_MODEL.md`
- `docs/assistant-ops/OPERATIONS.md`
- `docs/assistant-ops/purge.job.fragment.yaml`
- `docs/FEATURES/17_AI_ASSISTANT.md`
