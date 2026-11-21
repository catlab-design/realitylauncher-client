// Same base the Rust side hardcodes. The Electron preload used to expose it as
// `window.API_URL`; nothing defines that global under Tauri.
export const API_BASE_URL = "https://api.reality.catlabdesign.space";

export function apiUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, API_BASE_URL);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) url.searchParams.append(key, value);
  }
  return url.toString();
}
