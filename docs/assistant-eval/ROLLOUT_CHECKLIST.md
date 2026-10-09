# Validation checklist (M9 staging / producción)

Estas tareas **no** las automatiza el runner. Completarlas el dueño cuando exista entorno desplegable. Por decisión del dueño (2026-09-30), la lista ya no bloquea `ASSISTANT_ENABLED=true`; un hallazgo crítico sí puede exigir el kill switch conforme al runbook.

## Staging / local enablement (M9-T08–T14)

- [ ] Desplegar (o arrancar local) con `ASSISTANT_ENABLED=false` primero
- [ ] Aplicar migración assistant y verificar índices
- [ ] `npm run assistant:sync-knowledge` sobre el vector store del entorno
- [ ] Habilitar para cuenta Administrator de prueba (`ASSISTANT_ENABLED=true`)
- [ ] Walkthrough desktop + móvil (&lt;768px)
- [ ] Probar outage / 429 / timeout / abort / cuota / purge (ver `docs/assistant-ops/RUNBOOK.md`)
- [x] Aprobación del dueño registrada para habilitación desde el primer día productivo (2026-09-30)

## Operación productiva (M9-T25–T27)

- [ ] Desplegar con keys/vector store exclusivos de producción y `ASSISTANT_ENABLED=true`
- [ ] Smoke de acceso Administrator, evidencia, tools read-only, cuota y kill switch
- [ ] Monitorear 24/72h; kill switch ante exposición o respuesta sin evidencia

## Validación de repo (M9-T15–T24)

Ver `docs/chatbot_implementation/IMPLEMENTATION_PLAN.md` sección M9 y `docs/TESTING.md`.
