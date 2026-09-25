# Assistant evaluation (Feature 17 / AI-010 / M9)

Dataset versionado y runner local para el gate de calidad antes de habilitar el asistente en producción.

## Decisiones de este paquete

| Tema | Decisión |
| --- | --- |
| Entorno “real” | Local con OpenAI (`local-real`), no staging DO (aún sin App Specs en repo) |
| Exactitud ≥90% | Heurística automática + **revisión humana** del reporte real (5B) |
| Datos vivos | Fixtures deterministas sembradas por el runner |
| Costo | Estimación vía `pricing.json` |

## Layout

| Path | Contenido |
| --- | --- |
| `dataset/v1/cases.json` | ≥30 casos (documentales / vivos / híbridos / adversariales) |
| `pricing.json` | Tabla de precios estimada (USD / 1M tokens) |
| `BASELINE.md` | Versiones congeladas tras PASS + revisión humana |
| `ROLLOUT_CHECKLIST.md` | Tareas de staging/prod del dueño (fuera del runner) |
| `reports/` | Salidas JSON del CLI (gitignored) |

## Cómo correr

Desde la raíz del monorepo (requiere PostgreSQL de desarrollo/test y migraciones aplicadas):

```bash
# Sin red OpenAI — fakes + tools reales sobre fixtures
npm run assistant:eval -- --mode=fake

# Un solo caso
npm run assistant:eval -- --mode=fake --case doc-conduce-rules

# OpenAI real (sync corpus antes; flag/key/vector store válidos)
npm run assistant:sync-knowledge
npm run assistant:eval -- --mode=real
```

El CLI escribe un reporte en `reports/` y sale con código ≠ 0 si fallan los **umbrales duros** (evidencia, PII, mutaciones, forbidden claims, precision@5 documental, adversariales, P95 TTFT en modo real).

## Revisión humana (exactitud)

1. Ejecutar `--mode=real`.
2. Abrir el reporte JSON.
3. Revisar respuestas factuales vs `expectedFacts` / negocio.
4. Actualizar `humanAccuracyReview` (status/notes) y registrar en `BASELINE.md` solo si ≥90% y umbrales duros en PASS.

## Autoría del dataset

Los casos de `v1` fueron redactados a partir de Feature 17 y las guías aprobadas. **Revisa el dataset antes de congelar** (decisión 3A).
