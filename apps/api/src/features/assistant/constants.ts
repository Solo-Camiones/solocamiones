export const ASSISTANT_CONVERSATION_TITLE_MAX_LENGTH = 120;
export const ASSISTANT_CONVERSATION_PAGE_SIZE = 20;
export const ASSISTANT_MESSAGE_PAGE_SIZE = 50;
export const ASSISTANT_PURGE_BATCH_SIZE = 100;

/** Dedicated HTTP ceiling for /api/assistant (costly LLM work sits behind daily quota). */
export const ASSISTANT_RATE_LIMIT_MAX_REQUESTS = 60;
export const ASSISTANT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** SSE comment keepalive while a run is open (M6-T08). */
export const ASSISTANT_SSE_HEARTBEAT_INTERVAL_MS = 15_000;

/** Context window for the language-model call (M5-T05). */
export const ASSISTANT_HISTORY_MAX_MESSAGES = 12;
export const ASSISTANT_HISTORY_MAX_CHARS = 24_000;

/** Local title from the first user message (M5-T21); capped by conversation title max. */
export const ASSISTANT_TITLE_FROM_CONTENT_CHARS = 80;

export const ASSISTANT_PROMPT_VERSION = 'assistant-v1.2';

/** User-visible assistant errors (Spanish). Codes stay English for logs/ops. */
export const ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE =
  'Ya hay una respuesta en curso en esta conversación. Espera a que termine.';
export const ASSISTANT_RUN_NOT_PENDING_MESSAGE =
  'La respuesta del asistente ya no está pendiente.';
export const ASSISTANT_DAILY_QUOTA_EXCEEDED_MESSAGE =
  'Alcanzaste el límite diario de mensajes del asistente.';
export const ASSISTANT_GLOBAL_QUOTA_EXCEEDED_MESSAGE =
  'Se alcanzó el límite diario de mensajes del asistente para todos los usuarios.';
export const ASSISTANT_MAX_TOOL_CALLS_EXCEEDED_MESSAGE =
  'Esta consulta usó demasiadas herramientas. Reformula la pregunta e intenta de nuevo.';
export const ASSISTANT_DISABLED_MESSAGE = 'El asistente no está habilitado en este entorno.';
export const ASSISTANT_CANCELLED_MESSAGE = 'Se canceló la solicitud al asistente.';
export const ASSISTANT_INTERNAL_ERROR_MESSAGE =
  'No pudimos completar la solicitud. Intenta de nuevo.';
export const ASSISTANT_NOT_FOUND_MESSAGE = 'No se encontró el recurso del asistente.';
export const ASSISTANT_PROVIDER_AUTH_MESSAGE =
  'El asistente no está configurado correctamente. Contacta a soporte.';
export const ASSISTANT_PROVIDER_RATE_LIMIT_MESSAGE =
  'El asistente no puede responder ahora por un límite de uso. Intenta de nuevo más tarde.';
export const ASSISTANT_PROVIDER_TIMEOUT_MESSAGE =
  'La respuesta del asistente tardó demasiado. Intenta de nuevo.';
export const ASSISTANT_PROVIDER_UNAVAILABLE_MESSAGE =
  'El asistente no está disponible en este momento. Intenta de nuevo más tarde.';
export const ASSISTANT_PROVIDER_INVALID_MESSAGE =
  'No pudimos completar la respuesta del asistente. Intenta de nuevo.';
export const ASSISTANT_INSUFFICIENT_EVIDENCE_MESSAGE =
  'No tengo información suficiente en la base de conocimiento aprobada ni en los datos comerciales consultados para responder con evidencia.';

export const KNOWLEDGE_SYNC_FAILED_ERROR_CODE = 'KNOWLEDGE_SYNC_FAILED';
export const KNOWLEDGE_PROVIDER_ERROR_CODE_PREFIX = 'PROVIDER_';

/** Safe run error codes persisted on AssistantRun (never raw provider text). */
export const ASSISTANT_RUN_ERROR_CODES = {
  DISABLED: 'ASSISTANT_DISABLED',
  QUOTA: 'ASSISTANT_QUOTA_EXCEEDED',
  GLOBAL_QUOTA: 'ASSISTANT_GLOBAL_QUOTA_EXCEEDED',
  MAX_TOOLS: 'ASSISTANT_MAX_TOOL_CALLS',
  PROVIDER_AUTH: 'PROVIDER_AUTH',
  PROVIDER_RATE_LIMIT: 'PROVIDER_RATE_LIMIT',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_INVALID: 'PROVIDER_INVALID_RESPONSE',
  CANCELLED: 'ASSISTANT_CANCELLED',
  INTERNAL: 'ASSISTANT_INTERNAL',
} as const;
