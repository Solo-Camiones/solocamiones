# Assistant ops — Feature 17 (M8)

Documentación de **seguridad y operaciones** del asistente híbrido RAG (milestone M8).

La especificación de producto sigue siendo `docs/FEATURES/17_AI_ASSISTANT.md`. El plan técnico de secuencia vive en `docs/chatbot_implementation/IMPLEMENTATION_PLAN.md`. Este directorio no sustituye esos documentos: describe amenazas, runbook, privacidad del proveedor, operación diaria y un fragmento de job de purge.

**Estado de privacidad OpenAI:** ver `PROVIDER_PRIVACY.md` — **Confirmado por el dueño (2026-09-24)**; AI-010 / M9 sigue bloqueando enablement en producción.

---

## Índice

| Documento | Contenido |
| --- | --- |
| [THREAT_MODEL.md](./THREAT_MODEL.md) | Amenazas (secretos, PII, injection, corpus, tools, costos, outage) → mitigaciones previstas |
| [RUNBOOK.md](./RUNBOOK.md) | Diagnóstico: 401/403, 429, timeout, outage OpenAI, sync, purge, kill switch |
| [PROVIDER_PRIVACY.md](./PROVIDER_PRIVACY.md) | Checklist pre-producción OpenAI (retention/training/DPA/región) |
| [OPERATIONS.md](./OPERATIONS.md) | Rotación de key, vector store, recovery, métricas, alertas, purga, sync explícito |
| [purge.job.fragment.yaml](./purge.job.fragment.yaml) | Fragmento App Platform para `npm run assistant:purge` diario ~03:00 `America/Santo_Domingo` |

---

## Defaults operativos (referencia rápida)

| Variable | Default |
| --- | --- |
| `ASSISTANT_ENABLED` | `false` |
| `ASSISTANT_DAILY_MESSAGE_LIMIT` | `50` |
| `ASSISTANT_GLOBAL_DAILY_MESSAGE_LIMIT` | `100` |
| `ASSISTANT_RETENTION_DAYS` | `90` |

---

## Comandos CLI frecuentes

```bash
npm run assistant:purge -- --dry-run
npm run assistant:purge
npm run assistant:sync-knowledge -- --dry-run
npm run assistant:sync-knowledge
```

Sync y purge son operaciones **explícitas**; no se ejecutan al reiniciar la aplicación.
