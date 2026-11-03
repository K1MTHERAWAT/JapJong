# Jongwen · ระบบขอใช้สถานที่ ขอใช้อุปกรณ์ และแจ้งซ่อม (Monorepo)

ระบบบริหารจัดการคำขอใช้สถานที่ราชการ ขอยืม–คืนครุภัณฑ์ และแจ้งซ่อมบำรุง สำหรับองค์การบริหารส่วนตำบล (อบต.) พัฒนาด้วยสถาปัตยกรรม Monorepo ระดับ Production-ready โดยใช้ **Next.js 15 + NestJS 11 + Tailwind CSS + PostgreSQL (Supabase / Docker + Prisma ORM)**

> 📖 **คู่มือการใช้งานสำหรับประชาชนและผู้ใช้งานทั่วไป:** อ่านได้ที่ไฟล์ **[`USER_MANUAL.md`](./USER_MANUAL.md)**

---

## สถาปัตยกรรมระบบ (Architecture)

* **Frontend**: Next.js 15 (App Router) + Tailwind CSS (Responsive Desktop / Tablet / Mobile + Print A4 ใบอนุญาตราชการ)
* **Backend API**: NestJS 11 + Express + RESTful API + ValidationPipe (`class-validator`)
* **Database**: รองรับทั้ง **Supabase PostgreSQL (Cloud)** และ **PostgreSQL 16 (Docker Compose)**
* **ORM & Migrations**: Prisma ORM v6 + สคริปต์อัปเดตโครงสร้างฐานข้อมูลอัตโนมัติ (`migrate-supabase.ts`)
* **Two-Factor Signing Verification**: ระบบยืนยันการลงนามเอกสาร 2 ชั้นด้วย **Email OTP (Resend SDK / Mock Mode)** + **รหัส PIN 6 หลักส่วนบุคคล** + **ลายมือชื่อดิจิทัลที่วาดจริง**
* **LINE Official Account & Notification System (Phase 3)**: ระบบแจ้งเตือนประชาชนและเจ้าหน้าที่ผ่าน **LINE Messaging API (Push Text & Flex Messages)** พร้อม **Outbox Queue (Idempotency, Exponential Backoff Retry)**, **LINE Webhook (HMAC-SHA256, Friendship Status Tracking)** และ **Mock Provider** สำหรับโหมดทดสอบ
* **LINE Login & Onboarding (Phase 2)**: เข้าสู่ระบบและเชื่อมต่อบัญชีด้วย LINE พร้อมระบบลงทะเบียนผู้ใช้ใหม่และบันทึกความยินยอม **PDPA Consent**
* **Document Security**: ระบบตรวจสอบเอกสารดิจิทัล QR Code (`qrcode`, `html5-qrcode`), รหัสยืนยันสุ่ม 32-byte, SHA-256 Document Hashing และบันทึกประวัติการสแกน
* **Shared Package**: `@jongwen/shared` (TypeScript Types, Labels, RBAC Logic, Date Helpers, Period Conflict Checks)
* **Testing & CI/CD**: Vitest (Unit Tests 308 ข้อ ครอบคลุม 26 Scenarios) + GitHub Actions CI Pipeline + Multi-stage Dockerfile

---

## โครงสร้าง Monorepo

