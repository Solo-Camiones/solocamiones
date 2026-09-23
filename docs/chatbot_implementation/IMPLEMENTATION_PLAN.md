# Plan detallado de implementación — Asistente híbrido RAG para Solo Camiones

> **Autoridad:** la especificación canónica es `docs/FEATURES/17_AI_ASSISTANT.md` (`AI-001`–`AI-010`). Este archivo es solo secuencia técnica y progreso. **No implementes comportamiento desde este plan cuando exista un ID AI-* en Feature 17.**

## 1. Propósito y alcance

Implementar, después de cerrar la estabilización preproducción actual, un asistente conversacional exclusivo para `ADMINISTRATOR`, accesible mediante un panel lateral global y limitado a operaciones de consulta.

El asistente combinará:

1. RAG sobre documentos operativos curados y aprobados.
2. Herramientas de consulta sobre datos comerciales vivos.
3. Generación de respuestas mediante OpenAI.
4. Fuentes visibles, auditoría, límites de consumo y retención de 90 días.

No indexará transacciones en vectores, no tendrá herramientas de escritura y no consultará módulos que todavía sean mocks.

## 2. Decisiones confirmadas

| Área         | Decisión                                                                     |
| ------------ | ---------------------------------------------------------------------------- |
| Entrega      | Piloto posterior a la estabilización actual; no bloquea el primer despliegue |
| Usuarios     | Solo `ADMINISTRATOR`                                                         |
| Operaciones  | Solo lectura; crear/eliminar conversaciones sí está permitido                |
| Conocimiento | Base documental curada + datos comerciales vivos                             |
| Datos vivos  | Clientes, cotizaciones, conduces, facturas, pagos, CxC y rentabilidad        |
| Exclusiones  | Usuarios, sesiones, credenciales, auditoría general, inventario/WO mock      |
| Proveedor    | OpenAI detrás de interfaces propias                                          |
| UI           | Panel lateral global montado en `AppShell`                                   |
| Historial    | PostgreSQL, auditable, retención de 90 días                                  |
| Privacidad   | Solo campos mínimos; sin RNC, contacto, dirección o notas                    |
| Corpus       | Markdown versionado en Git y aprobado mediante manifest                      |
| Consumo      | Límites configurables por usuario, respuesta, retrieval y tools              |

## 3. Estado actual y brecha

### Estado actual

- Backend modular Express/TypeScript con PostgreSQL y Prisma.
- Flujo esperado: `Route -> Controller -> Service -> Repository -> Database`.
- Sesiones server-side y autorización para Administrator, Seller y Mechanic.
- Frontend React/Vite con contratos y repositories para HTTP/mocks.
- Clientes, ventas, conduces, pagos, CxC y rentabilidad ya existen en API/PostgreSQL.
- Inventario, jerarquía y Work Orders todavía incluyen superficies mock.
- No existen modelos, rutas, UI, configuración ni dependencias de IA/RAG.
- `/docs` mezcla comportamiento implementado y futuro; no debe indexarse completo.

### Estado deseado

Un Administrator podrá preguntar cómo operar el sistema o consultar datos comerciales. Cada respuesta deberá incluir evidencia, indicar frescura de datos, respetar permisos, reconocer evidencia insuficiente y evitar presentar prototipos como funcionalidad disponible.

### Brecha

Se necesitan especificación canónica, persistencia, corpus, sincronización, adapters de OpenAI, herramientas de dominio, orquestación, API SSE, cliente web, panel, seguridad, evaluación y operación.

## 4. Arquitectura objetivo

```text
Administrator
  -> AssistantPanel
  -> AssistantRepository web
  -> /api/assistant
  -> AssistantController
  -> AssistantService
     -> Conversation/Message/Run repositories
     -> KnowledgeRetriever -> OpenAI Vector Store Search
     -> AssistantToolRegistry
        -> Customers query service
        -> Sales query service
        -> Receivables query service
        -> Profitability query service
     -> LanguageModelGateway -> OpenAI Responses API
  -> SSE metadata/delta/sources/done/error
```

Reglas estructurales:

- Controllers solo administran HTTP/SSE.
- `AssistantService` coordina conversación, retrieval, tools, modelo, límites y persistencia.
- Cada módulo propietario expone una proyección pública de solo lectura.
- Assistant no accede directamente a repositorios Prisma de otros módulos.
- Objetos del SDK de OpenAI no salen de infraestructura.
- Documentos y tool outputs se tratan como datos no confiables, nunca como instrucciones.
- No se habilitan web search, code interpreter, computer use, MCP externo ni tools de escritura.

## 5. Contratos técnicos fijados

### 5.1 Configuración

