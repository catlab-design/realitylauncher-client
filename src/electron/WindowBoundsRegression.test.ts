import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAIN_WINDOW_BOUNDS,
  resolveMainWindowSize,
} from "./window-bounds";

const windowHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "window-handlers.ts"),
  "utf8",
);

describe("main window resize bounds", () => {
  it("keeps the minimum main window size aligned with the default app layout", () => {
    expect(MAIN_WINDOW_BOUNDS.minWidth).toBe(1100);
    expect(MAIN_WINDOW_BOUNDS.minHeight).toBe(680);
  });

  it("clamps configured window sizes to the supported resize bounds", () => {
    expect(
      resolveMainWindowSize({
        windowAutoSize: false,
        windowWidth: 640,
        windowHeight: 400,
      }),
    ).toEqual({
      width: MAIN_WINDOW_BOUNDS.minWidth,
      height: MAIN_WINDOW_BOUNDS.minHeight,
    });

    expect(
      resolveMainWindowSize({
        windowAutoSize: false,
        windowWidth: 2400,
        windowHeight: 1600,
      }),
    ).toEqual({
      width: MAIN_WINDOW_BOUNDS.maxWidth,
      height: MAIN_WINDOW_BOUNDS.maxHeight,
    });
  });

  it("uses default bounds when auto sizing is enabled or config is missing", () => {
    expect(resolveMainWindowSize({ windowAutoSize: true })).toEqual({
      width: MAIN_WINDOW_BOUNDS.defaultWidth,
      height: MAIN_WINDOW_BOUNDS.defaultHeight,
    });

    expect(resolveMainWindowSize(undefined)).toEqual({
      width: MAIN_WINDOW_BOUNDS.defaultWidth,
      height: MAIN_WINDOW_BOUNDS.defaultHeight,
    });
  });

  it("prefers the renderer windowAuto setting when both auto-size keys exist", () => {
    expect(
      resolveMainWindowSize({
        windowAuto: false,
        windowAutoSize: true,
        windowWidth: 1280,
        windowHeight: 720,
      }),
    ).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it("applies both minimum and maximum bounds when switching to main mode", () => {
    expect(windowHandlersSource).toMatch(
      /setMinimumSize\(\s*MAIN_WINDOW_BOUNDS\.minWidth/,
    );
    expect(windowHandlersSource).toMatch(
      /setMaximumSize\(\s*MAIN_WINDOW_BOUNDS\.maxWidth/,
    );
  });
});
