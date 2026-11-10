import { describe, expect, test } from "bun:test";
import { getSafeExternalUrl } from "./externalUrl";

describe("getSafeExternalUrl", () => {
    test("keeps http(s) links", () => {
        expect(getSafeExternalUrl("https://modrinth.com/mod/sodium")).toBe("https://modrinth.com/mod/sodium");
        expect(getSafeExternalUrl("http://example.com")).toBe("http://example.com/");
    });

    test("rejects other schemes and look-alikes", () => {
        for (const u of ["httpx://a", "http-evil:calc", "file:///C:/Windows/calc.exe", "javascript:alert(1)", "ms-msdt:/id", "calc.exe", "", null, undefined]) {
            expect(getSafeExternalUrl(u)).toBeNull();
        }
    });

    test("percent-encodes quotes and spaces", () => {
        const out = getSafeExternalUrl('https://example.com/a" & calc & "b c')!;
        expect(out).not.toContain('"');
        expect(out).not.toContain(" ");
    });
});