| Variable                              |                   Default | Validación                              |
| ------------------------------------- | ------------------------: | --------------------------------------- |
| `ASSISTANT_ENABLED`                   |                   `false` | Feature apagada por defecto             |
| `OPENAI_API_KEY`                      |                         — | Requerida solo si está habilitado       |
| `OPENAI_CHAT_MODEL`                   | `gpt-5.4-mini-2026-03-17` | Inyectada, nunca hardcoded en servicios |
| `OPENAI_VECTOR_STORE_ID`              |                         — | Requerida solo si está habilitado       |
| `ASSISTANT_RETENTION_DAYS`            |                      `90` | 1–365                                   |
| `ASSISTANT_DAILY_MESSAGE_LIMIT`       |                      `50` | Mayor que cero                          |
| `ASSISTANT_MAX_INPUT_CHARS`           |                    `2000` | Validación HTTP y servicio              |
| `ASSISTANT_MAX_OUTPUT_TOKENS`         |                    `1200` | Enviado al proveedor                    |
| `ASSISTANT_MAX_TOOL_CALLS`            |                       `3` | Total por run                           |
| `ASSISTANT_MAX_RETRIEVAL_RESULTS`     |                       `6` | Total por pregunta                      |
| `ASSISTANT_RETRIEVAL_SCORE_THRESHOLD` |                    `0.55` | Ajustable tras evaluación               |
| `ASSISTANT_REQUEST_TIMEOUT_MS`        |                   `45000` | Timeout externo total                   |

Si la feature está apagada, credenciales ausentes no deben impedir que la aplicación arranque.

### 5.2 Persistencia

#### `AssistantConversation`

- UUID, `userId`, título máximo 120 caracteres.
- `createdAt`, `updatedAt`, `lastMessageAt`, `expiresAt`.
- Índices `(userId, lastMessageAt)` y `(expiresAt)`.

#### `AssistantMessage`

- UUID, `conversationId`, `role: USER | ASSISTANT`.
- `status: PENDING | COMPLETED | FAILED | CANCELLED`.
- Contenido, `clientRequestId`, `createdAt`, `completedAt`.
- Unique `(conversationId, clientRequestId)` e índice cronológico.

#### `AssistantRun`

- Relación unique al mensaje del usuario y nullable al mensaje assistant.
- Estado, modelo, versión de prompt y `providerResponseId` opcional.
- Tokens, tool count, tool calls sanitizadas, tiempos y latencia.
- `errorCode`/`errorId` seguros; nunca error crudo del proveedor.

#### `AssistantSource`

- Relación al mensaje assistant.
- `type: DOCUMENT | TOOL`, `sourceKey`, título, locator y orden.
- `appPath`, excerpt, score y `asOf` opcionales.
- Los tool results no se duplican completos aquí.

#### `AssistantKnowledgeDocument`

- `sourceKey`, título, versión y SHA-256.
- `status: SYNC_PENDING | INDEXING | READY | FAILED | REMOVED`.
- `providerFileId`, metadata, aprobación, indexación y error seguro.

Las relaciones internas usan cascade desde conversación; ninguna eliminación del asistente puede eliminar usuarios o datos comerciales.

### 5.3 API HTTP

Todas las rutas usan `requireAuth`, `requireAdministrator`, `Cache-Control: no-store`, rate limit dedicado y CSRF en POST/DELETE.

| Método   | Endpoint                                           | Resultado                            |
| -------- | -------------------------------------------------- | ------------------------------------ |
| `POST`   | `/api/assistant/conversations`                     | Crea conversación; `201`             |
| `GET`    | `/api/assistant/conversations?page=1`              | 20 conversaciones propias por página |
| `GET`    | `/api/assistant/conversations/:id/messages?page=1` | 50 mensajes propios por página       |
| `POST`   | `/api/assistant/conversations/:id/messages`        | Persiste pregunta y responde por SSE |
| `DELETE` | `/api/assistant/conversations/:id`                 | Elimina conversación propia; `204`   |

Body de mensaje:

```json
{
  "content": "Busca la factura FAC-000123",
  "clientRequestId": "uuid-generado-por-el-cliente"
}
```

Eventos SSE:

- `metadata`: conversationId, userMessageId y runId.
- `delta`: fragmento de texto.
- `sources`: fuentes normalizadas.
- `done`: assistantMessageId y uso.
- `error`: code, mensaje seguro, retryable y errorId.

Antes de iniciar el stream se usa el contrato HTTP normal. Después se usa `event: error`. Enviar heartbeat cada 15 segundos.

### 5.4 Herramientas permitidas