```text
BookingV1/
├── .github/
│   └── workflows/
│       └── ci.yml              # CI Pipeline: Lint, Typecheck, Test (Vitest) & Build All
├── docker-compose.yml          # Local PostgreSQL 16 Service (ตัวเลือกสำรองกรณีรันในเครื่อง)
├── Dockerfile                  # Multi-stage Dockerfile สำหรับ Production Deployment
├── .dockerignore               # กำหนดไฟล์ที่ไม่ต้องส่งเข้า Docker build context
├── LICENSE                     # MIT License
├── vitest.config.mts           # กำหนดค่า Unit Testing สำหรับ Monorepo
├── packages/
│   └── shared/                 # @jongwen/shared — Types, Labels, RBAC Logic, Business Logic
│       └── src/
│           ├── types.ts          # Shared Models, Account (รวมที่อยู่), PublicAccount, Request Types
│           ├── labels.ts         # ป้ายกำกับภาษาไทยสำหรับบทบาท สถานะ และประเภทคำขอ
│           ├── logic.ts          # RBAC (canAccessRoute), ตรวจจองซ้อน (Conflict Checks), SoD
│           ├── logic.test.ts     # Unit Tests ทดสอบเงื่อนไขทางธุรกิจ
│           └── index.ts
├── apps/
│   ├── api/                    # @jongwen/api — NestJS REST API (:4000/api)
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Prisma Data Model (22 ตาราง รวม LINE accounts, notifications, logs, webhooks)
│   │   │   ├── migrations/         # SQL Migration Files
│   │   │   ├── migrate-supabase.ts # สคริปต์สร้างและอัปเดตตารางบน Supabase PostgreSQL (Migration 1-7)
│   │   │   └── seed.ts             # Standalone Seed Script (รองรับ argon2id hash)
│   │   └── src/
│   │       ├── auth/             # Login, Register, LINE Login, Email OTP, Profile, Signature, PIN
│   │       ├── line/             # LINE Messaging API Client, Flex Template Service, Webhook Handler
│   │       ├── notifications/    # In-App Notifications, Outbox Queue, Preferences, Business Events, Admin Retry
│   │       ├── resources/        # Venues, Equipment, Monthly Availability, Conflict & Stock Check
│   │       ├── requests/         # Booking, Borrow, Repair, 3-Level Sign, Handover, Reschedule
│   │       ├── documents/        # QR Code Verification, Document Hashing, Public & Staff Verify API
│   │       ├── admin/            # Users & Permissions, Account Management, Overview, Activity Logs
│   │       └── db/               # Prisma Database Service (Persistent DB Sessions & Sequences)
│   └── web/                    # @jongwen/web — Next.js 15 (App Router) + Tailwind CSS (:3000)
│       ├── public/               # Static Assets (โลโก้, ไอคอน)
│       └── src/
│           ├── app/              # หน้าจอทั้งหมดตามบทบาท (Responsive Phone/Tablet/Desktop)
│           │   ├── login/        # เข้าสู่ระบบ + LINE Login + โหมดคลิกเดียว (One-Click Demo)
│           │   ├── register/     # ลงทะเบียนผู้ใช้ทั่วไป และ /register/line (ลงทะเบียนครั้งแรกผ่าน LINE + PDPA)
│           │   ├── account/      # จัดการบัญชีผู้ใช้งาน (โปรไฟล์, ที่อยู่, เปลี่ยนรหัสผ่าน, ลายเซ็น & PIN)
│           │   ├── notifications/# ศูนย์การแจ้งเตือน (/notifications) และตั้งค่าช่องทางรับแจ้งเตือน (/settings)
│           │   ├── booking/      # ขอใช้สถานที่ราชการ (5 ขั้นตอน + ล็อกรายการตามที่เลือกจริง)
│           │   ├── borrow/       # ขอยืม–คืนอุปกรณ์ราชการ (3 ขั้นตอน + แบบคำขอราชการ) และ /borrow/my
│           │   ├── repair/       # แจ้งซ่อมบำรุงและติดตามสถานะ (Fast-ticket ไม่บังคับลงนาม)
│           │   ├── requests/     # รายละเอียดคำขอ เอกสารราชการ A4 และขอเลื่อนวัน/ยกเลิก
│           │   ├── history/      # ประวัติคำขอและการดำเนินการ (แยกตามบทบาทและฟิลเตอร์ครบชุด)
│           │   ├── staff/        # เจ้าหน้าที่ (ตรวจคำขอ, รับมอบ–รับคืน, กรอกแทน, ตรวจสอบ QR Code /staff/verify)
│           │   ├── verify/       # ตรวจสอบเอกสารดิจิทัลสาธารณะสำหรับประชาชน (/verify/[token])
│           │   ├── approver/     # ปลัด อบต. / นายก อบต. (คิวลงนามอนุมัติด้วย PIN 6 หลัก, ใบอนุญาต PDF)
│           │   └── admin/        # แอดมิน (ภาพรวม, จัดการทรัพยากร/แบบฟอร์ม, ผู้ใช้ & สิทธิ์, แดชบอร์ดแจ้งเตือน)
│           ├── components/       # AppShell, Sidebar (Badge แจ้งเตือน), UI Primitives, DatePicker & OfficialGovFormDocument
│           └── lib/api.ts        # Client API SDK (Notifications, Preferences, LINE Status, Admin Retry)
├── package.json
└── pnpm-workspace.yaml
```

---

## การเชื่อมต่อฐานข้อมูล (Supabase PostgreSQL / Local Docker)

### ทางเลือกที่ 1: ใช้งานร่วมกับ Supabase Cloud (แนะนำ — ไม่ต้องเปิด Docker)
1. ตั้งค่า `DATABASE_URL` ในไฟล์ `apps/api/.env` และ `.env` ชี้ไปยังฐานข้อมูล Supabase PostgreSQL ของคุณ:
   ```env
   DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?schema=public"
   ```
   *(หมายเหตุ: หากรหัสผ่านมีอักขระพิเศษ เช่น `+` หรือ `/` ให้เข้ารหัสเป็น `%2B` และ `%2F`)*
