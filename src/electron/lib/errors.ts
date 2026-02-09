/**
 * Centralized Error Handling for ml-client Electron
 * Provides standardized IPC error types and response formats
 */

// Standard error codes for IPC
export const IpcErrorCodes = {
  // General errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_FIELD: 'MISSING_FIELD',

  // Authentication errors
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  API_ERROR: 'API_ERROR',

  // File system errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',

  // Game/Instance errors
  INSTANCE_NOT_FOUND: 'INSTANCE_NOT_FOUND',
  GAME_LAUNCH_FAILED: 'GAME_LAUNCH_FAILED',
  GAME_ALREADY_RUNNING: 'GAME_ALREADY_RUNNING',

  // Download errors
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  DOWNLOAD_CANCELLED: 'DOWNLOAD_CANCELLED',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
} as const;

export type IpcErrorCode = typeof IpcErrorCodes[keyof typeof IpcErrorCodes];

// IPC Response types
export interface IpcErrorResponse {
  ok: false;
  error: {
    code: IpcErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface IpcSuccessResponse<T> {
  ok: true;
  data: T;
}

export type IpcResponse<T> = IpcSuccessResponse<T> | IpcErrorResponse;

/**
 * IPC Error class for throwing typed errors
 */
export class IpcError extends Error {
  public readonly code: IpcErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: IpcErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
    this.details = details;
  }

  // Factory methods for common errors
  static validation(message: string, details?: Record<string, unknown>): IpcError {
    return new IpcError(IpcErrorCodes.VALIDATION_ERROR, message, details);
  }

  static authRequired(message: string = 'กรุณาเข้าสู่ระบบก่อน'): IpcError {
    return new IpcError(IpcErrorCodes.AUTH_REQUIRED, message);
  }

  static authFailed(message: string = 'การยืนยันตัวตนล้มเหลว'): IpcError {
    return new IpcError(IpcErrorCodes.AUTH_FAILED, message);
  }

  static network(message: string = 'เกิดข้อผิดพลาดในการเชื่อมต่อ', details?: Record<string, unknown>): IpcError {
    return new IpcError(IpcErrorCodes.NETWORK_ERROR, message, details);
  }

  static timeout(message: string = 'การเชื่อมต่อหมดเวลา'): IpcError {
    return new IpcError(IpcErrorCodes.TIMEOUT, message);
  }

  static fileNotFound(path: string): IpcError {
    return new IpcError(IpcErrorCodes.FILE_NOT_FOUND, `ไม่พบไฟล์: ${path}`, { path });
  }

  static instanceNotFound(id: string): IpcError {
    return new IpcError(IpcErrorCodes.INSTANCE_NOT_FOUND, 'ไม่พบ Instance', { instanceId: id });
  }

  static gameLaunchFailed(message: string, details?: Record<string, unknown>): IpcError {
    return new IpcError(IpcErrorCodes.GAME_LAUNCH_FAILED, message, details);
  }

  static internal(message: string = 'เกิดข้อผิดพลาดภายในระบบ'): IpcError {
    return new IpcError(IpcErrorCodes.INTERNAL_ERROR, message);
  }

  /**
   * Convert to IPC error response
   */
  toResponse(): IpcErrorResponse {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * Create IPC error response
 */
export function ipcError(
  code: IpcErrorCode,
  message: string,
  details?: Record<string, unknown>
): IpcErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}

/**
 * Create IPC success response
 */
export function ipcSuccess<T>(data: T): IpcSuccessResponse<T> {
  return {
    ok: true,
    data,
  };
}

/**
 * Wrap IPC handler with error catching
 */
export function wrapIpcHandler<T, A extends unknown[]>(
  handlerName: string,
  handler: (...args: A) => Promise<T>,
  logger?: { error: (msg: string, err?: unknown, ctx?: Record<string, unknown>) => void }
): (...args: A) => Promise<IpcResponse<T>> {
  return async (...args: A): Promise<IpcResponse<T>> => {
    try {
      const result = await handler(...args);
      return ipcSuccess(result);
    } catch (err) {
      if (err instanceof IpcError) {
        logger?.error(`IPC handler "${handlerName}" error`, err, { code: err.code });
        return err.toResponse();
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      logger?.error(`IPC handler "${handlerName}" unexpected error`, err);

      return ipcError(
        IpcErrorCodes.INTERNAL_ERROR,
        `เกิดข้อผิดพลาด: ${errorMessage}`
      );
    }
  };
}

/**
 * Safely execute async operation with error handling
 */
export async function trySafe<T>(
  operation: () => Promise<T>,
  errorMessage?: string
): Promise<{ ok: true; data: T } | { ok: false; error: Error }> {
  try {
    const data = await operation();
    return { ok: true, data };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (errorMessage) {
      error.message = `${errorMessage}: ${error.message}`;
    }
    return { ok: false, error };
  }
}

/**
 * Create a timeout wrapper for promises
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new IpcError(IpcErrorCodes.TIMEOUT, timeoutMessage)), timeoutMs)
    ),
  ]);
}