| Tool                           | Entrada                                      | Salida permitida                                     |
| ------------------------------ | -------------------------------------------- | ---------------------------------------------------- |
| `searchCustomers`              | query, tipo opcional, limit <= 20            | ID, nombre, tipo, estado y ruta                      |
| `getCustomerCommercialSummary` | customerId                                   | Nombre, condición comercial y agregados permitidos   |
| `searchSalesDocuments`         | texto/número, estado, cliente, fechas, limit | ID, COT/CON/FAC, estado, fecha, moneda, total y ruta |
| `getSalesDocumentDetail`       | documentId                                   | Líneas resumidas, totales, pagos y balance           |
| `getReceivablesSummary`        | cliente, vencidos, tipo, fecha de corte      | Agregados y hasta 20 documentos                      |
| `getProfitabilitySummary`      | dateFrom/dateTo, moneda                      | Agregados; rango máximo de 366 días                  |

Todas validan con Zod, repiten autorización en servicio, aplican queries acotadas, devuelven `asOf`/`sourceKey` y excluyen RNC, teléfono, email, dirección, notas, credenciales y usuarios.

### 5.5 Frontend

Tipos públicos: `AssistantConversation`, `AssistantMessage`, `AssistantSource`, `AssistantUsage`, `AssistantStreamEvent` y `AssistantRepository`.

El repository tendrá `createConversation`, `listConversations`, `listMessages`, `streamMessage` como `AsyncIterable` y `deleteConversation`.

## 6. Mapa de milestones

| Milestone | Nombre                      | Dependencias | Entregable                               |
| --------- | --------------------------- | ------------ | ---------------------------------------- |
| M0        | Especificación canónica     | —            | Feature 17 confirmada y trazable         |
| M1        | Fundaciones OpenAI          | M0           | Configuración, ports y adapters aislados |
| M2        | Persistencia y retención    | M0           | Migración, repositorios y purga          |
| M3        | Corpus y sincronización RAG | M1, M2       | Base aprobada e indexación reproducible  |
| M4        | Tools comerciales           | M0           | Consultas seguras de datos vivos         |
| M5        | Orquestador híbrido         | M1–M4        | RAG + tools + modelo                     |
| M6        | API y SSE                   | M2, M5       | Backend consumible por frontend          |
| M7        | Cliente y panel web         | M6           | UX completa para Administrator           |
| M8        | Seguridad y operación       | M3–M7        | Feature endurecida y operable            |
| M9        | Evaluación y rollout        | M8           | Piloto aprobado y habilitado             |

## 7. Milestones detallados

## M0 — Especificación canónica y trazabilidad

**Objetivo:** convertir el chatbot en una feature oficial antes de escribir código.

**Estado:** Completado (documentación) 2026-09-22.

### Tareas

- [x] `M0-T01` Crear `docs/FEATURES/17_AI_ASSISTANT.md`.
- [x] `M0-T02` Definir `AI-001` acceso exclusivo de Administrator.
- [x] `M0-T03` Definir `AI-002` respuestas documentales con fuentes.
- [x] `M0-T04` Definir `AI-003` tools comerciales de solo lectura.
- [x] `M0-T05` Definir `AI-004` minimización de datos enviados al proveedor.
- [x] `M0-T06` Definir `AI-005` historial/auditoría y retención de 90 días.
- [x] `M0-T07` Definir `AI-006` límites de consumo.
- [x] `M0-T08` Definir `AI-007` rechazo de mocks/futuro.
- [x] `M0-T09` Definir `AI-008` degradación segura ante outage.
- [x] `M0-T10` Definir `AI-009` corpus aprobado y sincronización.
- [x] `M0-T11` Definir `AI-010` evaluación obligatoria antes de producción.
- [x] `M0-T12` Documentar preguntas soportadas/no soportadas.
- [x] `M0-T13` Crear matriz de campos permitidos/prohibidos por tool.
- [x] `M0-T14` Actualizar índice de features y Development Plan.
- [x] `M0-T15` Actualizar Architecture Plan, Roles and Permissions e Infrastructure Plan.
- [x] `M0-T16` Crear matriz requisito -> milestone -> pruebas -> aceptación.
- [x] `M0-T17` Revisar conflictos con Features 08, 10, 11, 12, 13 y 16.

### Criterios de aceptación

- [x] Todas las reglas están en documentación canónica.
- [x] Cada requisito tiene prueba y criterio verificable.
- [x] Feature 17 está confirmada y no altera el gate preproducción vigente.

## M1 — Fundaciones y adapters de OpenAI

**Objetivo:** integrar el proveedor detrás de fronteras sustituibles.

**Estado:** Completado (local) 2026-09-23.

