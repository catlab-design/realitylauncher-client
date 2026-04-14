export type ContentItem = {
  filename: string;
  name?: string;
  worldName?: string;
  enabled?: boolean;
  [k: string]: any;
};


function dedupeContent(items: ContentItem[], scopeKey?: (item: ContentItem) => string) {
  const unique: Record<string, ContentItem> = {};
  for (const it of items) {
    const base = (it.filename || '').toString().replace(/\.disabled$/i, '').toLowerCase();
    const scope = scopeKey ? scopeKey(it) : '';
    const key = scope ? `${scope}::${base}` : base;
    const existing = unique[key];
    if (!existing) unique[key] = it;
    else {
      if (it.enabled && !existing.enabled) unique[key] = it;
    }
  }
  return Object.values(unique).sort((a: ContentItem, b: ContentItem) => {
    
    const aScope = scopeKey ? (scopeKey(a) || '') : '';
    const bScope = scopeKey ? (scopeKey(b) || '') : '';
    if (aScope !== bScope) return aScope.localeCompare(bScope);
    
    if ((a.enabled || false) === (b.enabled || false)) return (a.name || '').localeCompare(b.name || '');
    return (a.enabled || false) ? -1 : 1;
  });
}

export function dedupeResourcepacks(items: ContentItem[]) {
  return dedupeContent(items);
}

export function dedupeShaders(items: ContentItem[]) {
  return dedupeContent(items);
}

export function dedupeDatapacks(items: ContentItem[]) {
  return dedupeContent(items, (it) => it.worldName || '(Global)');
}
