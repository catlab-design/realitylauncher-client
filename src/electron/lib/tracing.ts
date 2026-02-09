/**
 * Tracing System for ml-client Electron
 * Provides operation tracing and performance monitoring
 */

import { createLogger } from "./logger.js";

// ========================================
// Types
// ========================================

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  operationName: string;
  attributes: Record<string, unknown>;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: "ok" | "error";
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

// ========================================
// ID Generation
// ========================================

function generateId(length: number = 16): string {
  const chars = "0123456789abcdef";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % 16];
  }
  return result;
}

export function generateTraceId(): string {
  return generateId(32);
}

export function generateSpanId(): string {
  return generateId(16);
}

// ========================================
// Global Trace Storage
// ========================================

const activeTraces = new Map<string, TraceContext>();
const completedSpans: Span[] = [];
const MAX_COMPLETED_SPANS = 1000;
const MAX_ACTIVE_TRACES = 500; // Prevent unbounded growth from leaked traces
const ACTIVE_TRACE_TTL = 30 * 60 * 1000; // 30 minutes max for any trace

/**
 * Clean up stale active traces that were never ended
 */
function cleanupStaleTraces(): void {
  const now = Date.now();
  for (const [id, ctx] of activeTraces) {
    if (now - ctx.startTime > ACTIVE_TRACE_TTL) {
      activeTraces.delete(id);
    }
  }
}

// Periodically clean up stale traces
setInterval(cleanupStaleTraces, 5 * 60 * 1000); // Every 5 minutes

/**
 * Get all active traces
 */
export function getActiveTraces(): TraceContext[] {
  return Array.from(activeTraces.values());
}

/**
 * Get recent completed spans
 */
export function getCompletedSpans(limit: number = 100): Span[] {
  return completedSpans.slice(-limit);
}

// ========================================
// Trace Management
// ========================================

/**
 * Start a new trace
 */
export function startTrace(
  operationName: string,
  attributes: Record<string, unknown> = {}
): TraceContext {
  const ctx: TraceContext = {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    startTime: Date.now(),
    operationName,
    attributes,
  };

  activeTraces.set(ctx.traceId, ctx);

  // Enforce max active traces limit
  if (activeTraces.size > MAX_ACTIVE_TRACES) {
    cleanupStaleTraces();
    // If still over limit after cleanup, remove oldest
    if (activeTraces.size > MAX_ACTIVE_TRACES) {
      const firstKey = activeTraces.keys().next().value;
      if (firstKey) activeTraces.delete(firstKey);
    }
  }

  return ctx;
}

/**
 * End a trace
 */
export function endTrace(
  ctx: TraceContext,
  status: "ok" | "error" = "ok",
  additionalAttributes?: Record<string, unknown>
): Span {
  const span: Span = {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: ctx.parentSpanId,
    operationName: ctx.operationName,
    startTime: ctx.startTime,
    endTime: Date.now(),
    duration: Date.now() - ctx.startTime,
    status,
    attributes: { ...ctx.attributes, ...additionalAttributes },
    events: [],
  };

  activeTraces.delete(ctx.traceId);

  // Store completed span
  completedSpans.push(span);
  if (completedSpans.length > MAX_COMPLETED_SPANS) {
    completedSpans.shift();
  }

  // Log the span
  logSpan(span);

  return span;
}

/**
 * Create a child span within a trace
 */
export function createChildSpan(
  parent: TraceContext,
  operationName: string,
  attributes: Record<string, unknown> = {}
): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    startTime: Date.now(),
    operationName,
    attributes: { ...parent.attributes, ...attributes },
  };
}

// ========================================
// Span Logging
// ========================================

const traceLogger = createLogger("Trace");

function logSpan(span: Span): void {
  const logData = {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    operation: span.operationName,
    duration: `${span.duration}ms`,
    status: span.status,
    attributes: span.attributes,
  };

  if (span.status === "error") {
    traceLogger.error(`Span completed with error: ${span.operationName}`, undefined, logData);
  } else if ((span.duration || 0) > 5000) {
    traceLogger.warn(`Slow operation: ${span.operationName}`, logData);
  } else {
    traceLogger.debug(`Span completed: ${span.operationName}`, logData);
  }
}

// ========================================
// Utility Functions
// ========================================

/**
 * Wrap an async operation with tracing
 */