2. รันสคริปต์สร้างตารางและนำเข้าข้อมูลเริ่มต้นขึ้น Supabase:
   ```powershell
   pnpm --filter @jongwen/api exec tsx prisma/migrate-supabase.ts
   pnpm db:seed
   ```

### ทางเลือกที่ 2: ใช้งาน PostgreSQL บน Docker ในเครื่อง
| รายการ | ค่าการเชื่อมต่อ |
| :--- | :--- |
| **Host / Port** | `localhost:5433` |
| **Database / User / Password** | `jongwen` / `jongwen` / `jongwen_dev` |
| **DATABASE_URL** | `postgresql://jongwen:jongwen_dev@localhost:5433/jongwen?schema=public` |

---

## คำสั่งสำหรับพัฒนาและจัดการระบบ (NPM Scripts)

| คำสั่ง | คำอธิบาย |
| :--- | :--- |
| `pnpm dev` | สตาร์ททั้ง Shared, Web (`:3000`) และ API (`:4000`) พร้อมกัน |
| `pnpm test` | รัน Unit Tests ด้วย **Vitest** ทั้งหมดใน Monorepo |
| `pnpm typecheck` | ตรวจสอบความถูกต้องของ Type ด้วย TypeScript (`tsc --noEmit`) ทุกแพ็กเกจ |
| `pnpm build` | คอมไพล์และสร้าง Production Bundle ของทั้ง Shared, API และ Web |
| `pnpm db:seed` | นำเข้าข้อมูลเริ่มต้น (6 บัญชีผู้ใช้, 6 สถานที่, 5 อุปกรณ์, 14 คำขอตัวอย่าง) |
| `pnpm db:clear` | ล้างเฉพาะข้อมูลคำขอและประวัติทั้งหมด (เหลือเฉพาะบัญชีผู้ใช้และทรัพยากร) |
| `pnpm db:studio` | เปิด **Prisma Studio** (Web GUI บริหารจัดการข้อมูลผ่าน Browser ที่ `http://localhost:5555`) |
| `pnpm db:up` / `pnpm db:down` | เปิด / ปิด PostgreSQL container กรณีใช้งานผ่าน Docker ในเครื่อง |

---

## วิธีเริ่มต้นใช้งาน (Quick Start)

### 1. ติดตั้งแพ็กเกจ
```powershell
pnpm install
```

### 2. เตรียมฐานข้อมูล (Supabase หรือ Docker)
```powershell
# กรณีใช้ Supabase (ตั้งค่า DATABASE_URL ใน apps/api/.env แล้ว):
pnpm --filter @jongwen/api exec tsx prisma/migrate-supabase.ts
pnpm db:seed
```

### 3. ตั้งค่าสภาพแวดล้อม (Environment Variables)

สร้างไฟล์ `apps/api/.env` (คัดลอกจาก `.env.example`):
```env
# Database
DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?schema=public"

# LINE Official Account / Messaging API (Phase 3)
LINE_CHANNEL_ID="<Messaging_API_Channel_ID>"
LINE_CHANNEL_SECRET="<Messaging_API_Channel_Secret>"
LINE_CHANNEL_ACCESS_TOKEN="<Long_Lived_Channel_Access_Token>"
LINE_OA_BASIC_ID="@<your_oa_basic_id>"
LINE_WEBHOOK_URL="https://<your-domain>/api/line/webhook"
LINE_NOTIFICATION_ENABLED=false # เปลี่ยนเป็น true เมื่อพร้อมส่งจริง (หาก false จะใช้ Mock Provider อัตโนมัติ)

# LINE Login (Phase 2)
LINE_LOGIN_CALLBACK_URL="http://localhost:4000/auth/line/callback"
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:4000"
```

### 4. รันระบบทั้งหมด
```powershell
pnpm dev
```
- **Web App (Next.js)**: http://localhost:3000
- **API Server (NestJS)**: http://localhost:4000/api
- **LINE Webhook Endpoint**: http://localhost:4000/api/line/webhook

---

## บัญชีทดสอบในระบบ (Demo Accounts)

สามารถคลิกสลับบทบาทได้ทันทีจากแผง **One-Click Demo** ที่หน้า `/login`:

