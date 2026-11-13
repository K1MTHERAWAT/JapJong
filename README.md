# จับจอง (JapJong) · ระบบขอใช้สถานที่ ขอใช้อุปกรณ์ และแจ้งซ่อม (Monorepo)

ระบบบริหารจัดการคำขอใช้สถานที่ราชการ ขอยืม–คืนครุภัณฑ์ และแจ้งซ่อมบำรุง สำหรับองค์การบริหารส่วนตำบล (อบต.) พัฒนาด้วยสถาปัตยกรรม Monorepo ระดับ Production-ready โดยใช้ **Next.js 15 + NestJS 11 + Tailwind CSS + PostgreSQL (Supabase / Docker + Prisma ORM)**

> 📖 **คู่มือการใช้งานสำหรับประชาชนและผู้ใช้งานทั่วไป:** อ่านได้ที่ไฟล์ **[`USER_MANUAL.md`](./USER_MANUAL.md)**  
> 🎨 **เอกสารมาตรฐานการออกแบบ UI/UX กลาง (Design System):** อ่านได้ที่ไฟล์ **[`DESIGN.md`](./DESIGN.md)**

---

## สถาปัตยกรรมระบบ (Architecture)

* **Frontend**: Next.js 15 (App Router) + Tailwind CSS (Responsive Desktop / Tablet / Mobile + Print A4 ใบอนุญาตราชการ พร้อมระบบ Pinned Sticky Controls ตรึง Header และ Footer Action Bar ลอยตัว)
* **Backend API**: NestJS 11 + Express + RESTful API + ValidationPipe (`class-validator`)
* **Database**: รองรับทั้ง **Supabase PostgreSQL (Cloud)** และ **PostgreSQL 16 (Docker Compose)**
* **ORM & Migrations**: Prisma ORM v6 + สคริปต์อัปเดตโครงสร้างฐานข้อมูลอัตโนมัติ (`migrate-supabase.ts`)
* **Two-Factor Signing Verification**: ระบบยืนยันการลงนามเอกสาร 2 ชั้นด้วย **Email OTP (Resend SDK / Mock Mode)** + **รหัส PIN 6 หลักส่วนบุคคล** + **ลายมือชื่อดิจิทัลที่วาดจริง**
* **LINE Official Account & Notification System (Phase 3)**: ระบบแจ้งเตือนประชาชนและเจ้าหน้าที่ผ่าน **LINE Messaging API (Push Text & Flex Messages)** พร้อม **Outbox Queue (Idempotency, Exponential Backoff Retry)**, **LINE Webhook (HMAC-SHA256, Friendship Status Tracking)** และ **Mock Provider** สำหรับโหมดทดสอบ
* **LINE Login & Onboarding (Phase 2)**: เข้าสู่ระบบและเชื่อมต่อบัญชีด้วย LINE พร้อมระบบลงทะเบียนผู้ใช้ใหม่และบันทึกความยินยอม **PDPA Consent**
* **Document Security**: ระบบตรวจสอบเอกสารดิจิทัล QR Code ความเร็วสูง (`@nimiq/qr-scanner`, `qrcode`), รหัสยืนยันสุ่ม 32-byte, SHA-256 Document Hashing และบันทึกประวัติการสแกน
* **Shared Package**: `@japjong/shared` (TypeScript Types, Labels, RBAC Logic, Date Helpers, Period Conflict Checks)
* **Testing & CI/CD**: Vitest (Unit & Integration Tests 433 ข้อ ครอบคลุม 31 Test Files ใน Monorepo 100% Pass) + GitHub Actions CI Pipeline + Multi-stage Dockerfile
* **Gov Center SSO & Residence API Integration**: ระบบบูรณาการการเข้าสู่ระบบแบบจุดเดียว (Single Sign-On) ร่วมกับ Gov Center / IAM-GOV ผ่านมาตรฐาน OAuth2 / OpenID Connect (Authorization Code flow, Direct ticket exchange, Server-to-Server login), ป้องกัน CSRF ด้วย state parameter, เชื่อมโยงบัญชีและนำเข้าข้อมูลประชากรจาก Residence API (`/api/residences/search`) เข้าสู่ระบบอัตโนมัติ
* **Document Templates & Digital Verification Engine**: ระบบบริหารจัดการเทมเพลตเอกสารราชการอิเล็กทรอนิกส์ (`/admin/document-templates`), เครื่องมือแก้ไขโครงสร้างเทมเพลตแบบ Interactive (`/editor`), จำลองตัวอย่างขนาด A4 เสมือนจริง (`/preview`), จัดการประวัติเวอร์ชันและ Rollback (`/versions`), สร้างเอกสารราชการ (`/admin/documents`), ประทับตรา QR Code ความเร็วสูงและตรวจสอบความถูกต้องแบบแยกสิทธิ์ประชาชนทั่วไป (`/verify/[token]`) และเจ้าหน้าที่ (`/staff/verify`)
* **LINE Webhook & LIFF Integration (Phase 4)**: รองรับการเข้าสู่ระบบอัตโนมัติผ่าน **LINE Front-end Framework (LIFF SDK)**, Direct Routing ถอดรหัส `liff.state`, ป้องกัน Open Redirect และระบบตรวจสอบ Webhook Signature (HMAC-SHA256) ป้องกัน Replay Attack
* **LINE Rich Menu & Flex Message Engine (Phase 5)**: ระบบ Rich Menu อัจฉริยะแบบแยกบทบาท (Citizen, Staff, Admin, Guest) สลับเมนูอัตโนมัติตาม Role ของผู้ใช้งาน พร้อมระบบสร้างภาพกราฟิกด้วย Pure Node.js (2500x1686, RGB PNG, zlib deflate) และหน้าจอแอดมินบริหารจัดการครบวงจร (`/admin/line`)
* **Dynamic Sidebar Navigation & Service Management (`/admin/services`)**: ระบบจัดการบริการและเมนู Sidebar จากฐานข้อมูล (Database-driven) จัดหมวดหมู่บริการ กำหนดสิทธิ์ตามบทบาท จัดเรียงลำดับเมนูด้วย Drag & Drop พร้อมหน้าจอ Interactive Preview และการตรวจสอบสิทธิ์ความปลอดภัยที่ Backend ทุก API
* **Role-Based Access Control & User Role Management (`/admin/permissions`)**: ระบบบริหารจัดการบทบาทผู้ใช้งาน (RBAC) และกำหนดบทบาทผู้ใช้แบบรายบุคคลหรือแบบกลุ่ม (Bulk Role Assignment) สไตล์ Minimal Clean & Responsive เชื่อมโยงการแสดงผลเมนูกับ Sidebar โดยอัตโนมัติ
* **Account Isolation & Privacy Control**: แยกสิทธิ์การดูข้อมูลรายการยืมเด็ดขาด "บัญชีใครบัญชีมัน" (`mine=1`) สำหรับประชาชนในหน้า `/borrow/my`

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
├── DESIGN.md                   # เอกสารมาตรฐานกลางระบบออกแบบ UI/UX (Single Source of Truth)
├── USER_MANUAL.md              # คู่มือการใช้งานระบบสำหรับประชาชนและผู้ใช้งานทั่วไป
├── LICENSE                     # MIT License
├── vitest.config.mts           # กำหนดค่า Unit Testing สำหรับ Monorepo
├── packages/
│   └── shared/                 # @japjong/shared — Types, Labels, RBAC Logic, Business Logic
│       └── src/
│           ├── types.ts          # Shared Models, Account (รวมที่อยู่), PublicAccount, Request Types
│           ├── labels.ts         # ป้ายกำกับภาษาไทยสำหรับบทบาท สถานะ และประเภทคำขอ
│           ├── logic.ts          # RBAC (canAccessRoute), ตรวจจองซ้อน (Conflict Checks), SoD
│           ├── logic.test.ts     # Unit Tests ทดสอบเงื่อนไขทางธุรกิจ
│           └── index.ts
├── apps/
│   ├── api/                    # @japjong/api — NestJS REST API (:4000/api)
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Prisma Data Model (30 ตาราง รวม LINE, Templates, Gov SSO, Thai Administrative Divisions)
│   │   │   ├── migrations/         # SQL Migration Files
│   │   │   ├── migrate-supabase.ts # สคริปต์สร้างและอัปเดตตารางบน Supabase PostgreSQL (Migration 1-9)
│   │   │   └── seed.ts             # Standalone Seed Script (รองรับ argon2id hash)
│   │   └── src/
│   │       ├── auth/             # Login, Register, LINE Login, Gov Center SSO & Residence API, Email OTP, PIN
│   │       ├── line/             # LINE Messaging API Client, Flex Template Service, Webhook Handler, Rich Menu Service
│   │       ├── notifications/    # In-App Notifications, Outbox Queue, Preferences, Business Events, Admin Retry
│   │       ├── resources/        # Venues, Equipment, Monthly Availability, Conflict & Stock Check
│   │       ├── requests/         # Booking, Borrow, Repair, 3-Level Sign, Handover, Reschedule
│   │       ├── documents/        # Document Templates, A4 Versioning, QR Code Verification, Public & Staff Verify API
│   │       ├── users/            # Profile, Address Management, IAM-GOV Residence Search & PDPA Consent
│   │       ├── admin/            # Role Management, Sidebar Services, LINE & Rich Menu Manager, Overview
│   │       ├── storage/          # Document & Attachment Storage Provider
│   │       └── db/               # Prisma Database Service (Persistent DB Sessions & Sequences)
│   └── web/                    # @japjong/web — Next.js 15 (App Router) + Tailwind CSS (:3000)
│       ├── public/               # Static Assets (โลโก้, ไอคอน, ตราครุฑ)
│       └── src/
│           ├── app/              # หน้าจอทั้งหมดตามบทบาท (Responsive Phone/Tablet/Desktop)
│           │   ├── login/        # เข้าสู่ระบบ + Gov Center SSO + LINE Login + โหมดคลิกเดียว (One-Click Demo)
│           │   ├── register/     # ลงทะเบียนผู้ใช้ทั่วไป และ /register/line (ลงทะเบียนครั้งแรกผ่าน LINE + PDPA)
│           │   ├── auth/callback # หน้ารับ Authorization Code / Ticket จาก Gov Center SSO
│           │   ├── liff/         # LINE Front-end Framework (LIFF SSO Login & Dynamic Route Resolver)
│           │   ├── account/      # จัดการบัญชีผู้ใช้งาน (โปรไฟล์, ที่อยู่ตามทะเบียนราษฎร์, ลายเซ็น & PIN)
│           │   ├── notifications/# ศูนย์การแจ้งเตือน (/notifications) และตั้งค่าช่องทางรับแจ้งเตือน (/settings)
│           │   ├── booking/      # ขอใช้สถานที่ราชการ (5 ขั้นตอน รองรับรายวัน/รายชั่วโมง + ล็อกรายการ)
│           │   ├── borrow/       # ขอยืม–คืนอุปกรณ์ราชการ (4 ขั้นตอน + เช็คสต็อกอัตโนมัติ) และ /borrow/my (แยกสิทธิ์บัญชี)
│           │   ├── repair/       # แจ้งซ่อมบำรุงและติดตามสถานะ (Fast-ticket ไม่บังคับลงนาม)
│           │   ├── requests/     # รายละเอียดคำขอ เอกสารราชการ A4 และขอเลื่อนวัน/ยกเลิก
│           │   ├── history/      # ประวัติคำขอและการดำเนินการ (แยกตามบทบาทและฟิลเตอร์ครบชุด)
│           │   ├── staff/        # เจ้าหน้าที่ (ตรวจคำขอ, รับมอบ–รับคืน, กรอกแทน, ตรวจสอบ QR Code /staff/verify)
│           │   ├── verify/       # ตรวจสอบเอกสารดิจิทัลสาธารณะสำหรับประชาชน (/verify/[token])
│           │   ├── approver/     # ปลัด อบต. / นายก อบต. (คิวลงนามอนุมัติด้วย PIN 6 หลัก, ใบอนุญาต PDF)
│           │   └── admin/        # แอดมิน (ภาพรวม, จัดการทรัพยากร, เทมเพลตเอกสาร /document-templates, จัดการบริการ /services, บทบาทผู้ใช้ /permissions, LINE /line)
│           ├── components/       # AppShell, Sidebar (Dynamic Services), UI Primitives, DatePicker, OfficialGovFormDocument
│           └── lib/api.ts        # Client API SDK (SSO, Document Templates, Verification, Roles & Services API)
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
   pnpm --filter @japjong/api exec tsx prisma/migrate-supabase.ts
   pnpm db:seed
   ```

### ทางเลือกที่ 2: ใช้งาน PostgreSQL บน Docker ในเครื่อง
| รายการ | ค่าการเชื่อมต่อ |
| :--- | :--- |
| **Host / Port** | `localhost:5433` |
| **Database / User / Password** | `japjong` / `japjong` / `japjong_dev` |
| **DATABASE_URL** | `postgresql://japjong:japjong_dev@localhost:5433/japjong?schema=public` |

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
pnpm --filter @japjong/api exec tsx prisma/migrate-supabase.ts
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
2. **การจองสถานที่ (5 ขั้นตอน) และการยืมอุปกรณ์ (4 ขั้นตอน) พร้อมระบบคิวและสต็อกอัตโนมัติ:**
   - **การจองสถานที่ (5 ขั้นตอน):** เลือกสถานที่ -> เลือกวัน-เวลา (สลับโหมดรายวัน Full Day หรือรายชั่วโมง Hourly) -> เลือกอุปกรณ์เสริม -> กรอกแบบขอใช้สถานที่ -> ลงนามดิจิทัลและส่งคำขอ
   - **การยืม–คืนอุปกรณ์ (4 ขั้นตอน):** เลือกอุปกรณ์และระบุจำนวน -> กำหนดวันยืมและคืนอุปกรณ์ (คำนวณจำนวนวันและตรวจเช็คสต็อกคงเหลือตามช่วงวันจริง) -> กรอกแบบคำขอใช้อุปกรณ์ -> ลงนามดิจิทัลและส่งคำขอ
   - ในขั้นตอนกรอกคำขอ รายการภายใต้หัวข้อ **"มีความประสงค์ขอใช้สถานที่ราชการ ดังนี้"** และ **"มีความประสงค์ขอใช้อุปกรณ์ราชการ ดังนี้"** จะถูกล็อกตามสถานที่และอุปกรณ์ที่เลือกไว้ในขั้นตอนก่อนหน้า ป้องกันการพิมพ์แก้ไขรายการเองโดยไม่ผ่านการตรวจคิว/สต็อก
