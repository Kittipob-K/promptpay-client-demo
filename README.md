# PromptPay Client Demo

Demo client สำหรับทดสอบสร้าง PromptPay QR ผ่าน NotiBank API และรับ webhook event กลับมาที่หน้าเว็บ

## การตั้งค่า

ต้องมี:

- Node.js 18+
- NotiBank API ที่ใช้งานได้
- ผู้ใช้ใน NotiBank ตั้งค่า PromptPay ID แล้ว
- API key 1 ชุดจากหน้า API Keys ของ NotiBank

สร้างไฟล์ config:

```bash
cp .env.example .env
```

ตั้งค่า `.env`:

```bash
API_BASE=http://localhost:3001
PORT=3002
API_KEY=sk_line_your_key_here
WEBHOOK_SECRET=your_same_api_key_webhook_secret_here
LINE_TOKEN_FILE=./secrets/line-token.json
LINE_EMAIL=your-line-email@example.com
LINE_PASSWORD=your-line-password
```

แนวคิดของ demo ตอนนี้คือใช้ API key เดียวสำหรับทั้ง:

- สร้าง PromptPay transaction
- auth การอัปโหลด LINE Connector
- verify webhook ที่ NotiBank ส่งกลับมา

ดังนั้น `WEBHOOK_SECRET` ควรเป็น secret ของ API key เดียวกันนั้น

LINE Connector flow ปัจจุบันเป็นแบบนี้:

```mermaid
flowchart TD
    A["เปิดใช้งานครั้งแรก"] --> B["Login LINE ด้วย QR Code ผ่าน NotiBank"]
    B --> C["ได้ token ชุดแรก + sqr_cert"]
    C --> D["demo บันทึก line-token.json ไว้ในเครื่องลูกค้า"]
    D --> E["demo ส่ง token แบบ encrypted ไปตรวจสอบกับ NotiBank"]
    E --> F{"token เดิมยังใช้ได้ไหม"}
    F -->|ได้| G["ผ่านการตรวจสอบ ใช้งานต่อ"]
    F -->|ไม่ได้| H["ส่ง LINE_EMAIL / LINE_PASSWORD<br/>แบบ encrypted ให้ NotiBank login ใหม่"]
    H --> I["ได้ token ชุดใหม่"]
    I --> J["demo บันทึก token ใหม่กลับลง line-token.json"]
    J --> G
```

LINE Connector มี 3 flow หลัก:

- ถ้ามี `LINE_TOKEN_FILE` และมี `LINE_EMAIL` / `LINE_PASSWORD` demo จะส่ง token เดิมไปตรวจสอบก่อน และแนบ credential แบบ encrypted เป็น fallback
- ถ้ามีแต่ `LINE_TOKEN_FILE` demo จะอัปโหลด token แบบ encrypted เพื่อตรวจสอบอย่างเดียว
- ถ้าไม่มี token file แต่มี credential demo จะส่ง `email/password` แบบ encrypted ให้ NotiBank login เพื่อสร้าง token ชุดใหม่

ยังต้องทำ QR login จากหน้า NotiBank อย่างน้อยหนึ่งครั้งเพื่อสร้าง `sqr_cert` ของ user นั้นก่อน เพราะ certificate นี้ช่วยให้การ login fallback ด้วย email/password มีโอกาสผ่านได้โดยไม่ต้องยืนยัน PIN ใหม่ทุกครั้ง

ไฟล์ `LINE_TOKEN_FILE` สำหรับ fallback token upload ต้องเป็น JSON แบบนี้:

