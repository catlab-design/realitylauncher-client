const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

function walk(dir) {
  const res = [];
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    const st = fs.statSync(fp);
    if (st.isDirectory()) {
      res.push(...walk(fp));
    } else if (/\.(ts|tsx|js|jsx)$/.test(f)) {
      res.push(fp);
    }
  }
  return res;
}

// scan entire workspace (excluding node_modules) to find parse errors
const root = path.join(__dirname, '..', '..');

function walkRoot(dir) {
  const res = [];
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules' || f === 'dist' || f === 'release-build') continue;
    const fp = path.join(dir, f);
    const st = fs.statSync(fp);
    if (st.isDirectory()) {
      res.push(...walkRoot(fp));
    } else if (/\.(ts|tsx|js|jsx)$/.test(f)) {
      res.push(fp);
    }
  }
  return res;
}

const files = walkRoot(root);
let found = false;
for (const file of files) {
  try {
    const code = fs.readFileSync(file, 'utf8');
    parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties', 'decorators-legacy'],
    });
  } catch (err) {
    console.error('Parse error in file:', file);
    console.error(err.message);
    if (err.loc) console.error('Line:', err.loc.line, 'Column:', err.loc.column);
    found = true;
    break;
  }
}
if (!found) console.log('No parse errors found');