Notas de implementación: ports/adapters viven en `apps/api/src/infrastructure/openai/` (espejo FX). Factories exportadas; `createApp` aún no cablea gateways del assistant (decisión M1). `parseAssistantConfig()` sí corre en el boot de `index.ts` para fallar con env inválido. Streaming vía `AsyncIterable`. Errores tipados `AssistantProviderError`. Solo `.env.example` (sin forward en docker-compose todavía).

### Tareas

- [x] `M1-T01` Añadir SDK oficial `openai` al API con lockfile reproducible.
- [x] `M1-T02` Crear parser/configuración tipada y validar rangos.
- [x] `M1-T03` Inyectar config desde composition root; servicios no leen `process.env`.
- [x] `M1-T04` Definir `LanguageModelGateway`.
- [x] `M1-T05` Definir `KnowledgeRetriever`.
- [x] `M1-T06` Definir tipos internos para mensajes, chunks, tool calls, uso y errores.
- [x] `M1-T07` Crear `OpenAiClientFactory` con timeout y API key server-side.
- [x] `M1-T08` Implementar gateway de Responses con `store: false` y streaming.
- [x] `M1-T09` Implementar retriever de Vector Store Search.
- [x] `M1-T10` Traducir 401, 429, timeout, 5xx y respuestas inválidas a errores internos.
- [x] `M1-T11` Propagar `AbortSignal` al SDK.
- [x] `M1-T12` Redactar key, prompts y payloads en logging.
- [x] `M1-T13` Crear fakes deterministas; tests normales no usan Internet.
- [x] `M1-T14` Documentar variables en `.env.example` y despliegue, todavía apagadas.

### Pruebas

- [x] Config válida/inválida y feature apagada sin key.
- [x] `store: false`, modelo y límites enviados correctamente.
- [x] Streaming, abort y timeout.
- [x] Traducción de errores y redacción de logs.

### Gate

- [x] El dominio no importa el SDK y puede ejecutarse completamente con fakes.

## M2 — Persistencia, idempotencia y retención

**Objetivo:** registrar conversaciones y ejecuciones sin afectar datos comerciales.

**Estado:** Completado (local) 2026-09-23.

Notas de implementación: modelos Prisma + migración `20260923000000_assistant_persistence` con CHECKs e índice único parcial de un run `PENDING` por conversación. Repos en `apps/api/src/features/assistant/`. `expiresAt` sliding al tocar. Idempotencia `(conversationId, clientRequestId)` devolviendo el par existente. CLI `assistant:purge [--dry-run]` (lote 100). Sin API HTTP ni orquestador (M5/M6).

### Tareas

- [x] `M2-T01` Añadir enums/modelos Prisma definidos en 5.2.
- [x] `M2-T02` Añadir relaciones inversas mínimas en `User`.
- [x] `M2-T03` Crear migración nueva; nunca editar migraciones aplicadas.
- [x] `M2-T04` Añadir constraints/checks SQL no expresables por Prisma.
- [x] `M2-T05` Crear índices de propiedad, cronología, expiración y runs.
- [x] `M2-T06` Implementar repository de conversaciones con ownership obligatorio.
- [x] `M2-T07` Implementar repository de mensajes con paginación estable.
- [x] `M2-T08` Implementar repository de runs con transiciones condicionales.
- [x] `M2-T09` Implementar repositories de sources y knowledge documents.
- [x] `M2-T10` Hacer atómica la creación de mensaje user + run + touch de conversación.
- [x] `M2-T11` Impedir completar/fallar un run dos veces.
- [x] `M2-T12` Implementar idempotencia por `(conversationId, clientRequestId)`.
- [x] `M2-T13` Implementar purga por lotes usando `expiresAt`.
- [x] `M2-T14` Crear `assistant:purge` con `--dry-run`.
- [x] `M2-T15` Añadir scripts npm API/root.

### Pruebas

- [x] Migración en DB vacía y con datos.
- [x] FK, cascade y restricciones negativas.
- [x] Idempotencia y concurrencia.
- [x] Conversación ajena indistinguible de inexistente.
- [x] Paginación determinista.
- [x] Purga/dry-run y rollback transaccional.

### Gate

- [x] No se modifica ninguna tabla comercial y toda ejecución queda en estado consistente.

## M3 — Corpus aprobado y sincronización RAG

**Objetivo:** crear conocimiento versionado sin indexar `/docs` completo.

### Tareas

