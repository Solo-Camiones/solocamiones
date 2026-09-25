# Baseline histórica — revalidación requerida (AI-010 / M9-T07)

La baseline del 2026-09-24 queda **superseded** por el hardening del 2026-09-25: minimización server-side de prompt/history/RAG/tool context y reemplazo del gate de conteos netos por fingerprints de todas las tablas comerciales relevantes. Los resultados siguientes se conservan como evidencia histórica, pero ya no autorizan rollout hasta repetir fake + local-real y la revisión humana sobre el código corregido.

| Campo | Valor |
| --- | --- |
| Fecha | 2026-09-24 |
| Dataset version | `1.0.0` |
| Prompt version | `assistant-v1.2` (`ASSISTANT_PROMPT_VERSION`) |
| Chat model | `gpt-5.4-mini-2026-03-17` |
| Corpus document versions | las 6 guías en `docs/assistant-knowledge/manifest.json` → `1.0.0` / `approved` |
| Límites | defaults de `.env.example`: daily 50/user + 100 global; max input 2000; max output 1200; max tools 3; max retrieval 6; score ≥0.55; timeout 45s; retention 90d |
| Reporte fake histórico | `docs/assistant-eval/reports/report-2026-09-25T01-24-48-178Z.json` (39/39, hard gates PASS con el gate anterior, gitignored) |
| Reporte real histórico | `docs/assistant-eval/reports/report-2026-09-25T01-19-46-067Z.json` (hard gates PASS con el gate anterior; heurística 17/39; ~USD 0.054; gitignored) |
| Exactitud humana histórica | approved (≥90%, decision 5B) sobre el reporte real superseded |
| Hard gates real históricos | evidencia 100%; PII/mutaciones/forbidden 0; adversarial 100%; precision@5 doc 95%; P95 TTFT 4938 ms (&lt; 8000) |
| Notas | El runner corregido tiene pruebas unitarias e integración PostgreSQL de fingerprints. La CLI fake no pudo reejecutarse en esta sesión por `uv_os_get_passwd ENOMEM` del runtime `tsx`; local-real no se ejecutó para evitar costo externo sin una baseline fake nueva. Piloto prod sigue apagado. |

## Condiciones para congelar la nueva baseline

1. [ ] `assistant:eval --mode=fake` → hard gates PASS con minimización y fingerprints  
2. [ ] `assistant:eval --mode=real` → hard gates PASS (P95 TTFT local-real)  
3. [ ] Revisión humana de exactitud ≥90% sobre el nuevo reporte real (decision 5B)  
4. [ ] Aprobación del dueño para **habilitar** el piloto en el entorno desplegado (ver `ROLLOUT_CHECKLIST.md` M9-T14 / T26)
