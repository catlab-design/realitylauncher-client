---
description: รัน ml-api Backend Server
---

# วิธีรัน API Server (Backend)

// turbo-all

1. ไปที่ directory `ml-api`:
```bash
cd e:\mlauncher\ml-api
```

2. ติดตั้ง dependencies:
```bash
bun install
```

3. Push database schema (ครั้งแรก):
```bash
bun run db:push
```

4. รัน dev server (port 3000):
```bash
bun dev
```

## Environment Variables
ต้องสร้างไฟล์ `.env` ก่อน:
- `DATABASE_URL` - Connection string จาก Neon/Supabase
- `JWT_SECRET` - Secret สำหรับ JWT (32+ characters)
- `MICROSOFT_CLIENT_ID` - จาก Azure Portal
- `MICROSOFT_CLIENT_SECRET` - จาก Azure Portal
- `MICROSOFT_REDIRECT_URI` - Callback URL
