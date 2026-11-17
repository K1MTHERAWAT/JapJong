# DESIGN.md · มาตรฐานกลางระบบการออกแบบ UI/UX และระบบสี (Design System & Light/Dark Mode Specification)
> **โครงการ:** ระบบจับจอง (JapJong) — ระบบขอใช้สถานที่ราชการ ขอยืม–คืนครุภัณฑ์ และแจ้งซ่อมบำรุง  
> **สถานะ:** แหล่งอ้างอิงหลักของระบบ (Single Source of Truth) — ซิงก์ตรงกับ Source Code จริง 100%  
> **แนวคิดหลัก:** รักษาเอกลักษณ์ชุดสีเดิมของระบบใน **Light Mode** (อ้างอิง Commit `fc1ae84`) และรองรับ **Dark Mode โทน Navy Dark** ที่เรียบหรู เป็นทางการ สบายตา และแยกชั้นขององค์ประกอบอย่างชัดเจนทั่วทั้งระบบ  
> **ไฟล์ควบคุมหลัก:** [`apps/web/src/app/globals.css`](file:///d:/ngan/Biza/BookingV1/apps/web/src/app/globals.css) · [`apps/web/tailwind.config.ts`](file:///d:/ngan/Biza/BookingV1/apps/web/tailwind.config.ts) · [`apps/web/src/components/Sidebar.tsx`](file:///d:/ngan/Biza/BookingV1/apps/web/src/components/Sidebar.tsx) · [`apps/web/src/components/ui/index.ts`](file:///d:/ngan/Biza/BookingV1/apps/web/src/components/ui/index.ts)

---

## สารบัญ (Table of Contents)
1. [Design Principles (หลักการออกแบบ Light Mode & Navy Dark Mode)](#1-design-principles)
2. [Colour System & Tokens (มาตรฐานสีแยก Light Mode และ Dark Mode)](#2-colour-system--tokens)
   - 2.1 [Background & Surface Tokens (พื้นหลังและระดับชั้นของพื้นผิว)](#21-background--surface-tokens)
   - 2.2 [Typography & Icon Tokens (สีตัวอักษรและไอคอน)](#22-typography--icon-tokens)
   - 2.3 [Border & Divider Tokens (สีเส้นขอบและเส้นแบ่งกลุ่ม)](#23-border--divider-tokens)
   - 2.4 [Primary, Active & Selected Tokens (สีหลักและสถานะที่เลือก)](#24-primary-active--selected-tokens)
   - 2.5 [Semantic Status & Disabled Tokens (Success, Warning, Error, Info, Disabled)](#25-semantic-status--disabled-tokens)
   - 2.6 [Chip & Service Type Tokens (สีป้ายสถานะและประเภทบริการ)](#26-chip--service-type-tokens)
3. [Sidebar & Dark Mode Selector Specification (มาตรฐาน Sidebar และตัวเลือกโหมด)](#3-sidebar--dark-mode-selector-specification)
4. [Typography & Font Scale (ระบบตัวอักษรและขนาด)](#4-typography--font-scale)
5. [Spacing, Border Radius & Elevation Shadows (ระยะห่าง ความโค้งมน และเงา)](#5-spacing-border-radius--elevation-shadows)
6. [Component Guidelines (แนวทางการใช้งานคอมโพเนนต์ทั้งสองโหมด)](#6-component-guidelines)
7. [Developer Governance Rules (ข้อกำหนดบังคับสำหรับทุก Module)](#7-developer-governance-rules)

---

## 1. Design Principles

1. **Preserve Original Light Mode Identity (รักษาสีเดิมของระบบใน Light Mode 100%)**
   - ใช้ชุดสีเดิมของโปรเจกต์ตามมาตรฐาน Commit `fc1ae84` (เขียวมรกตราชการ `#1E7D5A` / `#176548` บนพื้นหลังโทนอุ่น `#F8F7F3` / `#F3F2ED` และการ์ด `#FFFFFF`) โดยไม่เปลี่ยนแปลงโทนสีหลักของ Light Mode
2. **Layered Navy Dark Mode (โทนสีน้ำเงินเข้มอมดำแบบมีมิติ)**
   - หลีกเลี่ยงการใช้สีดำสนิท (`#000000`) ทั้งหน้าจอ แต่แบ่งระดับความสว่างของสีน้ำเงินเข้มอมดำ (Navy Dark) ออกเป็น 4 ชั้น:
     - **Background / Sidebar (`#0D0F1A`):** น้ำเงินเข้มอมดำสำหรับพื้นหลังหลักและ Sidebar
     - **Surface / Card (`#151926`):** น้ำเงินเข้มที่สว่างขึ้นเล็กน้อยสำหรับ Card, Modal, Table และ Input
     - **Elevated / Muted Surface (`#1D2436`):** พื้นผิวการ์ดย่อย หัวตาราง และการ์ดตัวเลือกโหมดมืด
     - **Interactive Hover (`#242C42`):** พื้นผิวเมื่อชี้เมาส์ (Hover) บนรายการเมนูหรือปุ่มรอง
3. **Clear Active & Logout Semantics (สถานะ Active และปุ่มออกจากระบบที่ชัดเจน)**
   - รายการที่เลือก (Active / Selected) ใช้สีเขียว (`#1E8A5C` / `#4ADE80`) พร้อมพื้นหลังเขียวเข้มโปร่งสบายตา (`#17322D`)
   - ปุ่มออกจากระบบใน Sidebar ใช้สีชมพูอมแดงซอฟต์ (`#F2A6A6` ใน Dark Mode และ `#7F1D1D` ใน Light Mode) เพื่อให้สังเกตง่ายและสื่อความหมายชัดเจน
4. **Centralized CSS Variables (`globals.css`)**
   - ควบคุมการสลับโหมดด้วยคลาส `.dark` บน `<html>` ผ่าน `ThemeProvider` (`japjong-theme` ใน `localStorage`) โดยไม่ต้องแก้ไข Business Logic หรือเขียนสีแยกในแต่ละหน้าจอซ้ำซ้อน

---

## 2. Colour System & Tokens

### 2.1 Background & Surface Tokens
| บทบาท (Role) | Tailwind Class | CSS Variable | Light Mode (HEX / RGB) | Dark Mode — Navy Dark (HEX / RGB) | การใช้งานมาตรฐาน |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Background (Canvas)** | `bg-bg` | `--color-bg` (`--rgb-bg`) | `#F8F7F3` (`248 247 243`) | `#0D0F1A` (`13 15 26`) | พื้นหลังหลักของหน้าเว็บ (`<body>`) และพื้นหลัง Sidebar ใน Dark Mode |
| **AppShell Ground** | `bg-ground` | `--color-ground` (`--rgb-ground`) | `#F3F2ED` (`243 242 237`) | `#0D0F1A` (`13 15 26`) | พื้นหลังพื้นที่เนื้อหาหลักของ `AppShell` |
| **Surface (Card / Input)** | `bg-surface` / `bg-paper` | `--color-surface` (`--rgb-surface`) | `#FFFFFF` (`255 255 255`) | `#151926` (`21 25 38`) | พื้นหลัง `.jw-card`, `<Card>`, `<Modal>`, `<Input>`, `<Select>`, ตาราง |
| **Surface Muted / Soft** | `bg-surface-muted` / `bg-soft` | `--color-surface-muted` (`--rgb-surface-muted`) | `#F4F4F1` (`244 244 241`) | `#1D2436` (`29 36 54`) | พื้นหลังการ์ดตัวเลือกโหมดมืด, หัวตาราง (`thead`), กรอบข้อมูลย่อย |
| **Interactive Hover** | `bg-hover` | `--color-hover` (`--rgb-hover`) | `#F0F0EC` (`240 240 236`) | `#242C42` (`36 44 66`) | พื้นหลังเมื่อวางเมาส์เหนือเมนู Sidebar, แถวตาราง, หรือปุ่มรอง |

---

### 2.2 Typography & Icon Tokens
| บทบาท (Role) | Tailwind Class | CSS Variable | Light Mode (HEX / RGB) | Dark Mode — Navy Dark (HEX / RGB) | การใช้งานมาตรฐาน |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Text (`ink`)** | `text-ink` | `--color-ink` (`--rgb-ink`) | `#101828` (`16 24 40`) | `#F8FAFC` (`248 250 252`) | หัวเรื่องหลัก, ชื่อการ์ด, ตัวเลขสถิติ KPI, ข้อความสำคัญ |
| **Secondary Text & Icons (`ink-soft`)** | `text-ink-soft` | `--color-ink-soft` (`--rgb-ink-soft`) | `#344054` (`52 64 84`) | `#D8DEE9` (`216 222 233`) | ข้อความและไอคอนเมนูใน Sidebar (สีขาวอมเทาตามภาพอ้างอิง), ป้ายกำกับรอง |
| **Muted Text (`ink-mute`)** | `text-ink-mute` / `text-muted` | `--color-ink-mute` (`--rgb-ink-mute`) | `#667085` (`102 112 133`) | `#94A3B8` (`148 163 184`) | คำอธิบายเสริม (Helper Text), วันที่-เวลา, ตำแหน่ง/สังกัด |
| **Placeholder (`ink-ph`)** | `text-ink-ph` | `--color-ink-ph` (`--rgb-ink-ph`) | `#98A2B3` (`152 162 179`) | `#64748B` (`100 116 139`) | ข้อความตัวอย่างในช่อง Input/Textarea และข้อความสถานะ Disabled |

---

### 2.3 Border & Divider Tokens
| บทบาท (Role) | Tailwind Class | CSS Variable | Light Mode (HEX / RGB) | Dark Mode — Navy Dark (HEX / RGB) | การใช้งานมาตรฐาน |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Default Border (`line`)** | `border-line` / `divide-line` | `--color-line` (`--rgb-line`) | `#E4E4E0` (`228 228 224`) | `#2B334A` (`43 51 74`) | เส้นขอบการ์ด, เส้นแบ่งกลุ่มเมนูใน Sidebar, เส้นแบ่งแถวตาราง |
| **Soft Divider (`line-soft`)** | `border-line-soft` | `--color-line-soft` (`--rgb-line-soft`) | `#EFEFEA` (`239 239 234`) | `#242B3D` (`36 43 61`) | เส้นแบ่งย่อยภายในการ์ด |
| **Input Border (`line-input`)** | `border-line-input` | `--color-line-input` (`--rgb-line-input`) | `#D0D5DD` (`208 213 221`) | `#38435E` (`56 67 94`) | เส้นขอบช่องกรอกข้อมูล (`.jw-in`) และปุ่มรอง (`.jw-btn-sec`) |

---

### 2.4 Primary, Active & Selected Tokens
| บทบาท (Role) | Tailwind Class | CSS Variable | Light Mode (HEX / RGB) | Dark Mode — Navy Dark (HEX / RGB) | การใช้งานมาตรฐาน |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary / Active Border & Check** | `bg-brand` / `border-brand` / `text-brand` | `--color-brand` (`--rgb-brand`) | `#1E7D5A` (`30 125 90`) | `#1E8A5C` (`30 138 92`) | ปุ่มหลัก, เส้นขอบสีเขียวและวงกลมเครื่องหมายถูกสีเขียวของ Dark Mode Selector |
| **Brand Ink / Active Foreground** | `text-brand-ink` / `bg-brand-ink` | `--color-brand-ink` (`--rgb-brand-ink`) | `#176548` (`23 101 72`) | `#4ADE80` (`74 222 128`) | สีข้อความและไอคอนของเมนูที่กำลังเลือก (Active) ใน Dark Mode |
| **Active / Selected Tint** | `bg-brand-tint` / `bg-brand-mint` | `--color-brand-tint` (`--rgb-brand-tint`) | `#E8F2ED` (`232 242 237`) | `#17322D` (`23 50 45`) | พื้นหลังเมนู Sidebar ที่กำลังเลือก (Active Route) และป้ายขั้นตอน |
| **Calendar Range** | `bg-brand-calRange` | `--color-brand-cal-range` | `#D4E9DF` (`212 233 223`) | `#1B4038` (`27 64 56`) | แถบไฮไลต์ช่วงวันที่ที่เลือกในปฏิทิน |

---

### 2.5 Semantic Status & Disabled Tokens
| สถานะ (Semantic Role) | Token Classes | Light Mode (BG / FG / Border) | Dark Mode — Navy Dark (BG / FG / Border) | การใช้งานมาตรฐาน |
| :--- | :--- | :--- | :--- | :--- |
| **Success (`ok`)** | `bg-ok-bg text-ok-fg border-ok-border` | `#DCFCE7` / `#14532D` / `#A8C965` | `#14352A` / `#6EE7B7` / `#1E8A5C` | สถานะอนุมัติแล้ว, สำเร็จ, เชื่อมต่อแล้ว |
| **Warning (`warn`)** | `bg-warn-bg text-warn-fg border-warn-border` | `#FEF3C7` / `#78350F` / `#E8C75C` | `#3B2A12` / `#FCD34D` / `#B45309` | สถานะรอตรวจสอบ, รอลงนาม, คำเตือน |
| **Error / Logout (`danger`)** | `bg-danger-bg text-danger-fg border-danger-border` | `#FEE2E2` / `#7F1D1D` / `#ECA0A0` | `#3B1A22` / `#F2A6A6` / `#991B1B` | ปุ่มออกจากระบบ (`text-danger-fg`), แจ้งเตือนข้อผิดพลาด, ไม่อนุมัติ |
| **Info (`info`)** | `bg-info-bg text-info-fg border-info-border` | `#E0F2FE` / `#0C4A6E` / `#A7C4F2` | `#162C46` / `#7DD3FC` / `#0284C7` | สถานะกำลังดำเนินการ, ข้อมูลแนะนำ |
| **Disabled (`disabled`)** | `bg-disabled-bg text-disabled-fg border-disabled-border` | `#F4F4F1` / `#98A2B3` / `#E4E4E0` | `#1D2436` / `#64748B` / `#2B334A` | ปุ่มหรือช่องกรอกข้อมูลที่ปิดการใช้งาน |

---

### 2.6 Chip & Service Type Tokens
ป้าย `<Chip>`, `<StatusChip>`, และ `<RequestTypeChip>` รักษาสีเดิมใน Light Mode (Commit `fc1ae84`) และปรับเฉดสีพื้นหลัง/ข้อความใน Dark Mode อัตโนมัติผ่าน CSS Variables `--rgb-tone-*`:

| Tone | Light Mode (BG / FG) | Dark Mode — Navy Dark (BG / FG) | การใช้งาน |
| :--- | :--- | :--- | :--- |
| `amber` | `#FFF4CC` / `#765500` | `#3B2A12` / `#FCD34D` | รอตรวจรับ / บทบาทผู้บริหาร (`APPROVER_L1`, `APPROVER_L2`) |
| `green` | `#ECF5D8` / `#405D0A` | `#14352A` / `#6EE7B7` | อนุมัติแล้ว / บทบาทผู้ดูแลระบบ (`ADMIN`) |
| `blue` | `#E8F1FF` / `#2454A6` | `#162C46` / `#93C5FD` | รอตรวจสอบ / บทบาทเจ้าหน้าที่ (`STAFF`) |
| `red` | `#FDE7E7` / `#A32121` | `#3B1A22` / `#FCA5A5` | ไม่อนุมัติ / เอกสารไม่ถูกต้อง |
| `gray` | `#EEF0F3` / `#4B5563` | `#242C42` / `#CBD5E1` | ยกเลิกแล้ว / บทบาทผู้ใช้งานทั่วไป (`USER`) |
| `orange` | `#FFF0E3` / `#963F08` | `#3E2212` / `#FDBA74` | รอนายก อบต. ลงนาม |
| `purple` | `#EBDDFB` / `#5B21B6` | `#2E1D4A` / `#D8B4FE` | รอปลัด อบต. ลงนาม |
| `teal` | `#E5F4EF` / `#176548` | `#133432` / `#5EEAD4` | กำลังดำเนินการซ่อม |
| `pink` | `#FCE7F1` / `#972454` | `#3D1930` / `#F9A8D4` | กำลังใช้งานอุปกรณ์ |
| `typeBorrow` | `#DDF5F2` / `#11645C` | `#133432` / `#5EEAD4` | ประเภทคำขอ: ยืม–คืนอุปกรณ์ |
| `typeBooking`| `#EEE7FF` / `#5B3AA7` | `#2E1D4A` / `#D8B4FE` | ประเภทคำขอ: ขอใช้สถานที่ |
| `typeRepair` | `#F4EBDD` / `#79552A` | `#3B2A12` / `#FCD34D` | ประเภทคำขอ: แจ้งซ่อม |

---

## 3. Sidebar & Dark Mode Selector Specification

### 3.1 โครงสร้างและสีของ Sidebar (`apps/web/src/components/Sidebar.tsx`)
- **พื้นหลัง Sidebar:**
  - Light Mode: `bg-[#FBFCFA]` ขอบ `border-line-soft`
  - Dark Mode: `dark:bg-bg` (`#0D0F1A`) ขอบ `dark:lg:border-line` (`#2B334A`)
- **รายการเมนูและไอคอน:**
  - สถานะปกติ: ใช้ `text-ink-soft` (`#D8DEE9` สีขาวอมเทาใน Dark Mode) เมื่อชี้เมาส์ใช้ `hover:bg-hover hover:text-ink`
  - สถานะที่เลือก (`aria-[current=page]`): ใช้พื้นหลัง `bg-brand-tint` (`#17322D`) ข้อความและไอคอน `text-brand-ink` (`#4ADE80`) พร้อมกรอบเรืองแสงบาง `dark:aria-[current=page]:ring-1 dark:aria-[current=page]:ring-brand/40`
- **เส้นแบ่งกลุ่มเมนู (Divider):**
  - แบ่งกลุ่มหมวดหมู่เมนูด้วย `border-t border-[#CDD5E0] dark:border-line` (`#2B334A`)
- **ปุ่มออกจากระบบ (Logout Button):**
  - แสดงที่ส่วนท้ายของ Sidebar ด้วยไอคอน `LogOut` และข้อความ `"ออกจากระบบ"` ใช้สี `text-danger-fg` (`#F2A6A6` สีชมพูอมแดงซอฟต์ใน Dark Mode ตามภาพตัวอย่าง) และ `hover:bg-danger-bg/60`

### 3.2 ตัวเลือกโหมดสี (Dark Mode Selector Card)
แสดงผลในหน้า `จัดการบัญชีส่วนตัว (/account)`:
- **Card พื้นหลังสีเข้ม:** ใช้ `bg-surface` / `bg-surface-muted` ขนาดกะทัดรัด (`116px`) ความโค้งมน `rounded-xl`
- **ไอคอนสัญลักษณ์:** ใช้ไอคอนพระจันทร์ (`<Moon />`) สีขาวคมชัดเมื่ออยู่ในโหมดมืด และไอคอนพระอาทิตย์ (`<Sun />`) สำหรับโหมดสว่าง
- **ป้ายชื่อโหมด:** แสดงข้อความ `"มืด"` (และ `"สว่าง"`) ด้วยฟอนต์หนา (`font-bold text-ink`)
- **สถานะกำลังเลือก (Active Indicator):**
  - เส้นขอบการ์ดสีเขียว: `border-2 border-brand` (`#1E8A5C`)
  - วงกลมเครื่องหมายถูกสีเขียวด้านล่าง: `bg-brand text-white rounded-full` พร้อมไอคอน `<Check />` สีขาวตรงกลาง

---

## 4. Typography & Font Scale

- **ฟอนต์หลักของระบบ:** `'Noto Sans Thai', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
- **ฟอนต์สำหรับเอกสารราชการพิมพ์ (`.gov-form-paper`):** `'TH Sarabun New', 'Noto Sans Thai', sans-serif` (กระดาษเอกสารราชการ `.gov-form-paper` คงพื้นขาวตัวอักษรดำเสมอแม้เปิดโหมดมืด เพื่อความถูกต้องในการพิมพ์เอกสารราชการ)

| Token | ขนาด | Line Height | น้ำหนัก | การใช้งาน |
| :--- | :--- | :--- | :--- | :--- |
| `text-display` | `26px` | `1.3` | `700` (Bold) | หัวข้อเด่นประจำหน้าหลัก |
| `text-title` | `22px` | `1.3` | `700` (Bold) | หัวเรื่องหน้าจอ |
| `text-heading` | `16px` | `1.4` | `600` (Semibold)| หัวข้อการ์ด, ชื่อโมดอล |
| `text-body` | `14px` | `1.5` | `400` / `600` | เนื้อหาฟอร์ม, ค่าในตาราง, ข้อความปุ่มกด |
| `text-caption` | `12px` | `1.4` | `500` / `600` | ป้ายกำกับ, ชิปสถานะ, ข้อความช่วยเหลือ |

---

## 5. Spacing, Border Radius & Elevation Shadows

- **Border Radius:** `rounded-control` (`14px`), `rounded-card` (`20px`), `rounded-float` (`22px`), `rounded-full` (`9999px`)
- **Shadows:**
  - Light Mode: `0 3px 12px rgba(16, 24, 40, .045)`
  - Dark Mode (`.dark .jw-card`): `0 4px 16px rgba(0, 0, 0, .28)` เพื่อช่วยแยกชั้นของการ์ด `#151926` ออกจากพื้นหลัง `#0D0F1A`

---

## 6. Component Guidelines

1. **Buttons (`@/components/ui/Button` / `.jw-btn*`):**
   - Primary: `bg-brand text-white hover:bg-brand-ink`
   - Secondary: `bg-surface text-ink border-line-input hover:bg-hover` (ปรับพื้นหลังเป็น `#151926` และขอบ `#38435E` อัตโนมัติใน Dark Mode)
   - Danger / Destructive: `bg-danger-solid text-white`
2. **Inputs, Textareas & Selects (`@/components/ui/Input` / `.jw-in`):**
   - พื้นหลัง `bg-surface` (`#151926`), เส้นขอบ `border-line-input` (`#38435E`), ข้อความ `text-ink` (`#F8FAFC`), Placeholder `placeholder:text-ink-ph` (`#64748B`), และวงแหวน Focus สีเขียว `focus:border-brand focus:ring-2 focus:ring-brand/25`
   - **มาตรฐานการจำกัดความยาวการกรอกชื่อ (Name Input Length Standard — [`packages/shared/src/name-limits.ts`](file:///d:/ngan/Biza/BookingV1/packages/shared/src/name-limits.ts)):**
     - กำหนดความยาวสูงสุด (`NAME_MAX_LENGTH`) จากจุดศูนย์กลางและบังคับใช้ร่วมกันทั้งฝั่ง Frontend (`maxLength` + `clampNameInput`) และ Backend (`@MaxLength` DTO + Controller Slicing):
       | ประเภทข้อมูลชื่อ (Field Key) | ความยาวสูงสุด (`maxLength`) | ตัวอย่างการใช้งานในระบบ |
       | :--- | :---: | :--- |
       | `PERSON_NAME` (ชื่อ-นามสกุล) | `40` | ชื่อผู้ใช้, ผู้ยื่นคำขอ, ผู้แจ้งซ่อม |
       | `NICKNAME` (ชื่อเล่น / ชื่อเรียก) | `20` | ชื่อเล่นในหน้าจัดการบัญชี |
       | `USERNAME` (ชื่อบัญชีผู้ใช้) | `30` | `@username` สำหรับเข้าสู่ระบบ |
       | `POSITION` (ชื่อตำแหน่ง) | `40` | ตำแหน่งในแบบคำขอ / โปรไฟล์ |
       | `ORGANIZATION` (ชื่อหน่วยงาน / สังกัด) | `60` | หน่วยงาน, ชุมชน, กอง/สำนัก |
       | `VENUE_NAME` (ชื่อสถานที่ราชการ) | `50` | ห้องประชุม, ศาลาประชาคม, สนามกีฬา |
       | `EQUIPMENT_NAME` (ชื่ออุปกรณ์ / ครุภัณฑ์) | `60` | ชุดเครื่องเสียง, เต็นท์, โปรเจกเตอร์ |
       | `BUILDING_NAME` (ชื่ออาคาร) | `40` | อาคารสำนักงาน, ศูนย์กีฬาชุมชน |
       | `FLOOR_NAME` (ชื่อชั้น / โซน) | `20` | ชั้น 1, ชั้น 2, กลางแจ้ง |
       | `LOCATION_NAME` (จุดเกิดเหตุ / ห้องที่แจ้งซ่อม) | `60` | ห้องประชุมใหญ่ · เครื่องปรับอากาศ |
       | `WRITTEN_AT` (สถานที่เขียนคำขอ) | `50` | ที่ทำการองค์การบริหารส่วนตำบล |
       | `ACTIVITY_NAME` (ชื่องาน / กิจกรรม) | `80` | ชื่อโครงการหรือกิจกรรมที่ขอใช้สถานที่ |
       | `SERVICE_NAME` (ชื่อบริการ / เมนู Sidebar) | `40` | ชื่อเมนูบริการในหน้าแอดมิน |
       | `CATEGORY_NAME` (ชื่อหมวดหมู่) | `30` | หมวดหมู่บริการ, หมวดหมู่งานซ่อม |
       | `ROLE_NAME` (ชื่อบทบาทผู้ใช้งาน) | `40` | ชื่อบทบาทในระบบจัดการสิทธิ์ |
       | `TEMPLATE_NAME` (ชื่อแม่แบบเอกสาร / แบบฟอร์ม) | `60` | ชื่อแม่แบบเอกสารราชการและหัวเรื่องฟอร์ม |
       | `SLOT_LABEL` (ชื่อช่องดึงข้อมูล) | `30` | ป้ายกำกับ Data Slot ในตัวแก้ไขเอกสาร |
       | `RICH_MENU_NAME` (ชื่อ Rich Menu / หัวข้อ Flex) | `50` | ชื่อ LINE Rich Menu และหัวข้อ Flex Message |
       | `RICH_MENU_BAR_TEXT` (ข้อความแถบแชท LINE) | `14` | ข้อความแถบเมนูแชทตามเกณฑ์ LINE API |
       | `RICH_MENU_ACTION_LABEL` (ชื่อปุ่มเมนู LINE) | `20` | ป้ายกำกับปุ่มกดใน Rich Menu และ Flex Card |
     - **ตัวนับจำนวนตัวอักษร (`<NameLengthBadge />`):** แสดงตัวนับแบบเรียลไทม์มุมขวาบนของช่องกรอก เช่น `25/40` ด้วยฟอนต์ `font-mono tabular-nums`
     - **การป้องกันและแจ้งเตือนเมื่อครบขีดจำกัด (`<NameLimitWarning />`):** เมื่อกรอกครบจำนวนสูงสุด ระบบจะบล็อกการพิมพ์/วางข้อความเกินขนาด เปลี่ยนสีขอบและตัวนับเป็นโทนแจ้งเตือน (`text-warn-fg`, `border-warn-fg`) และแสดงข้อความ `"ถึงขีดจำกัดความยาวสูงสุดแล้ว (40/40 ตัวอักษร)"`
3. **Tables (`.jw-table` & Native Tables):**
   - หัวตารางใช้ `bg-surface-muted/70` (`#1D2436`) เส้นคั่นแถวใช้ `divide-line` (`#2B334A`) และเมื่อชี้เมาส์ใช้ `hover:bg-hover`
4. **Modals & Popovers:**
   - พื้นหลังการ์ดโมดอลใช้ `bg-surface` (`#151926`) ขอบ `border-line` (`#2B334A`) พร้อมฉากหลังเบลอ `bg-ink/50 backdrop-blur-[2px]`

---

## 7. Developer Governance Rules

1. **ห้ามเปลี่ยนสีหลักของ Light Mode:** ค่าสีใน `:root` ของ `globals.css` ต้องคงตามมาตรฐานเดิมของโปรเจกต์
2. **ใช้ Semantic Tokens เสมอ:** ใช้ `bg-bg`, `bg-surface`, `bg-surface-muted`, `bg-hover`, `text-ink`, `text-ink-soft`, `text-ink-mute`, `border-line`, `border-line-input` เพื่อให้ทุกหน้าจอสลับระหว่าง Light Mode และ Navy Dark Mode ได้ทันที
3. **เอกสารราชการต้องเป็นกระดาษขาวเสมอ:** พื้นที่ภายใต้ `.gov-form-paper`, `#official-doc-print-area`, และ `#a4-editor-page` ต้องคงสีพื้นขาว `#FFFFFF` และตัวอักษรสีดำ `#000000` เสมอในทุกโหมด
