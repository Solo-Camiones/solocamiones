# Rollout checklist (M9 staging / producción)

Estas tareas **no** las automatiza el runner. Completarlas el dueño cuando exista entorno desplegable.

## Staging / local enablement (M9-T08–T14)

- [ ] Desplegar (o arrancar local) con `ASSISTANT_ENABLED=false` primero
- [ ] Aplicar migración assistant y verificar índices
- [ ] `npm run assistant:sync-knowledge` sobre el vector store del entorno
- [ ] Habilitar para cuenta Administrator de prueba (`ASSISTANT_ENABLED=true`)
- [ ] Walkthrough desktop + móvil (&lt;768px)
- [ ] Probar outage / 429 / timeout / abort / cuota / purge (ver `docs/assistant-ops/RUNBOOK.md`)
- [ ] Aprobación del dueño registrada (baseline AI-010 ya en `BASELINE.md`; falta sign-off de enablement del piloto)

## Cierre producción (M9-T25–T27)

- [ ] Desplegar producción con flag **apagado** + smoke comercial
- [ ] Habilitar solo Administrator tras baseline congelado
- [ ] Monitorear 24/72h; kill switch ante exposición o respuesta sin evidencia

## Validación de repo (M9-T15–T24)

Ver `docs/chatbot_implementation/IMPLEMENTATION_PLAN.md` sección M9 y `docs/TESTING.md`.
