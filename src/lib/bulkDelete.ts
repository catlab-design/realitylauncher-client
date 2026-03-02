export interface DeleteResult {
  ok: boolean;
  error?: string;
}

export interface BulkDeleteSummary {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

function normalizeErrorMessage(message?: string): string | null {
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function runBulkDelete<T>(
  items: readonly T[],
  deleter: (item: T, options: { silent: boolean }) => Promise<DeleteResult>,
): Promise<BulkDeleteSummary> {
  const outcomes = await Promise.all(
    items.map(async (item) => {
      try {
        const result = await deleter(item, { silent: true });
        if (result?.ok) {
          return { ok: true as const, error: null };
        }
        return {
          ok: false as const,
          error: normalizeErrorMessage(result?.error),
        };
      } catch (error) {
        const fallback = error instanceof Error ? error.message : String(error);
        return { ok: false as const, error: normalizeErrorMessage(fallback) };
      }
    }),
  );

  const success = outcomes.filter((outcome) => outcome.ok).length;
  const errors = outcomes
    .map((outcome) => outcome.error)
    .filter((error): error is string => Boolean(error));

  return {
    total: items.length,
    success,
    failed: items.length - success,
    errors,
  };
}
