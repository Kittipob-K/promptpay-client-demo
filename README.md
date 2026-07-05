# PromptPay Client Demo

Demo client สำหรับทดสอบการสร้าง PromptPay QR ผ่าน NotiBank API และรับ webhook event กลับมาที่หน้าเว็บแบบ real-time ผ่าน SSE

## What Changed

- ใช้ NotiBank API ปัจจุบันที่บังคับ `orderId`
- ไม่ใช้ `PROMPTPAY_ID` และ `PROMPTPAY_TYPE` ใน demo แล้ว เพราะค่าพร้อมเพย์อยู่ในฐานข้อมูลของผู้ใช้ NotiBank
- `WEBHOOK_SECRET` เป็น optional และใช้เฉพาะ verify webhook signature ของ API key ที่เลือก
- ปรับ UI เป็น dark grid, emerald accent และ Noto Sans Thai ให้ใกล้กับหน้า auth/dashboard ของ NotiBank

## Prerequisites

- Node.js 18+
- NotiBank API รันอยู่ เช่น `http://localhost:3001`
- ผู้ใช้ใน NotiBank ตั้งค่า PromptPay ID แล้ว
- API key จากหน้า API Keys ของ NotiBank

## Setup

```bash
cp .env.example .env
npm install
npm start
```

เปิด `http://localhost:3002`

ค่า `.env` ขั้นต่ำ:

```bash
API_BASE=http://localhost:3001
PORT=3002
API_KEY=sk_line_your_key_here
```

ถ้าต้องการ verify webhook signature ให้ใส่ secret เดียวกับ API key นั้น:

```bash
WEBHOOK_SECRET=your_api_key_webhook_secret_here
```

## Webhook URL

ตั้ง webhook URL ใน NotiBank API key ให้ชี้มาที่ demo receiver:

```text
http://localhost:3002/webhook
```

สำหรับ production หรือ security policy ปัจจุบันของ NotiBank อาจไม่อนุญาต `localhost`/private IP เป็น webhook URL ให้ใช้ HTTPS public URL หรือ tunnel แทน เช่น:

```text
https://your-public-demo-url.example.com/webhook
```

## Usage

1. กรอกจำนวนเงิน
2. ใส่ `orderId` หรือเว้นว่างเพื่อให้ demo สร้าง `demo-<timestamp>`
3. กดสร้าง QR
4. หน้าเว็บจะแสดง QR, ยอดรวม suffix, countdown และ webhook event

## Flow

```text
Browser -> Express demo -> NotiBank /promptpay/transactions
Browser <- Express SSE <- NotiBank webhook -> Express /webhook
```

API key ถูกเก็บไว้ฝั่ง Express proxy เท่านั้น ไม่ถูกส่งไปที่ browser

## Environment Variables

| Variable | Required | Description |
|---|---:|---|
| `API_BASE` | | NotiBank API URL, default `http://localhost:3001` |
| `PORT` | | Demo client port, default `3002` |
| `API_KEY` | yes | `sk_line_...` key จาก NotiBank dashboard |
| `WEBHOOK_SECRET` | | Optional signature verification secret for this API key |