| ชื่อผู้ใช้ (`username`) | ชื่อ-นามสกุล | บทบาท (`role`) | อีเมลรับ OTP | ตำแหน่งแสดงผล | รหัสผ่าน | PIN ลงนาม | หน้าเริ่มต้น |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `somchai` | สมชาย ใจดี | ผู้ใช้งานทั่วไป (`USER`) | `somchai@namcham.go.th` | ประชาชน | `1234` | `123456` | `/` |
| `manee` | มานี มีนา | ผู้ใช้งานทั่วไป (`USER`) | `manee@namcham.go.th` | ประชาชน | `1234` | `123456` | `/` |
| `suda` | สุดา มีสุข | เจ้าหน้าที่ผู้ตรวจสอบ (`STAFF`) | `suda@namcham.go.th` | เจ้าหน้าที่ธุรการ | `1234` | `123456` | `/staff` |
| `wichai` | วิชัย รักถิ่น | ปลัดองค์การบริหารส่วนตำบล (`APPROVER_L2`) | `wichai@namcham.go.th` | ปลัดองค์การบริหารส่วนตำบล | `1234` | `123456` | `/approver` |
| `prasert` | ประเสริฐ ศรีสุข | นายกองค์การบริหารส่วนตำบล (`APPROVER_L1`) | `prasert@namcham.go.th` | นายกองค์การบริหารส่วนตำบล | `1234` | `123456` | `/approver` |
| `admin` | ผู้ดูแลระบบ | แอดมิน (`ADMIN`) | `admin@namcham.go.th` | ผู้ดูแลระบบ | `1234` | `123456` | `/admin` |

---

## จุดเด่นของระบบและประสบการณ์ผู้ใช้งาน (UI/UX & Workflow Highlights)

1. **ระบบจัดการบัญชีส่วนตัวและที่อยู่อัตโนมัติ (`/account`):**
   - ผู้ใช้ทุกบทบาทสามารถแก้ไขชื่อ-นามสกุล, ชื่อเล่น, หน่วยงาน/ชุมชน, เบอร์โทรศัพท์ และ **ที่อยู่ตามทะเบียน/ที่ติดต่อ** (`บ้านเลขที่`, `หมู่ที่`, `ตำบล/แขวง`, `อำเภอ/เขต`, `จังหวัด`)
   - เปลี่ยนรหัสผ่านด้วยตนเอง และตั้งค่าลายมือชื่อดิจิทัลพร้อมรหัส PIN 6 หลักสำหรับยืนยันการลงนาม
   - ข้อมูลชื่อ หน่วยงาน และที่อยู่จากโปรไฟล์จะถูกดึงไปกรอกใน **แบบขอใช้สถานที่ราชการ** และ **แบบคำขอใช้อุปกรณ์ราชการ** โดยอัตโนมัติ
2. **การจองสถานที่ (5 ขั้นตอน) และการยืมอุปกรณ์ (3 ขั้นตอน) พร้อมล็อกรายการอัตโนมัติ:**
   - ตรวจสอบคิวว่างและป้องกันการจองสถานที่ซ้อนทับช่วงเวลา รวมถึงตัดสต็อกอุปกรณ์ตามช่วงวันที่ใช้งานจริง
   - ในขั้นตอนกรอกคำขอ รายการภายใต้หัวข้อ **"มีความประสงค์ขอใช้สถานที่ราชการ ดังนี้"** และ **"มีความประสงค์ขอใช้อุปกรณ์ราชการ ดังนี้"** จะถูกล็อกตามสถานที่และอุปกรณ์ที่เลือกไว้ในขั้นตอนก่อนหน้า ป้องกันการพิมพ์แก้ไขรายการเองโดยไม่ผ่านการตรวจคิว/สต็อก
3. **เอกสารราชการอิเล็กทรอนิกส์ 4 ฝ่าย (`OfficialGovFormDocument`):**
   - แสดงผลและสั่งพิมพ์ใบอนุญาตขนาด A4 ตามรูปแบบหนังสือราชการ:
     1. **ผู้ขออนุญาตใช้สถานที่/อุปกรณ์ราชการ**
     2. **ความเห็นของเจ้าหน้าที่ผู้ตรวจสอบ** (แสดงตำแหน่งจริงของผู้ลงนาม)
     3. **ความเห็นของปลัดองค์การบริหารส่วนตำบล**
     4. **คำสั่งของนายกองค์การบริหารส่วนตำบล**
4. **Sidebar แยกหมวดหมู่ & Sticky Action Bar:**
   - แถบเมนูด้านซ้ายจัดหมวดหมู่ตามบทบาทชัดเจน (*บริการหลัก, รายการและประวัติ, งานเจ้าหน้าที่, งานผู้บริหาร, ระบบและผู้ดูแล, บัญชีผู้ใช้งาน*) ย่อ/ขยายได้ และรองรับ Mobile Drawer
   - มีแถบหัวข้อหน้า (Top Page Header) พร้อมปุ่มย้อนกลับ และแถบปุ่มดำเนินการด้านล่างแบบลอยตัว (Sticky Footer Action Bar) ในหน้าฟอร์มหลายขั้นตอน
