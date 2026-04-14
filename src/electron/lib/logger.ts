

import type { WebContents } from "electron";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  prefix: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}


const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.gray,
  info: COLORS.blue,
  warn: COLORS.yellow,
  error: COLORS.red,
};


function formatLog(entry: LogEntry): string {
  const color = LEVEL_COLORS[entry.level];
  const levelStr = entry.level.toUpperCase().padEnd(5);
  const time = entry.timestamp.split("T")[1].slice(0, 12);

  let output = `${COLORS.dim}${time}${COLORS.reset} ${color}${levelStr}${COLORS.reset} ${COLORS.cyan}[${entry.prefix}]${COLORS.reset} ${entry.message}`;

  if (entry.data) {
    output += ` ${COLORS.dim}${JSON.stringify(entry.data)}${COLORS.reset}`;
  }

  if (entry.error) {
    output += `\n${COLORS.red}  Error: ${entry.error.message}${COLORS.reset}`;
    if (entry.error.stack) {
      output += `\n${COLORS.dim}${entry.error.stack}${COLORS.reset}`;
    }
  }

  return output;
}


export function createLogger(prefix: string) {
  const log = (
    level: LogLevel,
    message: string,
    errorOrData?: Error | Record<string, unknown>,
    data?: Record<string, unknown>
  ) => {
    const entry: LogEntry = {
      level,
      prefix,
      message,
      timestamp: new Date().toISOString(),
    };

    
    if (errorOrData instanceof Error) {
      entry.error = {
        name: errorOrData.name,
        message: errorOrData.message,
        stack: errorOrData.stack,
      };
      if (data) {
        entry.data = data;
      }
    } else if (errorOrData) {
      entry.data = errorOrData;
    }

    
    const logFn =
      level === "error"
        ? console.error
        : level === "warn"
        ? console.warn
        : level === "debug"
        ? console.debug
        : console.log;

    logFn(formatLog(entry));

    return entry;
  };

  return {
    debug: (message: string, data?: Record<string, unknown>) =>
      log("debug", message, data),
    info: (message: string, data?: Record<string, unknown>) =>
      log("info", message, data),
    warn: (message: string, data?: Record<string, unknown>) =>
      log("warn", message, data),
    error: (
      message: string,
      error?: Error | unknown,
      data?: Record<string, unknown>
    ) => {
      const err = error instanceof Error ? error : undefined;
      return log("error", message, err, data);
    },
  };
}


export function createIpcLogger(handlerName: string) {
  return createLogger(`IPC:${handlerName}`);
}


export function sendErrorToRenderer(
  webContents: WebContents,
  type: "critical" | "warning" | "info",
  message: string,
  details?: Record<string, unknown>
) {
  try {
    webContents.send("app-error", {
      type,
      message,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    
    console.error("Failed to send error to renderer:", err);
  }
}


export function reportError(
  prefix: string,
  message: string,
  error?: Error,
  webContents?: WebContents
) {
  const logger = createLogger(prefix);
  logger.error(message, error);

  if (webContents && !webContents.isDestroyed()) {
    sendErrorToRenderer(webContents, "warning", message, {
      name: error?.name,
      message: error?.message,
    });
  }
}


export const mainLogger = createLogger("Main");
