# PromptPay Client Demo

ตัวอย่าง integration สำหรับระบบรับชำระเงิน PromptPay QR + Webhook

## Prerequisites

- Node.js 18+
- บัญชีและ API key จากระบบ (ดูขั้นตอนด้านล่าง)
- NestJS server รันอยู่บนเครื่องเดียวกัน (default: `http://localhost:3000`)

## Setup

### 1. สร้าง API key

เข้า dashboard → API Keys → สร้าง key ใหม่ จด `id` และ `sk_line_...` key ไว้

### 2. ตั้งค่า PromptPay ID

เข้า dashboard → PromptPay Settings → ใส่หมายเลขโทรศัพท์ / เลขบัตรประชาชน

### 3. ตั้ง webhook URL บน API key

เข้า dashboard → API Keys → คลิก ✏ แก้ไข webhook URL ของ key ที่จะใช้  
ใส่: `http://localhost:3001/webhook` (หรือ URL สาธารณะถ้า deploy บน server)

### 4. ติดตั้งและ config

```bash
cp .env.example .env
# แก้ .env:
#   API_KEY=sk_line_...    (จาก dashboard)
#   WEBHOOK_SECRET=...     (ตรงกับ WEBHOOK_SECRET ใน NestJS .env)
#   PROMPTPAY_ID=...       (เบอร์โทรหรือเลขบัตรของคุณ)

npm install
npm start
```

เปิด http://localhost:3001

## วิธีใช้งาน

1. หน้าเว็บจะแสดง PromptPay ID ที่ตั้งไว้บน server
2. กรอกจำนวนเงิน → กด "สร้าง QR"
3. QR code จะปรากฏ พร้อมนับถอยหลังเวลาหมดอายุ
4. เมื่อลูกค้าโอนเงิน → สถานะจะเปลี่ยนเป็น **ชำระเงินแล้ว** ทันที (ผ่าน webhook)
5. ถ้าหมดเวลา → สถานะจะเปลี่ยนเป็น **หมดอายุแล้ว** อัตโนมัติ

## สถาปัตยกรรม

```
Browser ──GET /events──► Express (SSE)
   │                          │
   └──POST /create-transaction─┤
                              │──POST /promptpay/transactions──► NestJS
                              │
NestJS ──POST /webhook──────► Express ──SSE push──► Browser
```

## Webhook Signature Verification

ทุก webhook request จาก NestJS มี header:
```
X-Webhook-Signature: sha256=<hmac-sha256>
```

`index.js` verify signature ด้วย `crypto.timingSafeEqual` ก่อนประมวลผล  
ดูโค้ดใน `index.js` หัวข้อ "Signature verification" สำหรับคำอธิบายละเอียด

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `API_BASE` | | NestJS server URL (default: `http://localhost:3000`) |
| `PORT` | | Port ของ demo client (default: `3001`) |
| `API_KEY` | ✓ | `sk_line_...` key จาก dashboard |
| `WEBHOOK_SECRET` | | ต้องตรงกับ `WEBHOOK_SECRET` ใน NestJS `.env` |
| `PROMPTPAY_ID` | | หมายเลขพร้อมเพย์ที่แสดงในหน้า UI (เพื่อ reference เท่านั้น) |
| `PROMPTPAY_TYPE` | | ประเภท: `phone`, `national_id`, `tax_id`, `ewallet` (default: `phone`) |