3. **เอกสารราชการอิเล็กทรอนิกส์ 4 ฝ่าย (`OfficialGovFormDocument`):**
   - แสดงผลและสั่งพิมพ์ใบอนุญาตขนาด A4 ตามรูปแบบหนังสือราชการ:
     1. **ผู้ขออนุญาตใช้สถานที่/อุปกรณ์ราชการ**
     2. **ความเห็นของเจ้าหน้าที่ผู้ตรวจสอบ** (แสดงตำแหน่งจริงของผู้ลงนาม)
     3. **ความเห็นของปลัดองค์การบริหารส่วนตำบล**
     4. **คำสั่งของนายกองค์การบริหารส่วนตำบล**
4. **ระบบแถบควบคุมตรึงติดหน้าจอ (Sticky Step Header & Pinned Action Bar Footer):**
   - **Sticky Step Header:** แถบหัวข้อตรึงอยู่บนสุดของหน้าจอ (`top-0`) พร้อมเอฟเฟกต์ Glassmorphism / Backdrop Blur ระบุขั้นตอนปัจจุบันและสรุปจำนวนรายการที่เลือกไว้ ไม่เลื่อนหายไปตามการเลื่อนหน้าจอ
   - **Pinned Action Bar Footer:** แถบดำเนินการลอยตรึงติดขอบล่าง (`bottom-0`) แสดงชิปสรุปรายการที่เลือกไว้ (สามารถคลิก `✕` เพื่อยกเลิกรายการได้ทันที) พร้อมปุ่ม "ล้างทั้งหมด" และปุ่ม "ถัดไป" ออกแบบให้ใช้งานสะดวกรวดเร็วทั้งบนคอมพิวเตอร์ (Floating Pill Card) และมือถือ (Docked Bottom Bar)
