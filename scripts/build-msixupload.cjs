const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'release-build', 'store-msix');
const arch = process.env.MS_STORE_MSIX_ARCH || 'x64';
const productId = (process.env.MS_STORE_PRODUCT_ID || '').trim();
const skipDistWin = process.env.SKIP_DIST_WIN === 'true';
const tenantId = (process.env.MS_STORE_TENANT_ID || '').trim();
const sellerId = (process.env.MS_STORE_SELLER_ID || '').trim();
const clientId = (process.env.MS_STORE_CLIENT_ID || '').trim();
const clientSecret = (process.env.MS_STORE_CLIENT_SECRET || '').trim();

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: rootDir,
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

function commandExists(cmd) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [cmd], { stdio: 'ignore', shell: false });
  return result.status === 0;
}

function resolveMsstoreCommand() {
  const explicit = (process.env.MSSTORE_BIN || '').trim();
  if (explicit) {
    return explicit;
  }

  if (commandExists('msstore')) {
    return 'msstore';
  }

  const homeDir = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
  const fallback = process.platform === 'win32'
    ? path.join(homeDir || '', 'msstorecli', 'msstore.exe')
    : path.join(homeDir || '', 'msstorecli', 'msstore');

  if (fallback && fs.existsSync(fallback)) {
    return fallback;
  }

  throw new Error(
    [
      'MS Store CLI (msstore) was not found.',
      'Install it first, then run again.',
      'Windows quick install:',
      "  1) $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }",
      '  2) Invoke-WebRequest -Uri "https://github.com/microsoft/msstore-cli/releases/latest/download/MSStoreCLI-win-$arch.zip" -OutFile "$env:TEMP\\MSStoreCLI.zip"',
      '  3) Expand-Archive "$env:TEMP\\MSStoreCLI.zip" "$env:USERPROFILE\\msstorecli" -Force',
      '  4) (optional) $env:PATH="$env:USERPROFILE\\msstorecli;$env:PATH"',
      'Or set MSSTORE_BIN to the full msstore executable path.'
    ].join('\n')
  );
}

function collectFiles(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) {
    return out;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(fullPath, ext));
      continue;
    }
    if (entry.isFile() && fullPath.toLowerCase().endsWith(ext.toLowerCase())) {
      out.push(fullPath);
    }
  }
  return out;
}

function latestFile(files) {
  if (!files.length) {
    return null;
  }
  return files
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].file;
}

function powershellSingleQuoted(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function createMsixUploadFromMsix(msixPath) {
  const baseName = path.basename(msixPath, path.extname(msixPath));
  const stageDir = path.join(outputDir, '_msixupload');
  const zipPath = path.join(outputDir, `${baseName}.zip`);
  const uploadPath = path.join(outputDir, `${baseName}.msixupload`);

  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  fs.copyFileSync(msixPath, path.join(stageDir, path.basename(msixPath)));

  const symbols = collectFiles(outputDir, '.appxsym');
  const matchingSymbol = symbols.find(
    (file) => path.basename(file, path.extname(file)) === baseName
  );
  if (matchingSymbol) {
    fs.copyFileSync(matchingSymbol, path.join(stageDir, path.basename(matchingSymbol)));
  }

  fs.rmSync(zipPath, { force: true });
  fs.rmSync(uploadPath, { force: true });

  const archiveScript = [
    '$ErrorActionPreference = "Stop"',
    `Compress-Archive -Path ${powershellSingleQuoted(path.join(stageDir, '*'))} -DestinationPath ${powershellSingleQuoted(zipPath)} -Force`,
  ].join('; ');
  run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', archiveScript]);

  fs.renameSync(zipPath, uploadPath);
  fs.rmSync(stageDir, { recursive: true, force: true });
  return uploadPath;
}

try {
  if (!skipDistWin) {
    run('bun', ['run', 'dist:win']);
  } else {
    console.log('SKIP_DIST_WIN=true, skipping `bun run dist:win`.');
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const msstore = resolveMsstoreCommand();

  const hasAllStoreAuth = tenantId && sellerId && clientId && clientSecret;
  const hasAnyStoreAuth = tenantId || sellerId || clientId || clientSecret;
  if (hasAllStoreAuth) {
    run(msstore, [
      'reconfigure',
      '--tenantId',
      tenantId,
      '--sellerId',
      sellerId,
      '--clientId',
      clientId,
      '--clientSecret',
      clientSecret,
    ]);
  } else if (hasAnyStoreAuth) {
    console.warn(
      'Partial MS Store credentials found in env. Provide all of: ' +
      'MS_STORE_TENANT_ID, MS_STORE_SELLER_ID, MS_STORE_CLIENT_ID, MS_STORE_CLIENT_SECRET.'
    );
  }

  const msstoreArgs = ['package', rootDir, '-o', outputDir, '-a', arch];
  if (productId) {
    msstoreArgs.push('-id', productId);
  }
  run(msstore, msstoreArgs);

  let msixUpload = latestFile(collectFiles(outputDir, '.msixupload'));
  const msix = latestFile(collectFiles(outputDir, '.msix'));

  if (!msixUpload && msix) {
    msixUpload = createMsixUploadFromMsix(msix);
    console.log(`Generated .msixupload: ${msixUpload}`);
  }

  const chosen = msixUpload || msix;
  if (!chosen) {
    throw new Error('No .msix or .msixupload was generated.');
  }

  console.log(`Store package ready: ${chosen}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
