#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TARGET_DIR = path.join(PROJECT_ROOT, "src", "electron");
const CODE_EXTENSIONS = new Set([".ts", ".js", ".tsx", ".jsx", ".cjs", ".mjs"]);
const WRITE_CALL_PATTERN =
  /\b(?:writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream|mkdirSync|mkdir|rmSync|rm)\s*\(/;
const VAR_NAME_PATTERN = /^[A-Za-z_$][\w$]*$/;

function collectFiles(dirPath, out) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, out);
      continue;
    }

    if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(fullPath);
    }
  }
}

function containsWholeWord(line, token) {
  if (!VAR_NAME_PATTERN.test(token)) return false;
  const pattern = new RegExp(`\\b${token}\\b`);
  return pattern.test(line);
}

function checkFile(filePath) {
  const errors = [];
  const source = fs.readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/);
  const appPathVars = [];

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;

    if (
      line.includes("app.getAppPath(") &&
      WRITE_CALL_PATTERN.test(line)
    ) {
      errors.push({
        filePath,
        lineNo,
        message:
          "Direct write call with app.getAppPath() detected. Use app.getPath(\"userData\") or app.getPath(\"temp\") for writable files.",
      });
    }

    const varMatch = line.match(
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*.*app\.getAppPath\(/,
    );
    if (varMatch) {
      appPathVars.push({ name: varMatch[1], lineNo });
    }
  });

  for (const item of appPathVars) {
    const scanStart = item.lineNo;
    const scanEnd = Math.min(lines.length, item.lineNo + 80);

    for (let i = scanStart; i < scanEnd; i += 1) {
      const line = lines[i];
      if (!WRITE_CALL_PATTERN.test(line)) continue;
      if (!containsWholeWord(line, item.name)) continue;

      errors.push({
        filePath,
        lineNo: i + 1,
        message: `Write call uses "${item.name}" derived from app.getAppPath().`,
      });
    }
  }

  return errors;
}

function main() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.error(`[check-no-app-asar-writes] Missing path: ${TARGET_DIR}`);
    process.exit(1);
  }

  const files = [];
  collectFiles(TARGET_DIR, files);

  const findings = [];
  for (const filePath of files) {
    findings.push(...checkFile(filePath));
  }

  if (findings.length > 0) {
    console.error(
      `[check-no-app-asar-writes] Found ${findings.length} potential unsafe write pattern(s):`,
    );
    for (const finding of findings) {
      const relativePath = path.relative(PROJECT_ROOT, finding.filePath);
      console.error(`- ${relativePath}:${finding.lineNo} ${finding.message}`);
    }
    process.exit(1);
  }

  console.log(
    "[check-no-app-asar-writes] OK: no write operation is using app.getAppPath().",
  );
}

main();
