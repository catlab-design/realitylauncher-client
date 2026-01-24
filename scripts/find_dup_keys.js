console.log('Running duplicate key detector...');
const fs = require('fs');
const s = fs.readFileSync('e:/mlauncher/ml-client/src/i18n/translations.ts','utf8');
// find top-level language blocks like 'th: { ... },\n    en: {'
const langs = {};
let cur = null;
let brace = 0;
const lines = s.split('\n');
for (let i=0;i<lines.length;i++){
    const line = lines[i];
    const startMatch = line.match(/^\s*([a-z]{2})\s*:\s*\{/);
    if (startMatch && brace===0){ cur = startMatch[1]; brace = 1; langs[cur] = [];
        continue;
    }
    if (cur){
        // check braces to find end
        brace += (line.match(/\{/g)||[]).length;
        brace -= (line.match(/\}/g)||[]).length;
        // extract keys
        const keyMatch = line.match(/^\s*(["']?)([a-zA-Z0-9_\.\-]+)\1\s*:/);
        if (keyMatch) langs[cur].push({key:keyMatch[2], line: i+1});
        if (brace===0){ cur=null; }
    }
}
const out = {};
for (const l of Object.keys(langs)){
    const arr = langs[l].map(x=>x.key);
    const dup = arr.filter((v,i,a)=> a.indexOf(v)!==i);
    out[l] = { duplicates: [...new Set(dup)], occurrences: {} };
    if (dup.length>0){
        const dups = [...new Set(dup)];
        for (const d of dups){
            out[l].occurrences[d] = langs[l].filter(x=>x.key===d).map(x=>x.line);
        }
    }
}
fs.writeFileSync('e:/mlauncher/ml-client/tmp/dup_keys.json', JSON.stringify(out, null, 2));
console.log('Wrote e:/mlauncher/ml-client/tmp/dup_keys.json');
