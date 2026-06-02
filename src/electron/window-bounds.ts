export const MAIN_WINDOW_BOUNDS = {
  defaultWidth: 1100,
  defaultHeight: 680,
  minWidth: 1100,
  minHeight: 680,
  maxWidth: 1920,
  maxHeight: 1080,
} as const;

type MainWindowSizeConfig = {
  windowAuto?: boolean;
  windowAutoSize?: boolean;
  windowWidth?: number;
  windowHeight?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveDimension(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return clamp(Math.round(value), min, max);
}

export function resolveMainWindowSize(config?: MainWindowSizeConfig): {
  width: number;
  height: number;
} {
  const autoSize = config?.windowAuto ?? config?.windowAutoSize ?? true;

  if (autoSize) {
    return {
      width: MAIN_WINDOW_BOUNDS.defaultWidth,
      height: MAIN_WINDOW_BOUNDS.defaultHeight,
    };
  }

  return {
    width: resolveDimension(
      config?.windowWidth,
      MAIN_WINDOW_BOUNDS.defaultWidth,
      MAIN_WINDOW_BOUNDS.minWidth,
      MAIN_WINDOW_BOUNDS.maxWidth,
    ),
    height: resolveDimension(
      config?.windowHeight,
      MAIN_WINDOW_BOUNDS.defaultHeight,
      MAIN_WINDOW_BOUNDS.minHeight,
      MAIN_WINDOW_BOUNDS.maxHeight,
    ),
  };
}
