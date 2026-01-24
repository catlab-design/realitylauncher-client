const assert = require('assert');

function dedupeResourcepacks(items) {
  const uniqueRp = {};
  for (const it of items) {
    const base = (it.filename || '').toString().replace(/\.disabled$/i, '').toLowerCase();
    const existing = uniqueRp[base];
    if (!existing) uniqueRp[base] = it;
    else {
      if (it.enabled && !existing.enabled) uniqueRp[base] = it;
    }
  }
  return Object.values(uniqueRp).sort((a,b)=>{
    if (a.enabled === b.enabled) return (a.name||'').localeCompare(b.name||'');
    return a.enabled ? -1 : 1;
  });
}

function dedupeShaders(items) {
  const unique = {};
  for (const it of items) {
    const base = (it.filename || '').toString().replace(/\.disabled$/i, '').toLowerCase();
    const existing = unique[base];
    if (!existing) unique[base] = it;
    else {
      if (it.enabled && !existing.enabled) unique[base] = it;
    }
  }
  return Object.values(unique).sort((a,b)=>{
    if (a.enabled === b.enabled) return (a.name||'').localeCompare(b.name||'');
    return a.enabled ? -1 : 1;
  });
}

function dedupeDatapacks(items) {
  const uniqueDp = {};
  for (const it of items) {
    const base = (it.filename || '').toString().replace(/\.disabled$/i, '').toLowerCase();
    const key = `${(it.worldName || '(Global)')}::${base}`;
    const existing = uniqueDp[key];
    if (!existing) uniqueDp[key] = it;
    else {
      if (it.enabled && !existing.enabled) uniqueDp[key] = it;
    }
  }
  return Object.values(uniqueDp).sort((a,b)=>{
    if (a.worldName === b.worldName) {
      if (a.enabled === b.enabled) return (a.name||'').localeCompare(b.name||'');
      return a.enabled ? -1 : 1;
    }
    return (a.worldName||'').localeCompare(b.worldName||'');
  });
}

// Test data
const resourcepacks = [
  { filename: 'packA.zip', name: 'Pack A', enabled: true },
  { filename: 'packB.zip.disabled', name: 'Pack B old', enabled: false },
  { filename: 'packB.zip', name: 'Pack B', enabled: true },
  { filename: 'packC.zip.disabled', name: 'Pack C old', enabled: false },
  { filename: 'packC.zip.disabled', name: 'Pack C duplicate old', enabled: false },
];

const shaders = [
  { filename: 'shader1.zip.disabled', name: 'Shader1 old', enabled: false },
  { filename: 'shader1.zip', name: 'Shader1', enabled: true },
  { filename: 'shader2.zip', name: 'Shader2', enabled: true },
];

const datapacks = [
  { filename: 'dp1.zip', name: 'DP1', worldName: '(Global)', enabled: true },
  { filename: 'dp1.zip.disabled', name: 'DP1 old', worldName: '(Global)', enabled: false },
  { filename: 'dp2.zip', name: 'DP2', worldName: 'World1', enabled: true },
  { filename: 'dp2.zip.disabled', name: 'DP2 old', worldName: 'World1', enabled: false },
  { filename: 'dp2.zip', name: 'DP2 dup', worldName: 'World1', enabled: true },
];

console.log('Resourcepacks before:', resourcepacks.length);
console.log('Resourcepacks after:', dedupeResourcepacks(resourcepacks));

console.log('Shaders before:', shaders.length);
console.log('Shaders after:', dedupeShaders(shaders));

console.log('Datapacks before:', datapacks.length);
console.log('Datapacks after:', dedupeDatapacks(datapacks));

// Basic assertions
assert.strictEqual(dedupeResourcepacks(resourcepacks).length, 3);
assert.strictEqual(dedupeShaders(shaders).length, 2);
assert.strictEqual(dedupeDatapacks(datapacks).length, 2);
console.log('All dedupe tests passed');