5. **ระบบตรวจสอบเอกสารราชการด้วย QR Code ความเร็วสูง (Document Verification & High-Speed Scanner):**
   - เอกสารราชการที่ผ่านการอนุมัติแล้วจะได้รับการสร้างรหัสยืนยันดิจิทัล (Verification Token สุ่ม 32-byte) และคำนวณ **SHA-256 Hash** ประจำเอกสาร
   - ฝัง QR Code ลงในเอกสารราชการทางการ (`OfficialGovFormDocument`) ที่มุมล่างขวา เชื่อมโยงตรงไปยัง URL ตรวจสอบสาธารณะ
   - **ประชาชนทั่วไป (`/verify/[token]`):** ตรวจสอบสถานะเอกสารได้ทันทีจากสมาร์ตโฟน โดยไม่เปิดเผยข้อมูลส่วนบุคคล (PII Safe) แสดงเฉพาะสถานะความถูกต้อง วันที่ออกเอกสาร และหน่วยงานผู้ออก (อบต.)
   - **เจ้าหน้าที่ (`/staff/verify`):** สแกนผ่านกล้องมือถือสดความเร็วสูง (ขับเคลื่อนด้วยไลบรารีสแกนเนอร์ระดับ Production Nimiq `qr-scanner` รองรับการเปิด-ปิดไฟฉาย สลับกล้องหน้า-หลัง และโฟกัสเร็ว), อัปโหลดรูปภาพ QR Code หรือค้นหาด้วยเลขที่เอกสาร แสดงข้อมูลระดับลึก เช่น ชื่อผู้ยื่น ลายมือชื่อการอนุมัติ พร้อมบันทึกประวัติการสแกนลงฐานข้อมูลอัตโนมัติ
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
9. **ระบบ LINE Webhook & LIFF Front-end Framework (Phase 4):**
   - **LINE Front-end Framework (LIFF SDK):** รองรับการเปิดใช้งานระบบจับจองบนแอปพลิเคชัน LINE ทั้งบน iOS/Android โดยตรง ผ่านหน้า `/liff`
   - **Seamless Single Sign-On (SSO):** ดึง LINE ID Token ส่งยืนยันกับ Backend เพื่อสร้างเซสชันการใช้งานทันทีโดยผู้ใช้ไม่ต้องกรอกรหัสผ่านซ้ำ
   - **Dynamic LIFF Target Routing:** ระบบถอดรหัสพารามิเตอร์ `liff.state` และ Query Parameter แบบหลายชั้น พร้อมระบบป้องกัน **Open Redirect Vulnerability** ป้องกันการส่งต่อลิงก์ไปยังภายนอก
   - **LINE Webhook Processing:** ตรวจสอบความถูกต้องของ Signature (`X-Line-Signature`) ด้วย HMAC-SHA256 จัดการสถานะการเพิ่มเพื่อน (`follow`) และการบล็อก (`unfollow`) อัตโนมัติ พร้อมระบบป้องกัน Replay Attack ด้วยตาราง `line_webhook_events`