- [ ] `M3-T01` Crear `docs/assistant-knowledge/manifest.json`.
- [ ] `M3-T02` Validar manifest con Zod: sourceKey, title, version, status, audience, sourceRequirements, path y updatedAt.
- [ ] `M3-T03` Rechazar documentos sin `approved` o audiencia distinta de Administrator.
- [ ] `M3-T04` Crear guía de clientes/condiciones comerciales.
- [ ] `M3-T05` Crear guía de cotizaciones, conduces y facturas.
- [ ] `M3-T06` Crear guía de pagos, CxC y estados de cuenta.
- [ ] `M3-T07` Crear guía de cancelaciones/reembolsos.
- [ ] `M3-T08` Crear guía de rentabilidad/FX.
- [ ] `M3-T09` Crear guía explícita de capacidades todavía no disponibles.
- [ ] `M3-T10` Mantener encabezados estables y secciones pequeñas.
- [ ] `M3-T11` Calcular SHA-256 normalizando finales de línea.
- [ ] `M3-T12` Crear `assistant:validate-knowledge` sin red.
- [ ] `M3-T13` Crear `assistant:sync-knowledge --dry-run`.
- [ ] `M3-T14` Implementar estados unchanged/upload/replace/remove.
- [ ] `M3-T15` Esperar indexación antes de marcar `READY`.
- [ ] `M3-T16` Conservar versión previa hasta que reemplazo esté listo.
- [ ] `M3-T17` Registrar sourceKey, versión y requisitos como metadata remota.
- [ ] `M3-T18` Implementar retrieval: max 6, threshold 0.55 y filtros READY/approved.
- [ ] `M3-T19` Normalizar SDK a `RetrievedKnowledgeChunk`.

### Pruebas

- Manifest duplicado, inválido, archivo faltante y no aprobado.
- Checksum estable Windows/Linux.
- Dry-run sin mutaciones.
- Sync idempotente y reemplazo con rollback.
- Documento REMOVED no recuperable.
- Threshold, máximo y metadata de fuente.

### Gate

Cada chunk se puede rastrear a archivo, versión y requisitos implementados.

## M4 — Tools comerciales de solo lectura

**Objetivo:** consultar datos vivos mediante proyecciones seguras.

### Tareas

- [ ] `M4-T01` Definir `AssistantTool` y registry allowlisted.
- [ ] `M4-T02` Definir schemas Zod/JSON de las seis tools.
- [ ] `M4-T03` Crear puerto público en Customers.
- [ ] `M4-T04` Implementar búsqueda y resumen comercial de cliente.
- [ ] `M4-T05` Crear puerto público en Sales.
- [ ] `M4-T06` Implementar búsqueda COT/CON/FAC y detalle mínimo.
- [ ] `M4-T07` Crear puerto público de Receivables.
- [ ] `M4-T08` Implementar agregados y detalle limitado.
- [ ] `M4-T09` Crear puerto público de Profitability.
- [ ] `M4-T10` Implementar resumen por período/moneda.
- [ ] `M4-T11` Usar fechas de negocio `America/Santo_Domingo`.
- [ ] `M4-T12` Añadir `asOf`, `sourceKey` y appPath aprobado.
- [ ] `M4-T13` Repetir `assertAdministrator` en servicios.
- [ ] `M4-T14` Usar selects Prisma explícitos; no ocultar datos después de cargarlos.
- [ ] `M4-T15` Limitar filas/rangos antes de consultar/enviar.
- [ ] `M4-T16` Mapear errores Prisma a errores de aplicación.
- [ ] `M4-T17` Medir duración/conteos sin loguear resultados.

### Pruebas

- Happy, vacío, inválido y not found por tool.
- Seller/Mechanic rechazados en servicio.
- Cero campos prohibidos en outputs.
- Máximo 20 y máximo 366 días.
- Totales coinciden con módulos existentes.
- Sin N+1 ni dependencias a repositorios ajenos.

### Gate

Ninguna tool escribe y ninguna salida contiene datos excluidos.

## M5 — Orquestador híbrido

**Objetivo:** producir respuestas basadas en corpus y tools con persistencia consistente.

### Tareas