5. **ระบบตรวจสอบเอกสารราชการด้วย QR Code (Document Verification & Anti-Tampering):**
   - เอกสารราชการที่ผ่านการอนุมัติแล้วจะได้รับการสร้างรหัสยืนยันดิจิทัล (Verification Token สุ่ม 32-byte) และคำนวณ **SHA-256 Hash** ประจำเอกสาร
   - ฝัง QR Code ลงในเอกสารราชการทางการ (`OfficialGovFormDocument`) ที่มุมล่างขวา เชื่อมโยงตรงไปยัง URL ตรวจสอบสาธารณะ
   - **ประชาชนทั่วไป (`/verify/[token]`):** ตรวจสอบสถานะเอกสารได้ทันทีจากสมาร์ตโฟน โดยไม่เปิดเผยข้อมูลส่วนบุคคล (PII Safe) แสดงเฉพาะสถานะความถูกต้อง วันที่ออกเอกสาร และหน่วยงานผู้ออก (อบต.น้ำชำ)
   - **เจ้าหน้าที่ (`/staff/verify`):** สแกนผ่านกล้องมือถือสด (ตรวจจับกล้องหลังอัตโนมัติ), อัปโหลดรูปภาพ QR Code หรือค้นหาด้วยเลขที่เอกสาร แสดงข้อมูลระดับลึก เช่น ชื่อผู้ยื่น ลายมือชื่อการอนุมัติ พร้อมบันทึกประวัติการสแกนลงฐานข้อมูลอัตโนมัติ
6. **ระบบยืนยันการลงนาม 2 ชั้น (Two-Factor Document Signing: Email OTP + รหัส PIN 6 หลัก):**
   - ออกแบบกระบวนการลงนามเอกสารให้มีความน่าเชื่อถือและปลอดภัยตามหลักการลายมือชื่ออิเล็กทรอนิกส์:
     - **ชั้นที่ 1 (Verified Session):** ยืนยันตัวตนด้วยรหัส Email OTP 6 หลัก (ส่งผ่าน Resend SDK พร้อมระบบ Mock OTP สำหรับสภาพแวดล้อมการพัฒนา) เมื่อยืนยันสำเร็จจะได้สิทธิ์เซสชันลงนามต่อเนื่อง 30 นาที ช่วยให้ตรวจคำขอและลงนามได้หลายฉบับในคิวโดยไม่ต้องขอ OTP ซ้ำ
     - **ชั้นที่ 2 (PIN Authorization):** เมื่อคลิกลงนามในแต่ละเอกสาร ผู้ลงนามต้องกดรหัส PIN 6 หลักส่วนบุคคลผ่านแป้นตัวเลขจำลอง (`PinKeypad`) เพื่อยืนยันเจตนาการลงนาม
     - **ลายมือชื่อดิจิทัลจริง:** ต้องวาดลายเซ็นสดบนหน้าจอสัมผัสหรือเมาส์ (ระบบไม่ถือว่า OTP หรือ PIN เป็นลายเซ็นดิจิทัลโดยอัตโนมัติ)
     - รองรับครบวงจรในหน้าลงนามผู้อนุมัติ (`/approver/sign/[id]`), หน้าตรวจคำขอเจ้าหน้าที่ (`/staff/review`), หน้าตั้งค่า 3 ขั้นตอน (`/approver/settings`) และหน้าจัดการบัญชีส่วนตัว (`/account`)
