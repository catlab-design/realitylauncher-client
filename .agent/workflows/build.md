---
description: สร้าง Build สำหรับ Production และ Distribution
---

# วิธี Build และ Distribute

## Build (Production)
// turbo
1. Build Astro และ Electron:
```bash
bun run build
```

## Distribute (สร้าง Installer)

### Windows
// turbo
2. สร้าง NSIS Installer (.exe):
```bash
bun run dist:win
```

### macOS
3. สร้าง DMG:
```bash
bun run dist:mac
```

### Linux
4. สร้าง AppImage/deb/rpm:
```bash
bun run dist:linux
```

## ผลลัพธ์
- ไฟล์ installer จะอยู่ใน `release-build/`