- [ ] `M5-T01` Crear `AssistantService` con dependencias inyectadas.
- [ ] `M5-T02` Crear prompt versionado `assistant-v1`.
- [ ] `M5-T03` Incluir español, solo lectura, evidencia, no asumir y no obedecer fuentes.
- [ ] `M5-T04` Delimitar chunks y tool outputs como datos no confiables.
- [ ] `M5-T05` Cargar últimas 12 intervenciones o 24,000 caracteres.
- [ ] `M5-T06` Eliminar pares antiguos sin cortar mensajes.
- [ ] `M5-T07` Ejecutar retrieval antes de la primera llamada.
- [ ] `M5-T08` Exponer solo tools registradas.
- [ ] `M5-T09` Revalidar argumentos generados por el modelo.
- [ ] `M5-T10` Bloquear después de tres tool calls totales.
- [ ] `M5-T11` Solicitar respuesta final con contexto minimizado.
- [ ] `M5-T12` Persistir solo sources efectivamente usadas.
- [ ] `M5-T13` Convertir respuesta factual sin evidencia en insuficiencia.
- [ ] `M5-T14` Crear user message/run antes de llamada externa.
- [ ] `M5-T15` Crear assistant message PENDING antes del streaming.
- [ ] `M5-T16` Completar mensaje/run/sources en transacción corta.
- [ ] `M5-T17` Impedir dos runs activos en la misma conversación.
- [ ] `M5-T18` Verificar cuota diaria antes de costo externo.
- [ ] `M5-T19` Marcar FAILED/CANCELLED sin publicar texto parcial como final.
- [ ] `M5-T20` Clasificar errores retryable/non-retryable.
- [ ] `M5-T21` Generar título local desde primeros 80 caracteres.

### Pruebas

- Pregunta documental, viva, híbrida y sin evidencia.
- Tool desconocida/argumentos inválidos/cuarta llamada.
- Prompt injection en documento y dato comercial.
- Historial truncado correctamente.
- Request duplicado y ejecuciones concurrentes.
- Cuota, timeout, 429, stream incompleto y abort.

### Gate

El servicio completo funciona en tests sin Express ni OpenAI real.

## M6 — API HTTP y SSE

**Objetivo:** publicar el módulo con contratos y seguridad consistentes.

### Tareas

- [ ] `M6-T01` Crear validaciones Zod para params/query/body.
- [ ] `M6-T02` Crear controller sin lógica de negocio.
- [ ] `M6-T03` Crear router `/api/assistant`.
- [ ] `M6-T04` Aplicar auth, Administrator, CSRF, no-store y rate limit.
- [ ] `M6-T05` Implementar CRUD acotado de conversaciones/mensajes.
- [ ] `M6-T06` Crear serializador central de SSE.
- [ ] `M6-T07` Implementar metadata/delta/sources/done/error.
- [ ] `M6-T08` Implementar heartbeat de 15 segundos.
- [ ] `M6-T09` Propagar cierre de conexión como abort.
- [ ] `M6-T10` Evitar writes tras `writableEnded`.
- [ ] `M6-T11` Diferenciar errores pre-stream/post-stream.
- [ ] `M6-T12` Registrar requestId/runId/resultado sin contenido.
- [ ] `M6-T13` Registrar dependencias en `createApp()`.
- [ ] `M6-T14` Extender `CreateAppOptions` para dobles de tests.
- [ ] `M6-T15` Devolver `503 ASSISTANT_DISABLED` si está apagado.

### Pruebas

- 401, 403 rol, 403 CSRF, 404 ownership, 409 concurrency, 429 y 503.
- Headers y orden de eventos SSE.
- Error tras iniciar stream.
- Desconexión cancela run.
- Health/readiness no depende de OpenAI.

### Gate

No se filtran errores/provider payloads y el resto de la API funciona durante outage.

## M7 — Cliente web y panel global

**Objetivo:** entregar UX accesible, resiliente y exclusiva para Administrator.

### Tareas de datos

- [ ] `M7-T01` Crear contratos Assistant en web.
- [ ] `M7-T02` Añadir `AssistantRepository`.
- [ ] `M7-T03` Implementar llamadas JSON.
- [ ] `M7-T04` Implementar parser SSE incremental para chunks arbitrarios.
- [ ] `M7-T05` Convertir eventos a unión discriminada.
- [ ] `M7-T06` Propagar AbortSignal.
- [ ] `M7-T07` Implementar `HttpAssistantRepository` y composition root.
- [ ] `M7-T08` Añadir capability `assistant` independiente de Release 1–8.
- [ ] `M7-T09` Mantenerla apagada en mock mode; no crear un chatbot mock completo.
- [ ] `M7-T10` Crear hooks de lista, selección, envío, stop, retry y delete.
- [ ] `M7-T11` Reutilizar clientRequestId en retries ambiguos.

### Tareas de UI