```json
{
  "authToken": "line-access-token",
  "refreshToken": "line-refresh-token",
  "mid": "u1234567890"
}
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

เมื่อมีค่า config ครบ demo server จะ:

- อ่าน LINE token จากไฟล์ local ถ้ามี
- fetch public key จาก NotiBank
- เข้ารหัส payload แล้วส่งไป `POST /line/connector/token`
- ถ้า token เดิมใช้ไม่ได้ และมี `LINE_EMAIL` / `LINE_PASSWORD` ระบบจะ login ใหม่อัตโนมัติและบันทึก token ใหม่กลับลง `LINE_TOKEN_FILE`
- ใช้ `API_KEY` สำหรับ auth และใช้ `WEBHOOK_SECRET` ของ key เดียวกันสำหรับ HMAC/webhook verification
- retry ให้อัตโนมัติทุก 5 นาที
- เปิดให้กด manual retry จากหน้า demo

เหตุผลที่ยังต้องมี `LINE_EMAIL` / `LINE_PASSWORD`:

- `authToken` ของ LINE อาจหมดอายุหรือถูก revoke ได้
- ตอน token เดิมใช้ไม่ได้ demo จะไม่สามารถพึ่ง token file อย่างเดียวได้
- credential ชุดนี้จึงถูกใช้เป็น fallback เพื่อขอ token ใหม่เท่านั้น ไม่ใช่เส้นทางหลักของการทำงานประจำ

ตั้ง webhook URL ของ API key ใน NotiBank เป็น:

```text
http://localhost:3002/webhook
```

ถ้าใช้งานกับ production ให้ใช้ HTTPS public URL:

```text
https://your-demo-domain.example.com/webhook
```

## API Documentation

เอกสารนี้แบ่งเป็น 2 ส่วน:

- Demo Server API: endpoint ที่อยู่บน server ตัวอย่างนี้ เช่น `http://localhost:3002`
- NotiBank API: endpoint จริงของ NotiBank เช่น `http://localhost:3001`

### Demo Server API

#### GET `/settings`

ใช้ดึง config ฝั่ง browser แบบไม่เปิดเผย secret

Request:

```bash
curl http://localhost:3002/settings
```

Response:

```json
{
  "apiBase": "http://localhost:3001",
  "demoPort": 3002,
  "webhookPath": "/webhook",
  "apiKeySuffix": "abc123",
  "lineConnectorConfigured": true
}
```

#### GET `/events`

ใช้เปิด Server-Sent Events เพื่อให้หน้า demo รับ event แบบ realtime

Request:

```bash
curl -N http://localhost:3002/events
```

Event ที่อาจได้รับ:

```text
event: ready
data: {"connected":true}

event: webhook
data: {"event":"transaction.fulfilled","transaction":{"id":"txn_..."},"signatureVerified":true}

event: connector
data: {"configured":true,"mode":"email_password","lastError":null}
```

#### POST `/create-transaction`

ใช้สร้าง PromptPay QR ผ่าน NotiBank API โดย demo server จะใส่ `API_KEY` ให้เองจาก `.env`

Request:

```bash
curl -X POST http://localhost:3002/create-transaction \
  -H 'Content-Type: application/json' \
  -d '{
    "amount": 100,
    "orderId": "order-1001",
    "expiresInSeconds": 300
  }'
```

Request body:

| Field | Type | Required | Description |
|---|---|---:|---|
| `amount` | number | yes | ยอดเงินหลักที่ต้องการสร้าง QR |
| `orderId` | string | no | เลขอ้างอิง order; ถ้าไม่ส่ง demo จะสร้าง `demo-{timestamp}` |
| `expiresInSeconds` | number | no | อายุ QR เป็นวินาที; default `300` |

Response `201`:

