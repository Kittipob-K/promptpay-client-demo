# PromptPay Client Demo

Demo client สำหรับทดสอบสร้าง PromptPay QR ผ่าน NotiBank API และรับ webhook event กลับมาที่หน้าเว็บ

## การตั้งค่า

ต้องมี:

- Node.js 18+
- NotiBank API ที่ใช้งานได้
- ผู้ใช้ใน NotiBank ตั้งค่า PromptPay ID แล้ว
- API key จากหน้า API Keys ของ NotiBank

สร้างไฟล์ config:

```bash
cp .env.example .env
```

ตั้งค่า `.env`:

```bash
API_BASE=http://localhost:3001
PORT=3002
API_KEY=sk_line_your_key_here
```

ถ้าต้องการตรวจลายเซ็น webhook ให้ใส่ secret ของ API key นั้น:

```bash
WEBHOOK_SECRET=your_api_key_webhook_secret_here
```

ติดตั้ง dependency:

```bash
npm install
```

## ใช้งานบนเครื่อง

เริ่ม server:

```bash
npm start
```

เปิดหน้าเว็บ:

```text
http://localhost:3002
```

ตั้ง webhook URL ของ API key ใน NotiBank เป็น:

```text
http://localhost:3002/webhook
```

ถ้าใช้งานกับ production ให้ใช้ HTTPS public URL:

```text
https://your-demo-domain.example.com/webhook
```

## Deploy to CasaOS

Deploy ครั้งแรกพร้อมส่ง `.env`:

```bash
npm run deploy:casaos -- --push-env
```

Deploy พร้อมระบุ public URL:

```bash
npm run deploy:casaos -- --push-env \
  --public-url https://your-demo-domain.example.com
```

ค่า default ของ deploy:

| Item | Value |
|---|---|
| Container | `promptpay-client-demo` |
| Remote path | `/home/alphabet88/promptpay-client-demo` |
| Port | `25455 -> 3002` |
| API base | `https://api-notibank.jesthai.online` |

หลัง deploy ให้ตั้ง webhook URL ของ API key เป็น:

```text
https://your-demo-domain.example.com/webhook
```

## วิธีทดสอบ

1. เปิดหน้า demo
2. กรอกจำนวนเงิน
3. ใส่ `orderId` หรือเว้นว่างเพื่อให้ระบบสร้างให้อัตโนมัติ
4. กดสร้าง QR
5. สแกนจ่ายเงิน
6. ตรวจสถานะ QR, countdown และ webhook event บนหน้าเว็บ
