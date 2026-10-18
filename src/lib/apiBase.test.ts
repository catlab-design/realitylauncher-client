import { describe, expect, it } from "bun:test";
import { API_BASE_URL, apiUrl } from "./apiBase";

describe("apiUrl", () => {
  it("builds an absolute URL on the Reality API", () => {
    expect(apiUrl("/instances/public")).toBe(`${API_BASE_URL}/instances/public`);
    expect(new URL(apiUrl("/instances/public")).host).toBe("api.reality.catlabdesign.space");
  });

  it("adds non-empty query params and skips empty ones", () => {
    expect(apiUrl("/instances/public", { q: "Giant's Clash" })).toBe(`${API_BASE_URL}/instances/public?q=Giant%27s+Clash`);
    expect(apiUrl("/instances/public", { q: "" })).toBe(`${API_BASE_URL}/instances/public`);
  });
});