- [ ] `M7-T12` Montar `AssistantProvider` en `AppShell`.
- [ ] `M7-T13` Mostrar launcher solo a Administrator con capability activa.
- [ ] `M7-T14` Crear panel lateral desktop y full-screen bajo 768px.
- [ ] `M7-T15` Preservar estado al navegar; guardar solo conversationId en sessionStorage.
- [ ] `M7-T16` Crear historial paginado y nueva conversación.
- [ ] `M7-T17` Confirmar delete con modal existente.
- [ ] `M7-T18` Crear message list y estado “consultando fuentes”.
- [ ] `M7-T19` Crear composer con contador, Enter/Shift+Enter.
- [ ] `M7-T20` Deshabilitar input inválido o run concurrente.
- [ ] `M7-T21` Añadir Stop y retry seguro.
- [ ] `M7-T22` Renderizar Markdown con `react-markdown`, sin HTML crudo.
- [ ] `M7-T23` Permitir solo appPaths internos aprobados; otros links como texto.
- [ ] `M7-T24` Mostrar sources y `asOf`.
- [ ] `M7-T25` Añadir empty state y advertencia de verificación.
- [ ] `M7-T26` Implementar focus trap, Escape, retorno de foco y aria-live.
- [ ] `M7-T27` Respetar reduced motion y targets táctiles.

### Pruebas

- Parser SSE: uno/varios/divididos, heartbeat, inválido y unknown.
- Administrator visible; Seller/Mechanic/capability off invisible.
- Streaming, stop, retry, paginación y delete.
- Links externos bloqueados y HTML no ejecutado.
- Teclado, foco, aria-live y responsive.

### Gate

Los componentes no usan fetch directamente y el panel no pierde la conversación al navegar.

## M8 — Seguridad, privacidad, observabilidad y operación

**Objetivo:** controlar riesgos de LLM y hacer la feature operable.

### Tareas

- [ ] `M8-T01` Crear threat model: secretos, PII, prompts, corpus, tools, costos y poisoning.
- [ ] `M8-T02` Probar prompt injection en documentos y datos.
- [ ] `M8-T03` Auditar cada select contra matriz de campos permitidos.
- [ ] `M8-T04` Confirmar que el modelo no elige URLs, SQL o tools arbitrarias.
- [ ] `M8-T05` Confirmar que logs no contienen prompts/respuestas/chunks/payloads.
- [ ] `M8-T06` Añadir límite global de emergencia además del límite por usuario.
- [ ] `M8-T07` Verificar sanitización Markdown/source labels/appPaths.
- [ ] `M8-T08` Ejecutar dependency/security scan.
- [ ] `M8-T09` Revisar controles de privacidad/retención del proveedor antes de producción.
- [ ] `M8-T10` Definir logs por run: IDs, modelo, latencia, tokens, tools, status y errorCode.
- [ ] `M8-T11` Definir métricas: éxito, TTFT, latencia, tokens, errores, cuota y tool usage.
- [ ] `M8-T12` Crear alertas para 5xx, timeout, 429, costo y sync fallido.
- [ ] `M8-T13` Mantener readiness independiente.
- [ ] `M8-T14` Programar purga diaria.
- [ ] `M8-T15` Mantener sync como operación explícita, no en cada restart.
- [ ] `M8-T16` Documentar rotación de key, creación/reemplazo de vector store y recuperación.
- [ ] `M8-T17` Documentar feature kill switch.
- [ ] `M8-T18` Crear runbook de 401/429/timeout/outage/sync/purge.
- [ ] `M8-T19` Documentar retención residual en backups.

### Gate

- Cero secretos/PII prohibida en logs, API y provider context.
- Feature desactivable sin rollback.
- Outage externo no afecta operación comercial ni readiness.

## M9 — Evaluación, staging, documentación y rollout

**Objetivo:** demostrar calidad/costo y habilitar el piloto con rollback inmediato.

### Tareas de evaluación

- [ ] `M9-T01` Crear dataset versionado de mínimo 30 casos.
- [ ] `M9-T02` Incluir 10 documentales, 10 vivos, 5 híbridos y 5 adversariales/sin respuesta.
- [ ] `M9-T03` Definir expected sources, facts y forbidden claims por caso.
- [ ] `M9-T04` Crear runner con modo fake y staging real.
- [ ] `M9-T05` Medir precision@5, exactitud, evidencia, rechazos, PII, TTFT, latencia, tokens y costo.
- [ ] `M9-T06` Corregir primero corpus/tools; ajustar prompt solo si corresponde.
- [ ] `M9-T07` Congelar prompt version y corpus version aprobados.

### Tareas de staging

- [ ] `M9-T08` Desplegar inicialmente con flag apagado.
- [ ] `M9-T09` Aplicar migración y verificar índices.
- [ ] `M9-T10` Sincronizar corpus aprobado.
- [ ] `M9-T11` Habilitar para cuenta Administrator de prueba.
- [ ] `M9-T12` Ejecutar walkthrough desktop/móvil.
- [ ] `M9-T13` Probar outage, 429, timeout, abort, cuota y purga.
- [ ] `M9-T14` Obtener aprobación del dueño.

