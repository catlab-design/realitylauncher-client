export type ContentItem = {
  filename: string;
  name?: string;
  worldName?: string;
  enabled?: boolean;
  [k: string]: any;
};

export function dedupeResourcepacks(items: ContentItem[]) {
  const unique: Record<string, ContentItem> = {};
  for (const it of items) {
    const base = (it.filename || '').toString().replace(/\.disabled$/i, '').toLowerCase();
    const existing = unique[base];
    if (!existing) unique[base] = it;
    else {
      if (it.enabled && !existing.enabled) unique[base] = it;
    }
  }
  return Object.values(unique).sort((a: ContentItem, b: ContentItem) => {
    if ((a.enabled || false) === (b.enabled || false)) return (a.name || '').localeCompare(b.name || '');
    return (a.enabled || false) ? -1 : 1;
  });
}

export function dedupeShaders(items: ContentItem[]) {
  const unique: Record<string, ContentItem> = {};
  for (const it of items) {
    const base = (it.filename || '').toString().replace(/\.disabled$/i, '').toLowerCase();
    const existing = unique[base];
    if (!existing) unique[base] = it;
    else {
      if (it.enabled && !existing.enabled) unique[base] = it;
    }
  }
  return Object.values(unique).sort((a: ContentItem, b: ContentItem) => {
    if ((a.enabled || false) === (b.enabled || false)) return (a.name || '').localeCompare(b.name || '');
    return (a.enabled || false) ? -1 : 1;
  });
}

export function dedupeDatapacks(items: ContentItem[]) {
  const unique: Record<string, ContentItem> = {};
  for (const it of items) {
    const base = (it.filename || '').toString().replace(/\.disabled$/i, '').toLowerCase();
    const key = `${(it.worldName || '(Global)')}::${base}`;
    const existing = unique[key];
    if (!existing) unique[key] = it;
    else {
      if (it.enabled && !existing.enabled) unique[key] = it;
    }
  }
  return Object.values(unique).sort((a: ContentItem, b: ContentItem) => {
    if ((a.worldName || '') === (b.worldName || '')) {
      if ((a.enabled || false) === (b.enabled || false)) return (a.name || '').localeCompare(b.name || '');
      return (a.enabled || false) ? -1 : 1;
    }
    return (a.worldName || '').localeCompare(b.worldName || '');
  });
}