10. **ระบบบริหารจัดการ LINE Rich Menu & Flex Message Engine (Phase 5):**
    - **Multi-Role Rich Menus (4 ประเภท):** ออกแบบเมนูแยกตามบทบาทของผู้ใช้งานอย่างชัดเจน:
      - **CITIZEN (บริการประชาชน):** 6 ช่อง — 1. จองสถานที่ (`/booking`), 2. ยืมอุปกรณ์ (`/borrow`), 3. แจ้งปัญหา (`/repair`), 4. รายการยืมของฉัน (`/borrow/my`), 5. ประวัติคำขอทั้งหมด (`/history`), 6. ติดต่อเจ้าหน้าที่ (ข้อความติดต่อ อบต.)
      - **STAFF (งานเจ้าหน้าที่):** 6 ช่อง — 1. จองสถานที่ (`/booking`), 2. ยืมอุปกรณ์ (`/borrow`), 3. แจ้งปัญหา (`/repair`), 4. เอกสารรอลงนาม (`/staff/review`), 5. ประวัติคำขอทั้งหมด (`/history`), 6. กรอกคำขอแทน Walk-in (`/staff/walk-in`)
      - **ADMIN (จัดการระบบ):** 6 ช่อง — 1. Dashboard สรุปภาพรวม (`/admin`), 2. จัดการผู้ใช้งาน (`/admin/users`), 3. จัดการทรัพยากร (`/admin/resources`), 4. จัดการ Rich Menu (`/admin/line`), 5. บันทึกแจ้งเตือน (`/admin/notifications`), 6. บัญชีผู้ใช้และสิทธิ์ (`/admin/permissions`)
      - **DEFAULT (ผู้ใช้ทั่วไป/แขก):** เมนูสำหรับผู้ที่ยังไม่ได้เชื่อมต่อบัญชี
    - **Dynamic Role Switching:** เมื่อเจ้าหน้าที่หรือผู้ใช้เข้าสู่ระบบ ระบบจะสลับ Rich Menu บน LINE ให้ตรงตามบทบาทของตนเองอัตโนมัติแบบเรียลไทม์
    - **Pure Node.js Canvas & PNG Generator:** สถาปัตยกรรมการสร้างภาพเมนูขนาดมาตรฐาน LINE (2500 x 1686 พิกเซล, RGB PNG, zlib deflate, CRC-32) ด้วย Node.js ในตัว ไม่ต้องติดตั้ง Library ภายนอกหรือ C++ native dependencies
    - **Custom Flex Message Template Overrides:** ผู้ดูแลระบบสามารถปรับแต่ง Headline, สีหัวการ์ด (Header Color), ปุ่ม Action, และ Footer Note ของข้อความ Flex Message แจ้งเตือนได้ผ่านหน้า `/admin/line`
11. **ระบบบริหารจัดการบริการและเมนูแถบข้าง (Dynamic Sidebar Services Manager `/admin/services`):**
    - **Database-Driven Navigation:** รายการบริการและเมนูทั้งหมดถูกจัดเก็บในฐานข้อมูล (`sidebar_services`) ไม่ Hardcode ในหน้าเว็บ ช่วยให้ผู้ดูแลระบบเพิ่ม แก้ไข จัดหมวดหมู่ และเปิด-ปิดบริการได้ทันที
    - **Drag & Drop Reordering:** จัดเรียงลำดับการแสดงผลเมนูบน Sidebar ได้อย่างสะดวกด้วยการลากและวาง (Drag & Drop) หรือปุ่มเลื่อนขึ้น-ลง พร้อมบันทึกแบบเรียลไทม์
    - **Role-Based Visibility:** กำหนดได้ว่าแต่ละบทบาท (`ADMIN`, `STAFF`, `APPROVER_L2`, `APPROVER_L1`, `USER`) จะเห็นบริการใดบ้าง
    - **Interactive Sidebar Preview:** แอดมินสามารถดูตัวอย่างจำลองหน้าตาของแถบ Sidebar เมนูแยกตามแต่ละบทบาทได้ทันทีก่อนการบันทึก
    - **Enterprise Safety Locks & Relations Check:** ป้องกันไม่ให้ปิดการใช้งานหรือลบเมนูระบบหลักของผู้ดูแลระบบ (`ADMIN`) และมีระบบตรวจสอบความสัมพันธ์กับคำขอหรือทรัพยากรที่เกี่ยวข้องก่อนการลบ เพื่อป้องกันข้อมูลเสียหาย