### Umbrales obligatorios

- 100% de respuestas factuales con evidencia.
- 0 campos prohibidos.
- 0 operaciones comerciales ejecutadas.
- 0 funcionalidades futuras presentadas como disponibles.
- >= 90% de respuestas correctas.
- >= 95% de preguntas documentales con fuente relevante en top 5.
- 100% de adversariales conserva permisos y allowlist.
- P95 de primer token < 8 segundos en staging, excluyendo incidente externo documentado.

### Tareas de cierre

- [ ] `M9-T15` Ejecutar tests focalizados Assistant.
- [ ] `M9-T16` Ejecutar `npm run lint`.
- [ ] `M9-T17` Ejecutar `npm run typecheck` y typecheck web tests.
- [ ] `M9-T18` Ejecutar `npm run test`.
- [ ] `M9-T19` Ejecutar `npm run build`.
- [ ] `M9-T20` Ejecutar `npm run format:check`.
- [ ] `M9-T21` Revisar diff/migración y ausencia de cambios fuera de alcance.
- [ ] `M9-T22` Actualizar `docs/TESTING.md` y snapshot de Development Plan.
- [ ] `M9-T23` Marcar checklist Feature 17 solo con implementación + pruebas.
- [ ] `M9-T24` Registrar modelo, prompt, corpus y límites desplegados.
- [ ] `M9-T25` Desplegar producción con flag apagado y ejecutar smoke tests.
- [ ] `M9-T26` Habilitar solo para Administrator.
- [ ] `M9-T27` Monitorear 24/72 horas y apagar ante exposición o respuesta sin evidencia.

### Definición de terminado

- Todos los milestones cerrados.
- Suites completas aprobadas.
- Corpus aprobado/sincronizado.
- Runbook, alertas, purga y kill switch probados.
- Aprobación del dueño registrada.

## 8. Mapa probable de archivos

### CREATE

- `docs/FEATURES/17_AI_ASSISTANT.md`.
- `docs/assistant-knowledge/manifest.json` y guías Markdown.
- `apps/api/src/features/assistant/*`.
- `apps/api/src/infrastructure/openai/*`.
- CLIs de sync y purge.
- Nueva migración Prisma.
- Pruebas unitarias/integración del API.
- `apps/web/src/features/assistant/*`.
- Contratos/cliente Assistant web.
- Pruebas unitarias/componentes web.

### MODIFY

- Prisma schema y relación de User.
- `apps/api/src/app.ts`, manifests, lockfile y configuración.
- Proyecciones públicas en Customers, Sales, Payments y Profitability.
- Contracts/repositories/composition root web.
- Capabilities y `AppShell`.
- `.env.example`, despliegue y documentación canónica.

### DELETE

- Ninguno previsto.

## 9. Riesgos y mitigaciones

| Riesgo                | Mitigación                                          |
| --------------------- | --------------------------------------------------- |
| Alucinación           | Evidencia obligatoria y respuesta de insuficiencia  |
| Docs futuras          | Manifest aprobado; nunca indexar `/docs` completo   |
| Prompt injection      | Fuentes como datos, allowlist y tests adversariales |
| Exposición PII        | Selects mínimos y pruebas negativas                 |
| Escritura accidental  | Ninguna tool mutable registrada                     |
| Costos                | Cuotas, límites, métricas y kill switch             |
| Outage OpenAI         | 503 aislado y readiness independiente               |
| Retry duplicado       | clientRequestId idempotente                         |
| Stream interrumpido   | FAILED/CANCELLED y retry seguro                     |
| Crecimiento DB        | Retención, índices y purga por lotes                |
| Lock-in               | Interfaces propias y SDK confinado                  |
| XSS                   | Markdown sin HTML y links allowlisted               |
| Corpus desactualizado | Checksum, versionado y sync explícito               |

## 10. Fuera de alcance v1

- Seller o Mechanic.
- Escrituras comerciales o acciones con confirmación.
- Usuarios, sesiones, credenciales o recuperación.
- Inventario, jerarquía o Work Orders mock.
- Carga documental desde UI.
- Voz, imágenes o adjuntos.
- Web search.
- Memoria mayor a 90 días.
- Multi-provider simultáneo.
- Fine-tuning.

## 11. Orden de ejecución recomendado

1. Aprobar M0.
2. Implementar M1 y M2.
3. Construir corpus M3 y tools M4.
4. Implementar orquestador M5.
5. Publicar API M6.
6. Construir cliente/panel M7.
7. Ejecutar hardening/operación M8.
8. Evaluar y desplegar con M9.

---

Este archivo es únicamente el plan. No implementa los milestones ni modifica el comportamiento del sistema.