7. **ระบบแจ้งเตือนผ่าน LINE Official Account & ศูนย์การแจ้งเตือน (Phase 3 — LINE Notification System):**
   - แจ้งเตือนประชาชนและเจ้าหน้าที่ผ่าน **LINE Official Account (LINE Messaging API)** เมื่อมีเหตุการณ์สำคัญเกิดขึ้นในระบบ:
     - **ระบบจองสถานที่:** แจ้งเตือนเมื่อส่งคำขอสำเร็จ, เจ้าหน้าที่รับเรื่อง, อยู่ระหว่างตรวจสอบ, ขอเอกสารเพิ่ม, ได้รับอนุมัติ/ปฏิเสธ, และเอกสารรอการลงนาม
     - **ระบบยืม-คืนอุปกรณ์:** แจ้งเตือนผลการอนุมัติ, ใกล้ถึงกำหนดคืน, และแจ้งเตือนเมื่อเลยกำหนดคืน
     - **ระบบแจ้งซ่อมบำรุง:** แจ้งเตือนรับเรื่อง, เจ้าหน้าที่เริ่มดำเนินการซ่อม, ซ่อมเสร็จสิ้น, และปิดงาน
     - **การลงนามเอกสาร 3 ลำดับขั้น:** แจ้งเตือนคิวรอลงนามไปยังเจ้าหน้าที่ผู้ตรวจสอบ, ปลัด อบต., และนายก อบต.
   - **ข้อความรูปแบบ Flex Message (Bubble Card):** แสดงข้อมูลสวยงาม มีสีสันบอกสถานะชัดเจน พร้อมปุ่มกดดูรายละเอียดคำขอและลิงก์ความปลอดภัย (Safe URL Whitelist)
   - **ศูนย์การแจ้งเตือนภายในเว็บ (`/notifications`):** ดูประวัติการแจ้งเตือนทั้งหมด, กรองตามหมวดหมู่, ตัวนับจำนวนที่ยังไม่อ่านแบบเรียลไทม์ และปุ่มทำเครื่องหมายอ่านแล้วทั้งหมด
   - **ตั้งค่าการรับแจ้งเตือนรายบุคคล (`/notifications/settings`):** ผู้ใช้สามารถเปิด-ปิดการแจ้งเตือน In-App และ LINE แยกตามหมวดหมู่ได้อย่างอิสระ โดยช่องทาง LINE เป็นแบบ **Opt-in** ตามหลักความเป็นส่วนตัว (PDPA)
   - **แดชบอร์ดตรวจสอบการแจ้งเตือนสำหรับผู้ดูแลระบบ (`/admin/notifications`):** ตรวจสอบประวัติการส่ง (Sent, Failed, Skipped), ดู Error Code, และกดปุ่ม Retry ส่งข้อความใหม่ได้ทันที
8. **ระบบ LINE Login & ลงทะเบียนครั้งแรกพร้อม PDPA Consent (Phase 2):**
   - เข้าสู่ระบบด้วย LINE Account ผ่าน LINE Login v2.1
   - กรณีเข้าสู่ระบบครั้งแรก จะได้รับ Secure Ticket นำทางไปยังหน้าลงทะเบียนเฉพาะ (`/register/line`) เพื่อกรอกข้อมูลพื้นฐานและบันทึกความยินยอมตามนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)

---

## คุณสมบัติความมั่นคงปลอดภัยและสถาปัตยกรรมองค์กร (Enterprise Security)

1. **Persistent Sessions ในฐานข้อมูล:** เก็บ Session Token ในตาราง `sessions` บน PostgreSQL รองรับการรีสตาร์ทเซิร์ฟเวอร์โดยเซสชันไม่หลุด
2. **Atomic Sequence Generator:** ใช้ตาราง `sequences` ออกเลขที่คำขอ (เช่น `BK-2569-0001`, `BR-2569-0001`, `RP-2569-0001`) แบบ Atomic ป้องกันเลขซ้ำ
3. **Immutable Signature Audit:** บันทึกลายมือชื่อดิจิทัลและประวัติการลงนามแยกตามรอบการอนุมัติ (`round`) อย่างถาวร พร้อม `activity_logs`
4. **การแบ่งแยกหน้าที่ (Separation of Duties - SoD):**
   - ผู้ขอใช้บริการไม่สามารถลงนามอนุมัติคำขอของตนเองได้
   - ปลัด อบต. (`APPROVER_L2`) และ นายก อบต. (`APPROVER_L1`) ต้องเป็นคนละบัญชีในการลงนามคำขอเดียวกัน
   - เจ้าหน้าที่ไม่สามารถตรวจรับมอบ–รับคืนอุปกรณ์ให้คำขอของตนเองได้
5. **การเข้ารหัสด้วย Argon2id:** รหัสผ่านบัญชี, รหัส PIN 6 หลัก และรหัส OTP ได้รับการแฮชด้วย `argon2id`
6. **การป้องกันการปลอมแปลงเอกสาร (Document Integrity & Anti-Tampering):**
   - ตรวจสอบสถานะเอกสารแบบเรียลไทม์ผ่าน Backend (`VALID`, `REVOKED`, `INVALID`, `NOT_FOUND`)
   - รองรับการเพิกถอนสิทธิ์เอกสาร (`POST /documents/:id/revoke`) และการออกเอกสารฉบับใหม่ (Versioning) โดยฉบับเดิมจะสิ้นผลทันที
   - บันทึกประวัติการสแกนของเจ้าหน้าที่ (`DocumentScanLog`) พร้อม IP Address, User Agent และ Timestamp