```json
{
  "id": "txn_202607abcdef123456",
  "orderId": "order-1001",
  "baseAmount": 100,
  "amount": 100,
  "suffixCents": 0,
  "status": "pending",
  "expiresAt": "2026-07-07T08:20:00.000Z",
  "createdAt": "2026-07-07T08:15:00.000Z",
  "fulfilledAt": null,
  "qrDataUrl": "data:image/png;base64,...",
  "metadata": { "source": "promptpay-client-demo" },
  "statusToken": "st_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

Error examples:

```json
{ "error": "amount must be a positive number" }
```

```json
{ "error": "LINE_TOKEN_EXPIRED", "message": "LINE token expired or not linked. Please re-login via QR." }
```

#### POST `/webhook`

ใช้รับ webhook จาก NotiBank เมื่อ transaction เปลี่ยนสถานะ เช่นจ่ายสำเร็จหรือหมดอายุ

Headers:

| Header | Description |
|---|---|
| `x-webhook-signature` | HMAC SHA-256 จาก `WEBHOOK_SECRET` ในรูปแบบ `sha256=<hex>` |

Request body example:

```json
{
  "event": "transaction.fulfilled",
  "transaction": {
    "id": "txn_202607abcdef123456",
    "orderId": "order-1001",
    "amount": 100,
    "status": "fulfilled"
  }
}
```

Response:

```json
{ "received": true }
```

ถ้า signature ไม่ถูกต้อง:

```json
{ "error": "Invalid signature" }
```

#### GET `/line-connector/status`

ใช้ดูสถานะ LINE Connector ของ demo server

Request:

```bash
curl http://localhost:3002/line-connector/status
```

Response:

```json
{
  "configured": true,
  "mode": "email_password",
  "inFlight": false,
  "lastAttemptAt": "2026-07-07T08:15:00.000Z",
  "lastSuccessAt": "2026-07-07T08:15:01.000Z",
  "lastError": null,
  "tokenFile": "./secrets/line-token.json"
}
```

#### POST `/line-connector/upload`

ใช้สั่งให้ demo upload LINE token ไปตรวจสอบกับ NotiBank ทันที ไม่ต้องรอรอบ interval

Request:

```bash
curl -X POST http://localhost:3002/line-connector/upload
```

Response:

```json
{
  "configured": true,
  "mode": "email_password",
  "inFlight": false,
  "lastAttemptAt": "2026-07-07T08:15:00.000Z",
  "lastSuccessAt": "2026-07-07T08:15:01.000Z",
  "lastError": null,
  "tokenFile": "./secrets/line-token.json"
}
```

#### POST `/line-connector/bootstrap`

endpoint นี้ให้ NotiBank เรียกหลัง QR login สำเร็จ เพื่อส่ง token bundle มาให้ demo บันทึกลง `LINE_TOKEN_FILE`

ผู้ใช้งานทั่วไปไม่ต้องเรียก endpoint นี้เอง

Headers:

| Header | Description |
|---|---|
| `x-connector-timestamp` | timestamp ที่ใช้ประกอบ HMAC |
| `x-connector-signature` | HMAC SHA-256 จาก `WEBHOOK_SECRET` ในรูปแบบ `sha256=<hex>` |

Request body:

```json
{
  "authToken": "line-access-token",
  "refreshToken": "line-refresh-token",
  "mid": "u1234567890"
}
```

Response:

```json
{
  "ok": true,
  "status": {
    "configured": true,
    "lastError": null
  }
}
```

### NotiBank API

#### POST `/promptpay/transactions`

ใช้สร้าง PromptPay transaction และ QR Code โดยตรงกับ NotiBank API

Authentication:

```text
Authorization: Bearer <API_KEY>
```

Request:

```bash
curl -X POST http://localhost:3001/promptpay/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer sk_line_your_key_here' \
  -d '{
    "amount": 100,
    "orderId": "order-1001",
    "expiresInSeconds": 300,
    "metadata": {
      "source": "my-system"
    }
  }'
