import type { LauncherConfig } from "../types/launcher";

export interface EffectiveVisuals {
  lite: boolean;
  rainbow: boolean;
  reducedMotion: "user" | "always";
}

// Performance mode trades the expensive effects (blur, motion, decorative loops, rainbow)
// for frame time on low-end machines. The user's own rainbow choice is kept, only suspended.
export function effectiveVisuals(config: Pick<LauncherConfig, "rainbowMode"> & { performanceMode?: boolean }): EffectiveVisuals {
  const lite = !!config.performanceMode;
  return {
    lite,
    rainbow: !!config.rainbowMode && !lite,
    reducedMotion: lite ? "always" : "user",
  };
}