7. **ความปลอดภัยของระบบ OTP และ Signing Session (OTP & Session Integrity):**
   - รหัส OTP มีอายุ 5 นาที และใช้ได้เพียงครั้งเดียว (Single-Use Token)
   - จัดเก็บเป็นแฮช SHA-256 HMAC พร้อมเกลือลับ ป้องกันการดักจับหรืออ่านรหัสตรงจากฐานข้อมูล
   - ป้องกัน Brute-force: จำกัดการกรอกผิดไม่เกิน 5 ครั้ง หากเกินระบบจะระงับรหัสทันที
   - ป้องกัน Rate Abuse: หน่วงเวลาการขอรหัสใหม่ (Cooldown) ขั้นต่ำ 60 วินาที
   - เซสชันการลงนาม (`sign_verified_sessions`) จะถูกเพิกถอนทันทีเมื่อออกจากระบบ (Logout), เซสชันหมดอายุ (30 นาที) หรือผู้ใช้กดเพิกถอนด้วยตนเอง
8. **ความมั่นคงปลอดภัยของ LINE Messaging API & Outbox Queue (Phase 3):**
   - **ความปลอดภัยของ Credentials:** Channel Access Token และ Channel Secret ถูกจัดเก็บใน Backend เท่านั้น ไม่ถูกเปิดเผยไปยัง Frontend หรือบันทึกลงใน Error Log
   - **การป้องกันข้อความซ้ำ (Idempotency):** ใช้ `eventKey` และ `X-Line-Retry-Key` ในการส่งข้อความ ป้องกันการส่งแจ้งเตือนซ้ำในเหตุการณ์เดียวกัน
   - **ระบบคิว Outbox และ Retry:** มีกลไก Retry แบบ Exponential Backoff สำหรับข้อขัดข้องชั่วคราวทางเครือข่าย พร้อมแยกแยะข้อผิดพลาดถาวร (401, 403, 429, User Blocked)
   - **การตรวจสอบ Webhook Signature:** ยืนยันความถูกต้องของ `X-Line-Signature` ด้วย HMAC-SHA256 กับ Raw Request Body ป้องกันการปลอมแปลง Request และจัดเก็บ Webhook Event ID เพื่อป้องกัน Replay Attack
   - **Resilience & Fallback:** หาก LINE API มีปัญหา ระบบจะไม่ทำให้กระบวนการหลักทางธุรกิจ (Business Transaction) ล้มเหลว โดย In-App Notification ยังคงทำงานได้ตามปกติ

---

## ER Diagram (Mermaid)

