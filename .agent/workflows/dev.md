---
description: เริ่มต้น Development Server สำหรับ ml-client
---

# วิธีรัน Development Server

// turbo-all

1. ติดตั้ง dependencies (ถ้ายังไม่ได้ทำ):
```bash
bun install
```

2. รัน dev server:
```bash
bun dev
```

3. เมื่อ Astro พร้อมแล้ว Electron จะเปิดขึ้นมาอัตโนมัติที่ `http://localhost:4321`

## หมายเหตุ
- ใช้ `Ctrl+C` เพื่อหยุด server
- ถ้ามีปัญหา Hot Reload ให้ลอง restart server ใหม่
