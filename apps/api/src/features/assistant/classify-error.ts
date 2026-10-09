import {
  AssistantProviderError,
  isAssistantProviderError,
  type AssistantProviderErrorCode,
} from '../../infrastructure/openai/errors.js';
import { AppError, isAppError } from '../../infrastructure/errors/app-error.js';
import {
  ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE,
  ASSISTANT_CANCELLED_MESSAGE,
  ASSISTANT_DAILY_QUOTA_EXCEEDED_MESSAGE,
  ASSISTANT_DISABLED_MESSAGE,
  ASSISTANT_GLOBAL_QUOTA_EXCEEDED_MESSAGE,
  ASSISTANT_INTERNAL_ERROR_MESSAGE,
  ASSISTANT_MAX_TOOL_CALLS_EXCEEDED_MESSAGE,
  ASSISTANT_NOT_FOUND_MESSAGE,
  ASSISTANT_PROVIDER_AUTH_MESSAGE,
  ASSISTANT_PROVIDER_INVALID_MESSAGE,
  ASSISTANT_PROVIDER_RATE_LIMIT_MESSAGE,
  ASSISTANT_PROVIDER_TIMEOUT_MESSAGE,
  ASSISTANT_PROVIDER_UNAVAILABLE_MESSAGE,
  ASSISTANT_RUN_ERROR_CODES,
} from './constants.js';

export type ClassifiedAssistantError = {
  code: string;
  message: string;
  retryable: boolean;
  /** When true, the run/message should be marked CANCELLED instead of FAILED. */
  cancelled: boolean;
};

export function classifyAssistantError(error: unknown): ClassifiedAssistantError {
  if (isAssistantProviderError(error)) {
    return classifyProviderError(error);
  }

  if (isAppError(error)) {
    if (error.code === 'SERVICE_UNAVAILABLE') {
      return {
        code: ASSISTANT_RUN_ERROR_CODES.DISABLED,
        message: error.message || ASSISTANT_DISABLED_MESSAGE,
        retryable: false,
        cancelled: false,
      };
    }
    if (error.code === 'TOO_MANY_REQUESTS') {
      const assistantCode =
        typeof error.details?.assistantCode === 'string'
          ? error.details.assistantCode
          : ASSISTANT_RUN_ERROR_CODES.QUOTA;
      return {
        code: assistantCode,
        message: error.message || ASSISTANT_DAILY_QUOTA_EXCEEDED_MESSAGE,
        retryable: false,
        cancelled: false,
      };
    }
    if (error.code === 'CONFLICT') {
      return {
        code: 'ASSISTANT_CONFLICT',
        message: error.message || ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE,
        retryable: false,
        cancelled: false,
      };
    }
    if (error.code === 'VALIDATION') {
      const assistantCode =
        typeof error.details?.assistantCode === 'string'
          ? error.details.assistantCode
          : 'ASSISTANT_VALIDATION';
      return {
        code: assistantCode,
        message: error.message,
        retryable: false,
        cancelled: false,
      };
    }
    if (error.code === 'NOT_FOUND') {
      return {
        code: 'ASSISTANT_NOT_FOUND',
        message: error.message || ASSISTANT_NOT_FOUND_MESSAGE,
        retryable: false,
        cancelled: false,
      };
    }
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return {
      code: ASSISTANT_RUN_ERROR_CODES.CANCELLED,
      message: ASSISTANT_CANCELLED_MESSAGE,
      retryable: false,
      cancelled: true,
    };
  }

  return {
    code: ASSISTANT_RUN_ERROR_CODES.INTERNAL,
    message: ASSISTANT_INTERNAL_ERROR_MESSAGE,
    retryable: false,
    cancelled: false,
  };
}

function classifyProviderError(error: AssistantProviderError): ClassifiedAssistantError {
  const mapping: Record<
    AssistantProviderErrorCode,
    { code: string; message: string; retryable: boolean; cancelled: boolean }
  > = {
    AUTH: {
      code: ASSISTANT_RUN_ERROR_CODES.PROVIDER_AUTH,
      message: ASSISTANT_PROVIDER_AUTH_MESSAGE,
      retryable: false,
      cancelled: false,
    },
    RATE_LIMIT: {
      code: ASSISTANT_RUN_ERROR_CODES.PROVIDER_RATE_LIMIT,
      message: ASSISTANT_PROVIDER_RATE_LIMIT_MESSAGE,
      // Billing exhaustion is also RATE_LIMIT but not retryable; honor provider flag.
      retryable: error.retryable,
      cancelled: false,
    },
    TIMEOUT: {
      code: ASSISTANT_RUN_ERROR_CODES.PROVIDER_TIMEOUT,
      message: ASSISTANT_PROVIDER_TIMEOUT_MESSAGE,
      retryable: true,
      cancelled: false,
    },
    UNAVAILABLE: {
      code: ASSISTANT_RUN_ERROR_CODES.PROVIDER_UNAVAILABLE,
      message: ASSISTANT_PROVIDER_UNAVAILABLE_MESSAGE,
      retryable: true,
      cancelled: false,
    },
    INVALID_RESPONSE: {
      code: ASSISTANT_RUN_ERROR_CODES.PROVIDER_INVALID,
      message: ASSISTANT_PROVIDER_INVALID_MESSAGE,
      retryable: false,
      cancelled: false,
    },
    DISABLED: {
      code: ASSISTANT_RUN_ERROR_CODES.DISABLED,
      message: ASSISTANT_DISABLED_MESSAGE,
      retryable: false,
      cancelled: false,
    },
  };

  return mapping[error.code];
}

export function assistantQuotaExceededError(): AppError {
  return AppError.tooManyRequests(ASSISTANT_DAILY_QUOTA_EXCEEDED_MESSAGE, {
    assistantCode: ASSISTANT_RUN_ERROR_CODES.QUOTA,
  });
}

export function assistantGlobalQuotaExceededError(): AppError {
  return AppError.tooManyRequests(ASSISTANT_GLOBAL_QUOTA_EXCEEDED_MESSAGE, {
    assistantCode: ASSISTANT_RUN_ERROR_CODES.GLOBAL_QUOTA,
  });
}

export function assistantDisabledError(): AppError {
  return AppError.serviceUnavailable(ASSISTANT_DISABLED_MESSAGE, {
    reason: ASSISTANT_RUN_ERROR_CODES.DISABLED,
  });
}

export function assistantMaxToolCallsError(): AppError {
  return AppError.validation(ASSISTANT_MAX_TOOL_CALLS_EXCEEDED_MESSAGE, {
    assistantCode: ASSISTANT_RUN_ERROR_CODES.MAX_TOOLS,
  });
}