12. **ระบบจัดการบทบาทผู้ใช้งานและการกำหนดสิทธิ์ (Rebuilt Role Management `/admin/permissions`):**
    - **Role Management Tab (จัดการบทบาทในระบบ):**
      - แสดงรายการบทบาททั้งหมด พร้อมตัวนับจำนวนผู้ใช้งานที่ผูกอยู่จริงในแต่ละบทบาท
      - สร้างบทบาทใหม่ในระบบ กำหนดรหัสบทบาท (Role Code), ชื่อบทบาทภาษาไทย, คำอธิบายขอบเขตงาน, โทนสี Badge และสถานะเปิด/ปิด
      - แก้ไขชื่อ คำอธิบาย โทนสี หรือเปิด-ปิดการใช้งานบทบาท
      - ลบบทบาทที่ไม่ได้ใช้งาน พร้อมระบบตรวจสอบความสัมพันธ์ (ป้องกันการลบบทบาทของระบบ และป้องกันการลบบทบาทที่มีผู้ใช้งานผูกอยู่)
      - ป้องกันความปลอดภัย: ห้ามปิดการใช้งานหรือลบบทบาทผู้ดูแลระบบ (`ADMIN`)
    - **User Role Assignment Tab (กำหนดบทบาทผู้ใช้งาน):**
      - ค้นหาผู้ใช้งานสะดวกรวดเร็วตามชื่อ เบอร์โทร หน่วยงาน หรือชื่อบัญชี
      - สลับหรือกำหนดบทบาทให้ผู้ใช้รายบุคคลได้ทันทีผ่าน Inline Dropdown
      - รองรับการกำหนดบทบาทให้ผู้ใช้งานพร้อมกันหลายคน (Bulk Role Assignment) ด้วย Toolbar การเลือกผู้ใช้
      - สลับสถานะเปิดใช้งานหรือระงับบัญชี (Active/Suspended)
      - ป้องกันไม่ให้ผู้ดูแลระบบลดระดับบทบาทหรือระงับบัญชีของตนเอง
    - **Real-Time Sidebar Synchronization:** ระบบเชื่อมต่อแบบ Reactive เมื่อมีการเปลี่ยนบทบาท จะส่ง Event ปลุกให้ Sidebar Navigation โหลดเมนูสิทธิ์ใหม่จากฐานข้อมูลทันทีโดยไม่ต้องโหลดหน้าเว็บใหม่
13. **ระบบติดตามและแจ้งคืนอุปกรณ์ "รายการยืมของฉัน" แยกสิทธิ์เด็ดขาด (Strict Account Isolation `/borrow/my`):**
    - **บัญชีใครบัญชีมัน:** แสดงผลเฉพาะคำขอยืมอุปกรณ์ที่ผูกกับบัญชีผู้ใช้ปัจจุบัน (`requesterId === account.id`) อย่างเคร่งครัด คำขอของผู้อื่นหรือคำขอที่เจ้าหน้าที่กรอกแทนจะไม่แสดงปะปน
    - **3 แท็บการติดตามสถานะ:**
      - *ที่กำลังใช้งาน:* คำขอที่รอรับมอบหรือกำลังใช้งานอยู่ พร้อมวันรับ วันกำหนดคืน และปุ่ม **"แจ้งคืนอุปกรณ์"**
      - *รอตรวจสอบ:* คำขอที่ส่งคืนแล้ว อยู่ระหว่างรอเจ้าหน้าที่ตรวจนับสภาพและเซ็นรับคืน
      - *ประวัติ:* คำขอยืมอุปกรณ์ที่เสร็จสิ้นสมบูรณ์ในอดีต
    - **Split-Pane Layout:** แบ่งหน้าจอออกเป็นฝั่งซ้าย (รายการค้นหาและบัตรคำขอ) และฝั่งขวา (รายละเอียดเต็ม ผลตรวจสภาพ และรูปถ่ายก่อน–หลังใช้งาน)
14. **มาตรฐานเอกสารทางการแบบพิมพ์พร้อมใช้งาน (Print-Ready Official A4 Format):**
    - ออกแบบคอมโพเนนต์ `OfficialGovFormDocument` ให้จัดหน้ากระดาษขนาด A4 แนวตั้งพอดีหน้าอย่างสมบูรณ์แบบ
    - บังคับการแสดงผลชุดสีสว่าง (Light Theme Enforcement) ในโหมดพิมพ์ เพื่อให้เอกสารคมชัดและประหยัดหมึกพิมพ์ แม้หน้าจอจะเปิดใช้งานโหมดมืด (Dark Mode) อยู่ก็ตาม
    - ซ่อน URL วันที่ และ Header ของเว็บเบราว์เซอร์อัตโนมัติขณะสั่งพิมพ์ผ่าน CSS `@media print`