```

Request body:

| Field | Type | Required | Description |
|---|---|---:|---|
| `amount` | number | yes | ยอดเงินหลักที่ต้องการรับ |
| `orderId` | string | yes | เลขอ้างอิง order ต้องไม่ซ้ำใน user เดียวกัน |
| `expiresInSeconds` | number | no | อายุ QR; ระบบจำกัดสูงสุดตาม NotiBank |
| `metadata` | object | no | ข้อมูลประกอบที่ระบบลูกค้าต้องการแนบ |

Response `201`:

```json
{
  "id": "txn_202607abcdef123456",
  "orderId": "order-1001",
  "apiKeyId": "key-id",
  "baseAmount": 100,
  "amount": 100.03,
  "suffixCents": 3,
  "qrDataUrl": "data:image/png;base64,...",
  "metadata": { "source": "my-system" },
  "status": "pending",
  "expiresAt": "2026-07-07T08:20:00.000Z",
  "createdAt": "2026-07-07T08:15:00.000Z",
  "fulfilledAt": null,
  "statusToken": "st_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

หมายเหตุ:

- `amount` ที่ได้กลับมาอาจเป็นยอดจริง + suffix เช่น `100.03` เพื่อให้ระบบจับคู่ยอดโอนกับ transaction ได้แม่นขึ้น
- เก็บ `statusToken` ไว้ฝั่ง server ลูกค้าเท่านั้น ใช้สำหรับตรวจสถานะโดยไม่ต้องใช้ API key จริง

Common errors:

| HTTP | Error | Meaning |
|---:|---|---|
| `401` | `Invalid API key` | API key ไม่ถูกต้อง |
| `403` | `SUBSCRIPTION_EXPIRED` | subscription หมดอายุ |
| `409` | `ORDER_ID_ALREADY_EXISTS` | `orderId` ซ้ำ |
| `409` | `NO_SLOT_AVAILABLE` | suffix ของยอดนี้เต็มชั่วคราว |
| `503` | `SYSTEM_DISABLED` | ระบบ PromptPay ของ user ถูกปิด |
| `503` | `LINE_TOKEN_EXPIRED` | LINE token ใช้งานไม่ได้ ต้องเชื่อมต่อใหม่ |

#### GET `/promptpay/transactions/:id/status`

ใช้ตรวจสอบสถานะ transaction โดยไม่ต้องใช้ API key จริง ใช้ `statusToken` ที่ได้จากตอนสร้าง QR เท่านั้น

Authentication:

```text
Authorization: Bearer <statusToken>
```

Request:

```bash
curl http://localhost:3001/promptpay/transactions/txn_202607abcdef123456/status \
  -H 'Authorization: Bearer st_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

Response `200`:

```json
{
  "id": "txn_202607abcdef123456",
  "orderId": "order-1001",
  "amount": 100.03,
  "status": "fulfilled",
  "createdAt": "2026-07-07T08:15:00.000Z",
  "expiresAt": "2026-07-07T08:20:00.000Z",
  "fulfilledAt": "2026-07-07T08:16:30.000Z",
  "metadata": { "source": "my-system" }
}
```

Status ที่เป็นไปได้:

| Status | Meaning |
|---|---|
| `pending` | ยังรอการชำระเงิน |
| `fulfilled` | ชำระเงินสำเร็จและจับคู่แล้ว |
| `expired` | QR หมดอายุหรือพ้นเวลาชำระ |

Error examples:

```json
{ "error": "STATUS_TOKEN_REQUIRED" }
```

```json
{ "message": "Invalid status token", "error": "Unauthorized", "statusCode": 401 }
```

```json
{ "message": "Status token expired", "error": "Gone", "statusCode": 410 }
```

Response นี้จะไม่คืนข้อมูลภายใน เช่น `apiKeyId`, `webhookSecret`, `bankInfo`, `lineMessageId` หรือ `qrDataUrl`

#### GET `/line/connector/public-key`

ใช้ดึง public key ของ NotiBank สำหรับเข้ารหัส payload LINE Connector

Request:

```bash
curl http://localhost:3001/line/connector/public-key
```

Response:

```json
{
  "keyId": "line-connector-v1",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

#### POST `/line/connector/token`

ใช้ upload LINE token หรือ fallback credential แบบ encrypted ไปให้ NotiBank ตรวจสอบ

Authentication:

```text
Authorization: Bearer <API_KEY>
```

Required headers:

| Header | Description |
|---|---|
| `x-connector-timestamp` | timestamp ตอน sign request |
| `x-connector-nonce` | nonce กัน replay |
| `x-connector-signature` | HMAC SHA-256 จาก `WEBHOOK_SECRET` |

Request body เป็น hybrid encrypted payload:

```json
{
  "keyId": "line-connector-v1",
  "encryptedKey": "...",
  "iv": "...",
  "tag": "...",
  "ciphertext": "..."
}
```

plaintext ก่อน encrypt เป็นได้ 2 รูปแบบ:

```json
{
  "authToken": "line-access-token",
  "refreshToken": "line-refresh-token",
  "mid": "u1234567890",
  "fallback": {
    "type": "email_password",
    "email": "line@example.com",
    "password": "line-password"
  }
}
```

หรือ:

```json
{
  "type": "email_password",
  "email": "line@example.com",
  "password": "line-password"
}
```

Response:

```json
{
  "ok": true,
  "tokenBundle": {
    "authToken": "new-line-access-token",
    "refreshToken": "new-line-refresh-token",
    "mid": "u1234567890"
  }
}
```

ถ้า token เดิมยังใช้ได้ อาจไม่มี `tokenBundle` กลับมา เพราะไม่จำเป็นต้องบันทึก token ใหม่

## วิธีทดสอบ

1. เปิดหน้า demo
2. กรอกจำนวนเงิน
3. ใส่ `orderId` หรือเว้นว่างเพื่อให้ระบบสร้างให้อัตโนมัติ
4. กดสร้าง QR
5. สแกนจ่ายเงิน
6. ตรวจสถานะ QR, countdown และ webhook event บนหน้าเว็บ