export async function withTrace<T>(
  operationName: string,
  operation: (ctx: TraceContext) => Promise<T>,
  attributes: Record<string, unknown> = {}
): Promise<T> {
  const ctx = startTrace(operationName, attributes);

  try {
    const result = await operation(ctx);
    endTrace(ctx, "ok");
    return result;
  } catch (err) {
    const errorAttr = {
      error: true,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
    };
    endTrace(ctx, "error", errorAttr);
    throw err;
  }
}

/**
 * Wrap an async operation as a child span
 */
export async function withChildSpan<T>(
  parent: TraceContext,
  operationName: string,
  operation: (ctx: TraceContext) => Promise<T>,
  attributes: Record<string, unknown> = {}
): Promise<T> {
  const ctx = createChildSpan(parent, operationName, attributes);

  try {
    const result = await operation(ctx);
    endTrace(ctx, "ok");
    return result;
  } catch (err) {
    const errorAttr = {
      error: true,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    endTrace(ctx, "error", errorAttr);
    throw err;
  }
}

/**
 * Create trace headers for outgoing HTTP requests
 */
export function createTraceHeaders(ctx: TraceContext): Record<string, string> {
  return {
    "x-trace-id": ctx.traceId,
    "x-span-id": ctx.spanId,
    traceparent: `00-${ctx.traceId}-${ctx.spanId}-01`,
    ...(ctx.parentSpanId && { "x-parent-span-id": ctx.parentSpanId }),
  };
}

/**
 * IPC Handler wrapper with tracing
 */
export function traceIpcHandler<T>(
  handlerName: string,
  handler: (...args: unknown[]) => Promise<T>
): (...args: unknown[]) => Promise<T> {
  return async (...args: unknown[]): Promise<T> => {
    return withTrace(
      `IPC:${handlerName}`,
      async () => handler(...args),
      {
        ipc: true,
        handler: handlerName,
        argCount: args.length,
      }
    );
  };
}

/**
 * HTTP fetch wrapper with tracing
 */
export async function tracedFetch(
  ctx: TraceContext,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return withChildSpan(
    ctx,
    `HTTP ${options.method || "GET"} ${new URL(url).pathname}`,
    async () => {
      const headers = {
        ...Object.fromEntries(
          options.headers instanceof Headers
            ? options.headers.entries()
            : Object.entries(options.headers || {})
        ),
        ...createTraceHeaders(ctx),
      };

      const response = await fetch(url, { ...options, headers });

      // Add response info to span
      ctx.attributes["http.status"] = response.status;
      ctx.attributes["http.url"] = url;

      return response;
    },
    {
      "http.method": options.method || "GET",
      "http.url": url,
    }
  );
}

// ========================================
// Performance Metrics
// ========================================

export interface PerformanceMetrics {
  totalTraces: number;
  averageDuration: number;
  errorRate: number;
  slowOperations: number;
  operationStats: Record<
    string,
    {
      count: number;
      avgDuration: number;
      errorCount: number;
    }
  >;
}

/**
 * Get performance metrics from completed spans
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  const spans = completedSpans;

  if (spans.length === 0) {
    return {
      totalTraces: 0,
      averageDuration: 0,
      errorRate: 0,
      slowOperations: 0,
      operationStats: {},
    };
  }

  const totalDuration = spans.reduce((sum, s) => sum + (s.duration || 0), 0);
  const errorCount = spans.filter((s) => s.status === "error").length;
  const slowCount = spans.filter((s) => (s.duration || 0) > 5000).length;

  // Group by operation name
  const operationStats: PerformanceMetrics["operationStats"] = {};
  for (const span of spans) {
    const op = span.operationName;
    if (!operationStats[op]) {
      operationStats[op] = { count: 0, avgDuration: 0, errorCount: 0 };
    }
    operationStats[op].count++;
    operationStats[op].avgDuration += span.duration || 0;
    if (span.status === "error") operationStats[op].errorCount++;
  }

  // Calculate averages
  for (const op of Object.keys(operationStats)) {
    operationStats[op].avgDuration = Math.round(
      operationStats[op].avgDuration / operationStats[op].count
    );
  }

  return {
    totalTraces: spans.length,
    averageDuration: Math.round(totalDuration / spans.length),
    errorRate: Math.round((errorCount / spans.length) * 100),
    slowOperations: slowCount,
    operationStats,
  };
}
