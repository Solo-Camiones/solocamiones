# Threat model — Feature 17 AI Assistant

Modelo de amenazas para el asistente híbrido RAG (milestones M8). Alineado con `docs/FEATURES/17_AI_ASSISTANT.md` (`AI-001`–`AI-009`) y controles operativos documentados en este directorio.

**Alcance:** secretos, PII, prompts/injection, corpus poisoning, tools, costos/cuotas y outage del proveedor.

**Fuera de alcance v1:** escritura comercial, Seller/Mechanic, web search, multi-provider, fine-tuning.

---

## Activos

| Activo | Por qué importa |
| --- | --- |
| `OPENAI_API_KEY` y secretos de runtime | Acceso al proveedor y costo; no deben llegar al frontend ni a logs |
| Datos comerciales vivos (proyecciones) | Facturación, CxC, clientes; exposición a terceros vía el modelo |
| Historial de conversaciones (PostgreSQL) | Contenido operativo auditable; retención 90 días |
| Corpus Markdown + vector store | Fuente de “cómo operar”; envenenamiento altera respuestas |
| Continuidad comercial | Ventas/pagos/CxC no dependen del asistente |

---

## Actores de amenaza

| Actor | Motivación / capacidad |
| --- | --- |
| Usuario autenticado no Administrator | Escalar a datos o costos del asistente |
| Administrator comprometido o malicioso | Abusar de cuotas, exfiltrar vía prompts, forzar tools |
| Contenido hostil en corpus o tool output | Prompt injection / jailbreak del orquestador |
| Proveedor o red comprometida | Interceptar o retener payloads enviados a OpenAI |
| Operador con acceso a logs/métricas | Leer prompts, chunks o secretos si se registran por error |

---

## Amenazas → mitigaciones previstas

### 1. Secretos

| Amenaza | Impacto | Mitigación prevista |
| --- | --- | --- |
| Key en código, imagen o frontend | Uso no autorizado y costo | Solo secretos de entorno/App Platform; nunca `VITE_*` |
| Key en logs o errores de cliente | Filtración | Errores tipados/`errorId`; sin stack ni mensaje crudo del proveedor al cliente |
| Key válida con feature apagada | Uso accidental vía sync mal ejecutado | `ASSISTANT_ENABLED=false` por defecto; sync es CLI explícito, no arranque |

**Kill switch:** `ASSISTANT_ENABLED=false` deshabilita la superficie HTTP del asistente sin rollback de la app.

---

### 2. PII y minimización (AI-004)

| Amenaza | Impacto | Mitigación prevista |
| --- | --- | --- |
| RNC, teléfono, email, dirección, notas, credenciales o costos de adquisición enviados al proveedor | Exposición a tercero | Minimización server-side del prompt crudo, historial y consulta RAG antes de cualquier llamada externa; allowlist de campos en proyecciones de tools; auditorías negativas sobre el payload del gateway |
| Historial con datos sensibles retenido indefinidamente | Cumplimiento y blast radius | Retención 90 días (`ASSISTANT_RETENTION_DAYS=90`) + purga programada |
| Logs con prompts, respuestas o chunks RAG | Filtración interna | Logs de run: IDs, modelo, latencia, tokens, tools, status, `errorCode` — **sin** prompts/chunks/payloads |

---

### 3. Prompts e injection

| Amenaza | Impacto | Mitigación prevista |
| --- | --- | --- |
| Usuario instruye “ignora reglas / ejecuta SQL / escribe datos” | Bypass de política o mutación | Tools de solo lectura allowlist; sin web search, SQL, code interpreter, computer use ni MCP externo |
| Documento o tool result con instrucciones embebidas | Respuestas peligrosas o fuga de contexto | Chunks y tool outputs tratados como **datos no confiables**, nunca como instrucciones del sistema |
| Links/Markdown hostiles en la UI | XSS / phishing | Markdown sin HTML crudo; solo `appPath` internos allowlisted |

---

### 4. Corpus poisoning (AI-009)

