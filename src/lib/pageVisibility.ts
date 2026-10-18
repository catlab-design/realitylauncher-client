export interface VisibilityDocument {
  hidden: boolean;
  documentElement: { toggleAttribute: (name: string, force: boolean) => boolean };
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
}

// `data-hidden` on <html> lets CSS pause infinite animations while the window is hidden.
export function installPageVisibility(doc: VisibilityDocument = document): void {
  const sync = () => doc.documentElement.toggleAttribute("data-hidden", doc.hidden);
  sync();
  doc.addEventListener("visibilitychange", sync);
}

export function isPageHidden(doc: Pick<VisibilityDocument, "hidden"> = document): boolean {
  return doc.hidden;
}
