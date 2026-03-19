import type { ColorTheme } from "../types/launcher";
import { COLOR_THEMES } from "../lib/constants";

export function getColors(
  colorTheme: ColorTheme,
  themeMode: "light" | "dark" | "oled" | "auto",
  customColor?: string,
  rainbowMode?: boolean,
) {
  const themeColor = rainbowMode
    ? "var(--secondary-color)"
    : (customColor || COLOR_THEMES[colorTheme].primary);

  const effectiveMode: "light" | "dark" | "oled" =
    themeMode === "auto"
      ? new Date().getHours() >= 6 && new Date().getHours() < 18
        ? "light"
        : "dark"
      : themeMode;

  if (effectiveMode === "oled") {
    return {
      primary: themeColor,
      onPrimary: "#000000",
      primaryContainer: "#0a0a0a",
      onPrimaryContainer: "#ffffff",
      secondary: themeColor,
      secondaryContainer: themeColor,
      surface: "#000000",
      surfaceContainer: "#0a0a0a",
      surfaceContainerHigh: "#141414",
      surfaceContainerHighest: "#1e1e1e",
      onSurface: "#ffffff",
      onSurfaceVariant: "#a0a0a0",
      outline: "#333333",
      outlineVariant: "#222222",
    };
  }

  if (effectiveMode === "dark") {
    return {
      primary: themeColor,
      onPrimary: "#1a1a1a",
      primaryContainer: "#2a2a2a",
      onPrimaryContainer: "#ffffff",
      secondary: themeColor,
      secondaryContainer: themeColor,
      surface: "#1a1a1a",
      surfaceContainer: "#242424",
      surfaceContainerHigh: "#2e2e2e",
      surfaceContainerHighest: "#3a3a3a",
      onSurface: "#ffffff",
      onSurfaceVariant: "#b3b3b3",
      outline: "#4a4a4a",
      outlineVariant: "#3a3a3a",
    };
  }

  return {
    primary: "#1a1a1a",
    onPrimary: "#ffffff",
    primaryContainer: "#f5f5f5",
    onPrimaryContainer: "#1a1a1a",
    secondary: themeColor,
    secondaryContainer: themeColor,
    surface: "#ffffff",
    surfaceContainer: "#f8f8f8",
    surfaceContainerHigh: "#f0f0f0",
    surfaceContainerHighest: "#e8e8e8",
    onSurface: "#1a1a1a",
    onSurfaceVariant: "#666666",
    outline: "#cccccc",
    outlineVariant: "#e0e0e0",
  };
}
