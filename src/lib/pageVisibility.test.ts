import { describe, expect, it } from "bun:test";
import { installPageVisibility, isPageHidden, type VisibilityDocument } from "./pageVisibility";

function fakeDocument(hidden: boolean) {
  const attrs = new Set<string>();
  const listeners: Array<() => void> = [];
  const doc: VisibilityDocument & { fire: (nextHidden: boolean) => void; attrs: Set<string> } = {
    hidden,
    documentElement: {
      toggleAttribute: (name: string, force: boolean) => {
        if (force) attrs.add(name);
        else attrs.delete(name);
        return force;
      },
    },
    addEventListener: (_type: "visibilitychange", fn: () => void) => listeners.push(fn),
    fire(nextHidden: boolean) {
      doc.hidden = nextHidden;
      listeners.forEach((fn) => fn());
    },
    attrs,
  };
  return doc;
}

describe("installPageVisibility", () => {
  it("marks the root hidden when the page starts hidden", () => {
    const doc = fakeDocument(true);
    installPageVisibility(doc);
    expect(doc.attrs.has("data-hidden")).toBe(true);
  });

  it("follows visibilitychange in both directions", () => {
    const doc = fakeDocument(false);
    installPageVisibility(doc);
    expect(doc.attrs.has("data-hidden")).toBe(false);
    doc.fire(true);
    expect(doc.attrs.has("data-hidden")).toBe(true);
    doc.fire(false);
    expect(doc.attrs.has("data-hidden")).toBe(false);
  });
});

describe("isPageHidden", () => {
  it("reads the given document", () => {
    expect(isPageHidden(fakeDocument(true))).toBe(true);
    expect(isPageHidden(fakeDocument(false))).toBe(false);
  });
});