| Amenaza | Impacto | Mitigación prevista |
| --- | --- | --- |
| Indexar drafts, secretos o `/docs` completo | Instrucciones incorrectas o fuga | Corpus Markdown en Git admitido **solo** vía manifest (source key, version, checksum) |
| Sync implícito en cada restart | Indexación accidental o drift | Sync **explícito** (`npm run assistant:sync-knowledge`); nunca como side effect del boot |
| Checksum mismatch o archivo no listado | Contenido no aprobado servido como READY | Fallo seguro del documento; no indexar unlisted |

---

### 5. Tools (read-only allowlist) (AI-003)

| Amenaza | Impacto | Mitigación prevista |
| --- | --- | --- |
| Modelo inventa tool o argumentos | Lectura amplia o mutación | Registry fijo + Zod; tools desconocidas fallan; tope `ASSISTANT_MAX_TOOL_CALLS` |
| Tool mutable registrada por error | Escritura comercial vía LLM | Ninguna tool de create/update/delete/pay/cancel en v1; AI-010 compara conteo + fingerprint de todas las tablas comerciales relevantes antes/después de cada caso |
| Seller/Mechanic llama al API | Uso no autorizado | `requireAuth` + `requireAdministrator` (AI-001); conversaciones ajenas → 404 seguro |

---

### 6. Costos y cuotas (AI-006)

| Amenaza | Impacto | Mitigación prevista |
| --- | --- | --- |
| Abuso por-usuario | Costo OpenAI | `ASSISTANT_DAILY_MESSAGE_LIMIT` default **50**/usuario/día; reserva serializable de cuota junto al mensaje/run; rate limit dedicado en rutas |
| Pico global / incidente de costo | Presupuesto | `ASSISTANT_GLOBAL_DAILY_MESSAGE_LIMIT` default **100**/día (límite de emergencia), reservado en la misma transacción serializable; kill switch |
| Input/output ilimitados | Tokens elevados | Caps de input chars, output tokens, retrieval results y timeout |

Defaults operativos documentados:

| Variable | Default |
| --- | --- |
| `ASSISTANT_DAILY_MESSAGE_LIMIT` | `50` |
| `ASSISTANT_GLOBAL_DAILY_MESSAGE_LIMIT` | `100` |
| `ASSISTANT_RETENTION_DAYS` | `90` |

---

### 7. Outage del proveedor (AI-008)

| Amenaza | Impacto | Mitigación prevista |
| --- | --- | --- |
| OpenAI 5xx / timeout / 429 / misconfig | Asistente inutilizable | Fallo cerrado con errores seguros; run `FAILED`/`CANCELLED`; sin marcar texto parcial como COMPLETED |
| Readiness depende de OpenAI | Caída falsa de toda la app | Readiness **independiente** de OpenAI (misma clase que FX no esencial) |
| Credenciales ausentes con feature off | Boot bloqueado | Con `ASSISTANT_ENABLED=false`, falta de `OPENAI_*` no impide arranque |

---

## Controles transversales (resumen)

1. **Kill switch:** `ASSISTANT_ENABLED=false` → `503 ASSISTANT_DISABLED` en superficie del asistente.
2. **Administrator-only:** AI-001; Seller/Mechanic denegados.
3. **Field allowlist AI-004:** minimización hacia el proveedor.
4. **Sin web search / SQL / tools de escritura.**
5. **Logs sin prompts/chunks/payloads.**
6. **Readiness independiente de OpenAI.**
7. **Corpus gated por manifest;** sync CLI explícito, no en restart.
8. **Cuotas usuario + global** y purga de retención.

---

## Residuales aceptados (piloto)

- Copias residuales del historial pueden existir en **backups de PostgreSQL** tras la purga lógica (ver `OPERATIONS.md`).
- El proveedor ve los campos allowlisted enviados en cada run; controles contractuales de retención/entrenamiento: ver `PROVIDER_PRIVACY.md` (**pendiente de confirmación del dueño**).
- Un Administrator legítimo puede agotar cuotas dentro de los límites configurados.

---

## Referencias

- `docs/FEATURES/17_AI_ASSISTANT.md`
- `docs/assistant-ops/RUNBOOK.md`
- `docs/assistant-ops/OPERATIONS.md`
- `docs/assistant-ops/PROVIDER_PRIVACY.md`