15. **ระบบการเชื่อมต่อ Gov Center SSO & IAM-GOV Residence API:**
    - **Single Sign-On (SSO):** เข้าสู่ระบบสะดวกรวดเร็วผ่านพอร์ทัลกลาง Gov Center รองรับทั้งแบบ Authorization Code Flow (ผ่าน `/auth/callback`), การแลก Ticket ของ LINE Integration และ Server-to-Server Authentication พร้อมป้องกันการโจมตีข้ามไซต์ (CSRF Protection) ด้วย State Token
    - **Thai Administrative Divisions & Residence Lookup:** ดึงข้อมูลที่อยู่และสำมะโนประชากรจากฐานข้อมูลการปกครองส่วนท้องถิ่นและ IAM-GOV Residence API (`/api/residences/search`) เชื่อมโยงบ้านเลขที่ หมู่ที่ ตำบล อำเภอ จังหวัด เข้าสู่โปรไฟล์ผู้ใช้โดยอัตโนมัติ
16. **ระบบบริหารจัดการเทมเพลตเอกสารราชการอิเล็กทรอนิกส์ (Document Templates & Versioning Engine):**
    - **Interactive Template Editor (`/admin/document-templates/[id]/editor`):** เครื่องมือสร้างและแก้ไขแบบฟอร์มเอกสารราชการ จัดการส่วนหัว ตราครุฑ เนื้อหา ช่องลงนาม และข้อความทางกฎหมายแบบ Drag & Configure
    - **A4 Real-Time Preview (`/admin/document-templates/[id]/preview`):** จำลองตัวอย่างเอกสารขนาดมาตรฐาน A4 แบบทันทีตามโครงสร้างและข้อมูลจำลอง พร้อมการควบคุมระยะขอบและฟอนต์ Sarabun ทางการ
    - **Versioning & Safe Rollback (`/admin/document-templates/[id]/versions`):** ทุกครั้งที่มีการเผยแพร่ (Publish) เอกสาร ระบบจะสร้าง Snapshot เวอร์ชันประวัติอย่างถาวร สามารถตรวจสอบความแตกต่างและกดย้อนกลับ (Rollback) ได้อย่างปลอดภัย
    - **Generated Documents Tracking (`/admin/documents`):** ตรวจสอบรายการเอกสารราชการที่ระบบสร้างขึ้นทั้งหมด พร้อมข้อมูล Snapshot ของฟอร์ม ณ ขณะออกเอกสาร
17. **เอกสารระบบการออกแบบกลางและคู่มือระบบ (Centralized Documentation):**
    - **[`DESIGN.md`](./DESIGN.md):** เอกสารมาตรฐานกลางสำหรับกำหนดแนวทางการออกแบบ UI/UX ทั้งโปรเจกต์ (Design Principles, Design Tokens, Typography, Spacing Scale, Component Guidelines, Interaction Patterns, Responsive Guidelines) ทำหน้าที่เป็น Single Source of Truth
    - **[`USER_MANUAL.md`](./USER_MANUAL.md):** คู่มือการใช้งานระบบฉบับสมบูรณ์สำหรับประชาชนและเจ้าหน้าที่ (Flowcharts, วิธีการสมัคร/เข้าสู่ระบบ, การยื่นคำขอทุกประเภท, การสแกน QR Code และการใช้งานผ่าน LINE OA / LIFF)


---

## คุณสมบัติความมั่นคงปลอดภัยและสถาปัตยกรรมองค์กร (Enterprise Security)

1. **Persistent Sessions ในฐานข้อมูล:** เก็บ Session Token ในตาราง `sessions` บน PostgreSQL รองรับการรีสตาร์ทเซิร์ฟเวอร์โดยเซสชันไม่หลุด
2. **Atomic Sequence Generator:** ใช้ตาราง `sequences` ออกเลขที่คำขอ (เช่น `BK-2569-0001`, `BR-2569-0001`, `RP-2569-0001`) แบบ Atomic ป้องกันเลขซ้ำ
3. **Immutable Signature Audit:** บันทึกลายมือชื่อดิจิทัลและประวัติการลงนามแยกตามรอบการอนุมัติ (`round`) อย่างถาวร พร้อม `activity_logs`
4. **การแบ่งแยกหน้าที่ (Separation of Duties - SoD):**
   - ผู้ขอใช้บริการไม่สามารถลงนามอนุมัติคำขอของตนเองได้
   - ปลัด อบต. (`APPROVER_L2`) และ นายก อบต. (`APPROVER_L1`) ต้องเป็นคนละบัญชีในการลงนามคำขอเดียวกัน
   - เจ้าหน้าที่ไม่สามารถตรวจรับมอบ–รับคืนอุปกรณ์ให้คำขอของตนเองได้