```mermaid
erDiagram
    accounts ||--o{ requests : "requester_id"
    accounts ||--o{ requests : "created_by_staff_id"
    accounts ||--o{ signature_records : "signer_id"
    accounts ||--o{ handover_records : "staff_id"
    accounts ||--o{ notifications : "user_id"
    accounts ||--o{ user_line_accounts : "user_id"
    accounts ||--o{ user_notification_preferences : "user_id"
    accounts ||--o{ line_notification_logs : "user_id"
    accounts ||--o{ sessions : "account_id"
    accounts ||--o{ activity_logs : "actor_id"
    accounts ||--o{ document_scan_logs : "scanned_by"
    accounts ||--o{ sign_otp_codes : "account_id"
    accounts ||--o{ sign_verified_sessions : "account_id"

    notifications ||--o{ line_notification_logs : "notification_id"

    requests ||--o{ request_venues : "request_id"
    requests ||--o{ request_periods : "request_id"
    requests ||--o{ request_items : "request_id"
    requests ||--o{ signature_records : "request_id"
    requests ||--o{ handover_records : "request_id"
    requests ||--o{ document_verifications : "document_id"
    document_verifications ||--o{ document_scan_logs : "verification_id"

    venues ||--o{ request_venues : "venue_id"
    equipments ||--o{ request_items : "equipment_id"

    accounts {
        string id PK
        string username UK
        string password "argon2id"
        string name
        string nickname
        string initial
        string role "USER, STAFF, APPROVER_L2, APPROVER_L1, ADMIN"
        string position
        string department
        string phone
        string email
        boolean email_verified
        string line_name
        string address_house_no
        string address_moo
        string address_subdistrict
        string address_district
        string address_province
        text signature
        string pin "argon2id"
        jsonb permissions
        boolean active
        timestamptz created_at
    }

    sessions {
        string token PK
        string account_id FK
        timestamptz expires_at
        timestamptz created_at
    }

    sequences {
        string key PK
        int value
        timestamptz updated_at
    }

    venues {
        string id PK
        string name
        string type "meeting, pavilion, field, yard, training"
        string building
        string floor
        int capacity
        string status "available, maintenance"
        boolean enabled
        text_array facilities
        string open_time
        string close_time
        int_array open_days
        int advance_days
        string form_name
        int approval_levels
        timestamptz created_at
    }

    equipments {
        string id PK
        string name
        string category "audio, tent, it"
        int stock
        boolean enabled
        timestamptz created_at
    }

    requests {
        string id PK
        string code UK
        string type "booking, borrow, repair"
        string status "pending_staff, pending_l2, pending_l1, approved, rejected, etc"
        int approval_round
        string requester_id FK
        string requester_name
        string organization
        text requester_signature
        string written_at
        string requester_position
        string address_house_no
        string address_moo
        string address_subdistrict
        string address_district
        string address_province
        jsonb purpose_items
        text purpose
        string activity
        int attendees
        date pickup_date
        date return_date
        text repair_detail
        text created_by_staff_signature
        text reject_reason
        timestamptz created_at
        timestamptz updated_at
    }

    request_venues {
        string request_id PK,FK
        string venue_id PK,FK
    }

    request_periods {
        serial id PK
        string request_id FK
        string kind "current, reschedule"
        int sort_order
        timestamptz start_time
        timestamptz end_time
    }

    request_items {
        serial id PK
        string request_id FK
        string equipment_id FK
        int qty
    }

    signature_records {
        serial id PK
        string request_id FK
        string level "staff, l2, l1"
        int round
        string signer_id FK
        string signer_name
        string title
        string decision "approve, reject"
        text signature
        text note
        timestamptz signed_at
    }

    handover_records {
        serial id PK
        string request_id FK
        string phase "before, after"
        jsonb checklist
        text note
        string staff_id FK
        string staff_name
        text citizen_signature
        text staff_signature
        timestamptz created_at
    }

    notifications {
        string id PK
        string user_id FK
        string title
        string body
        string notification_type "BOOKING_STATUS, BORROW_STATUS, etc"
        string reference_type "booking, borrow, repair, document"
        string reference_id
        boolean read
        string link
        timestamptz read_at
        timestamptz created_at
    }

    user_line_accounts {
        string id PK
        string user_id FK
        string line_user_id UK
        string display_name
        string picture_url
        string friendship_status "FRIEND, BLOCKED, UNFRIEND, UNKNOWN"
        boolean is_active
        timestamptz linked_at
        timestamptz status_updated_at
        timestamptz created_at
        timestamptz updated_at
    }

    user_notification_preferences {
        string id PK
        string user_id FK
        string channel "IN_APP, LINE"
        string notification_type "BOOKING_STATUS, BORROW_STATUS, etc"
        boolean is_enabled
        timestamptz created_at
        timestamptz updated_at
    }

    line_notification_logs {
        string id PK
        string user_id FK
        string notification_id FK
        string line_user_id
        string notification_type
        string event_key UK
        string reference_type
        string reference_id
        string status "PENDING, PROCESSING, SENT, FAILED, SKIPPED"
        string provider_message_id
        string error_code
        string error_message
        int attempt_count
        timestamptz sent_at
        timestamptz created_at
    }

    line_webhook_events {
        string id PK
        string webhook_event_id UK
        string event_type "follow, unfollow, message, accountLink"
        string line_user_id
        timestamptz event_timestamp
        string processing_status "PROCESSED, DUPLICATE, IGNORED, FAILED"
        timestamptz processed_at
        timestamptz created_at
    }

    activity_logs {
        string id PK
        string kind "user, role, resource, request"
        string title
        string detail
        string actor_id FK
        string actor_name
        string actor_role
        string ip
        timestamptz created_at
    }

    otp_codes {
        string id PK
        string phone
        string code_hash "argon2id"
        int attempts
        timestamptz expires_at
        timestamptz consumed_at
        timestamptz created_at
    }

    document_verifications {
        string id PK
        string document_id FK
        string verification_token UK
        string document_number
        string document_hash "sha256"
        int version
        string status "VALID, REVOKED, INVALID"
        string issuing_org
        string document_type
        text qr_code_data_url
        timestamptz issued_at
        timestamptz revoked_at
        timestamptz created_at
        timestamptz updated_at
    }

    document_scan_logs {
        serial id PK
        string verification_id FK
        string document_number
        string scanned_by FK
        string scanned_role
        string result_status "VALID, REVOKED, NOT_FOUND, INVALID"
        string ip_address
        string user_agent
        timestamptz scanned_at
    }

    sign_otp_codes {
        string id PK
        string account_id FK
        string email
        string otp_hash "sha256"
        int failed_attempts
        timestamptz expires_at
        timestamptz consumed_at
        timestamptz created_at
    }

    sign_verified_sessions {
        string id PK
        string account_id FK
        string session_token UK
        timestamptz expires_at
        timestamptz revoked_at
        timestamptz created_at
    }
```
