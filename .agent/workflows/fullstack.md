---
description: รัน Services ทั้งหมดสำหรับ Full Stack Development
---

# วิธีรัน Services ทั้งหมด

ต้องเปิด Terminal หลายตัวพร้อมกัน:

## Terminal 1: ml-api (Backend - Port 3000)
```bash
cd e:\mlauncher\ml-api
bun install
bun run db:push  # ครั้งแรกเท่านั้น
bun dev
```

## Terminal 2: ml-auth (Login Website - Port 3001)
```bash
cd e:\mlauncher\ml-auth
bun install
bun dev
```

## Terminal 3: ml-admin (Admin Panel - Port 3002)
```bash
cd e:\mlauncher\ml-admin
bun install
bun dev
```

## Terminal 4: ml-client (Electron Launcher)
```bash
cd e:\mlauncher\ml-client
bun install
bun dev
```

## Ports Summary
| Service | Port |
|---------|------|
| ml-api | 3000 |
| ml-auth | 3001 |
| ml-admin | 3002 |
| ml-client (Astro) | 4321 |