5. **การเข้ารหัสด้วย Argon2id:** รหัสผ่านบัญชีและรหัส PIN 6 หลักได้รับการแฮชด้วย `argon2id` ส่วนรหัส Email OTP สำหรับยืนยันการลงนามจัดเก็บเป็นแฮช SHA-256 HMAC พร้อม Salt ลับเฉพาะ
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

    rich_menus ||--o{ rich_menu_actions : "rich_menu_id"

    document_templates ||--o{ document_template_versions : "template_id"
    document_templates ||--o{ generated_documents : "template_id"

    thai_provinces ||--o{ thai_districts : "province_id"
    thai_districts ||--o{ thai_subdistricts : "district_id"

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

    line_webhook_events {
        string id PK
        string webhook_event_id UK
        string event_type
        string line_user_id
        timestamptz event_timestamp
        timestamptz processed_at
        string processing_status
        timestamptz created_at
    }

    rich_menus {
        string id PK
        string name
        string menu_type "DEFAULT, CITIZEN, STAFF, ADMIN"
        string line_rich_menu_id UK
        string chat_bar_text
        int width
        int height
        string status "DRAFT, PUBLISHED, ARCHIVED"
        boolean is_default
        timestamptz published_at
        timestamptz created_at
        timestamptz updated_at
    }

    rich_menu_actions {
        string id PK
        string rich_menu_id FK
        int sort_order
        string label
        json area
        string action_type "URI, MESSAGE, POSTBACK"
        string action_data
        timestamptz created_at
        timestamptz updated_at
    }

    flex_message_templates {
        string id PK
        string name
        string event_type UK
        string template_type "FLEX, TEXT"
        json content
        string status "ACTIVE, DISABLED"
        timestamptz created_at
        timestamptz updated_at
    }

    sidebar_services {
        string id PK
        string label
        string href UK
        string icon
        string category
        int sort_order
        boolean enabled
        boolean is_system
        json roles
        json allowed_user_ids
        json denied_user_ids
        json permissions
        boolean exact
        timestamptz created_at
        timestamptz updated_at
    }

    role_definitions {
        string id PK
        string key UK
        string name
        string description
        string tone
        boolean enabled
        boolean is_system
        timestamptz created_at
        timestamptz updated_at
    }

    document_templates {
        string id PK
        string name
        string description
        string category "venue, equipment, memo, general"
        string status "draft, published, archived"
        int current_version
        json structure
        json settings
        string created_by
        string updated_by
        timestamptz created_at
        timestamptz updated_at
    }

    document_template_versions {
        string id PK
        string template_id FK
        int version
        json structure
        json settings
        string note
        timestamptz published_at
        string published_by
    }

    generated_documents {
        string id PK
        string template_id FK
        string template_version_id
        string request_id
        string document_number
        json snapshot
        string rendered_file
        string status "draft, issued, revoked"
        timestamptz created_at
        timestamptz updated_at
    }

    thai_provinces {
        string id PK
        string name_th
    }

    thai_districts {
        string id PK
        string province_id FK
        string name_th
    }

    thai_subdistricts {
        string id PK
        string district_id FK
        string province_id
        string name_th
        string zip_code
    }
```

---

## สรุปรายการเส้นทาง API หลัก (Core RESTful API Endpoints)

### 1. ระบบจัดการบริการและแถบนำทาง (Sidebar & Services API)
| Method | Path | สิทธิ์การเข้าถึง | คำอธิบาย |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/navigation` | Public / ทุกบทบาท | ดึงรายการเมนู Sidebar ตามสิทธิ์ของผู้ใช้ปัจจุบัน |
| `GET` | `/api/admin/services` | `ADMIN` | ดึงรายการบริการทั้งหมดในระบบ พร้อมสิทธิ์และสถานะ |
| `POST` | `/api/admin/services` | `ADMIN` | สร้างบริการหรือเมนูใหม่ใน Sidebar |
| `PUT` | `/api/admin/services/:id` | `ADMIN` | แก้ไขข้อมูลบริการ (ชื่อ, URL, ไอคอน, หมวดหมู่, สิทธิ์ Role) |
| `PATCH` | `/api/admin/services/:id/toggle` | `ADMIN` | สลับสถานะเปิด/ปิดการแสดงผลบริการ |
| `PATCH` | `/api/admin/services/reorder` | `ADMIN` | บันทึกการจัดเรียงลำดับเมนู (Sort Order) ทั้งหมด |
| `GET` | `/api/admin/services/:id/check-delete` | `ADMIN` | ตรวจสอบความสัมพันธ์ก่อนลบบริการ |
| `DELETE` | `/api/admin/services/:id` | `ADMIN` | ลบบริการที่ไม่ใช้งานออกจากระบบ |
| `GET` | `/api/admin/services/preview` | `ADMIN` | จำลองการแสดงผล Sidebar Navigation แยกตาม Role |

### 2. ระบบจัดการบทบาทผู้ใช้งาน (Role Management API)
| Method | Path | สิทธิ์การเข้าถึง | คำอธิบาย |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/roles` | `manageUsers` | ดึงรายการบทบาททั้งหมด พร้อมจำนวนผู้ใช้ในแต่ละบทบาท |
| `POST` | `/api/admin/roles` | `ADMIN` | สร้างบทบาทใหม่ในระบบ |
| `PUT` | `/api/admin/roles/:id` | `ADMIN` | แก้ไขข้อมูลบทบาท (ชื่อ, คำอธิบาย, โทนสี, สถานะ) |
| `PATCH` | `/api/admin/roles/:id/toggle` | `ADMIN` | สลับสถานะเปิด/ปิดบทบาท (ล็อกความปลอดภัยสำหรับ `ADMIN`) |
| `DELETE` | `/api/admin/roles/:id` | `ADMIN` | ลบบทบาท (ต้องไม่ใช่บทบาทระบบและไม่มีผู้ใช้ผูกอยู่) |
| `POST` | `/api/admin/roles/bulk-assign` | `ADMIN` | กำหนดบทบาทให้ผู้ใช้งานพร้อมกันหลายคน (Bulk Assignment) |

### 3. ระบบยืนยันตัวตนและบัญชีผู้ใช้ (Auth & Account API)
| Method | Path | สิทธิ์การเข้าถึง | คำอธิบาย |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | เข้าสู่ระบบด้วยชื่อผู้ใช้/เบอร์โทรศัพท์ และรหัสผ่าน |
| `POST` | `/api/auth/demo-login` | Public (Demo Mode) | เข้าสู่ระบบ 1-Click สำหรับการทดสอบ |
| `POST` | `/api/auth/logout` | Authenticated | ออกจากระบบและเพิกถอน Token ในฐานข้อมูล |
| `GET` | `/api/auth/me` | Authenticated | ดึงข้อมูลโปรไฟล์ผู้ใช้งานปัจจุบัน |
| `PATCH` | `/api/auth/profile` | Authenticated | ปรับปรุงข้อมูลส่วนตัวและที่อยู่ |
| `POST` | `/api/auth/pin` | Authenticated | ตั้งค่าหรือเปลี่ยนรหัส PIN 6 หลักสำหรับการลงนาม |

### 4. ระบบเชื่อมต่อ Gov Center SSO & Residence API
| Method | Path | สิทธิ์การเข้าถึง | คำอธิบาย |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/sso-callback` | Public | รับ Authorization Code หรือ Ticket จาก Gov Center SSO เพื่อยืนยันตัวตนและสร้างเซสชัน |
| `POST` | `/api/auth/sso-login` | Public | เข้าสู่ระบบด้วยอีเมลและรหัสผ่านของ Gov Center โดยตรง (Server-to-Server) |
| `POST` | `/api/auth/sso-session` | Public | แลก SSO session token จาก Gov Center เป็นเซสชันของระบบจับจอง |
| `GET` | `/api/residences/search` | Public | ค้นหาข้อมูลที่อยู่ ทะเบียนบ้าน และประชากรจาก IAM-GOV Residence API |

### 5. ระบบจัดการเทมเพลตเอกสารราชการ (Document Templates API)
| Method | Path | สิทธิ์การเข้าถึง | คำอธิบาย |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/document-templates` | เจ้าหน้าที่/ผู้บริหาร/แอดมิน | ดึงรายการเทมเพลตเอกสารราชการทั้งหมด (กรองตามหมวดหมู่ สถานะ หรือคำค้น) |
| `GET` | `/api/document-templates/:id` | เจ้าหน้าที่/ผู้บริหาร/แอดมิน | ดึงรายละเอียดโครงสร้างเทมเพลตเอกสารรายฉบับ |
| `POST` | `/api/document-templates` | `ADMIN` | สร้างเทมเพลตเอกสารราชการใหม่ พร้อมกำหนดโครงสร้างฟิลด์และการจัดวาง |
| `PATCH` | `/api/document-templates/:id` | `ADMIN` | แก้ไขข้อมูลและการตั้งค่าของเทมเพลตเอกสาร |
| `DELETE` | `/api/document-templates/:id` | `ADMIN` | ลบเทมเพลตเอกสารที่ไม่ได้ใช้งานออกจากระบบ |
| `POST` | `/api/document-templates/:id/duplicate` | `ADMIN` | ทำสำเนา (Clone) เทมเพลตเอกสารเป็นฉบับร่างใหม่ |
| `POST` | `/api/document-templates/:id/publish` | `ADMIN` | เผยแพร่เทมเพลตพร้อมบันทึก Snapshot ประวัติเวอร์ชัน |
| `POST` | `/api/document-templates/:id/archive` | `ADMIN` | จัดเก็บเทมเพลตเข้าคลังประวัติเมื่อยกเลิกใช้งาน |
| `GET` | `/api/document-templates/:id/versions` | `ADMIN`, `STAFF` | ดึงประวัติการแก้ไขและเวอร์ชันทั้งหมดของเทมเพลต |
| `GET` | `/api/document-templates/:id/versions/:version` | `ADMIN`, `STAFF` | ดึงโครงสร้างเทมเพลตของเวอร์ชันที่ระบุ |
| `POST` | `/api/document-templates/:id/versions/:version/rollback` | `ADMIN` | ย้อนกลับเทมเพลตไปยังเวอร์ชันที่กำหนด (Rollback) |

### 6. ระบบเอกสารราชการและการตรวจสอบดิจิทัล (Documents & Digital Verification API)
| Method | Path | สิทธิ์การเข้าถึง | คำอธิบาย |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/documents` | Authenticated | ดึงรายการเอกสารราชการที่สร้างขึ้นทั้งหมด |
| `POST` | `/api/documents/generate` | Authenticated | สร้างเอกสารราชการฉบับใหม่จากแม่แบบ (Template Engine) |
| `GET` | `/api/documents/:id` | Authenticated | ดึงรายละเอียดข้อมูลเอกสารราชการรายฉบับ |
| `POST` | `/api/documents/:id/verification` | Authenticated | สร้างหรือดึงข้อมูล QR Code ประจำเอกสารและ Verification Token |
| `POST` | `/api/documents/:id/revoke` | `ADMIN` | เพิกถอนความถูกต้องของเอกสารราชการ |
| `GET` | `/api/documents/public-verify/:token` | Public | ตรวจสอบสถานะความถูกต้องของเอกสารสำหรับประชาชน (PII-Safe) |
| `POST` | `/api/documents/verify/scan` | `STAFF`, `ADMIN` | สแกน QR Code สำหรับเจ้าหน้าที่ พร้อมบันทึกประวัติการสแกนลง Audit Log |

### 7. ระบบผู้ใช้งานและสิทธิความยินยอม PDPA (Users & PDPA API)
| Method | Path | สิทธิ์การเข้าถึง | คำอธิบาย |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users/me` | Authenticated | ดึงข้อมูลผู้ใช้งานปัจจุบันพร้อมสิทธิ์การเข้าถึง |
| `PATCH` | `/api/users/me` | Authenticated | อัปเดตข้อมูลส่วนตัว (ชื่อ, เบอร์โทร, ตำแหน่ง, แผนก) |
| `POST` | `/api/users/consent/withdraw` | Authenticated | แจ้งเพิกถอนความยินยอมในการประมวลผลข้อมูลส่วนบุคคลตาม PDPA |

---

## มาตรฐานการทดสอบและการรับประกันคุณภาพ (Quality Assurance)

* **Vitest Suite**: รันแบบคู่ขนานผ่าน `pnpm test` ครอบคลุม **31 Test Files** รวม **433 ข้อทดสอบ (100% Pass)**
* **TypeScript Strictness**: ตรวจสอบ Types ทุกโปรเจกต์ (`@japjong/shared`, `@japjong/api`, `@japjong/web`) ไร้ข้อผิดพลาด
* **Production Build Validation**: Next.js App Router คอมไพล์และสร้าง Static/Dynamic Pages สำเร็จครบทุกเส้นทาง
* **Discipline**: มีการจัดเก็บบันทึกประวัติและโครงสร้างข้อมูลอย่างเป็นระบบ ปลอดภัยตามมาตรฐานสถาปัตยกรรมภาครัฐ

