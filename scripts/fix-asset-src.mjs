// One-shot codemod: Astro returns {src} for image imports, Vite returns a URL
// string. Strip `.src` from identifiers imported from image assets so the
// copied Electron UI renders icons/logos correctly under Vite.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) acc.push(p);
  }
  return acc;
}

const files = walk("src");
const importRe =
  /import\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']*\.(?:webp|png|jpe?g|svg)["']/g;

let total = 0;
let touched = 0;
for (const file of files) {
  let src = readFileSync(file, "utf8");
  const ids = new Set();
  let m;
  importRe.lastIndex = 0;
  while ((m = importRe.exec(src)) !== null) ids.add(m[1]);
  if (ids.size === 0) continue;

  let fixed = 0;
  for (const id of ids) {
    const re = new RegExp("\\b" + id + "\\.src\\b", "g");
    src = src.replace(re, () => {
      fixed++;
      return id;
    });
  }
  if (fixed > 0) {
    writeFileSync(file, src);
    total += fixed;
    touched++;
  }
}
console.log(`Fixed ${total} '.src' usages across ${touched} files`);
