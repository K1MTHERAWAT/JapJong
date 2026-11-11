# DESIGN.md · มาตรฐานกลางระบบการออกแบบ UI/UX (Design System Specification)
> **โครงการ:** ระบบจับจอง (JapJong) — ระบบขอใช้สถานที่ราชการ ขอยืม–คืนครุภัณฑ์ และแจ้งซ่อมบำรุง  
> **สถานะ:** แหล่งอ้างอิงหลัก (Single Source of Truth)  
> **กลุ่มเป้าหมาย:** AI Developer, Frontend Engineer, UI/UX Designer  

---

## สารบัญ (Table of Contents)
1. [Design Principles (หลักการออกแบบหลัก)](#1-design-principles)
2. [Design Tokens (รหัสและโทเค็นมาตรฐาน)](#2-design-tokens)
   - 2.1 [Color Palette (ชุดสี)](#21-color-palette)
   - 2.2 [Typography (ตัวอักษรและขนาด)](#22-typography)
   - 2.3 [Spacing Scale (ระยะห่าง)](#23-spacing-scale)
   - 2.4 [Border Radius (ความโค้งมน)](#24-border-radius)
   - 2.5 [Borders & Elevation Shadows (เส้นขอบและเงา)](#25-borders--elevation-shadows)
   - 2.6 [Iconography & Sizes (ไอคอนและขนาด)](#26-iconography--sizes)
3. [Layout Guidelines (โครงสร้างและผังหน้าจอ)](#3-layout-guidelines)
   - 3.1 [Main Layout Architecture (AppShell)](#31-main-layout-architecture-appshell)
   - 3.2 [Sidebar & Navigation](#32-sidebar--navigation)
   - 3.3 [Header & Sticky Top Bar](#33-header--sticky-top-bar)
   - 3.4 [Docked & Floating Sticky Footer](#34-docked--floating-sticky-footer)
   - 3.5 [Content Containers & Breakpoints](#35-content-containers--breakpoints)
4. [Component Guidelines (มาตรฐานคอมโพเนนต์กลาง)](#4-component-guidelines)
   - 4.1 [Buttons (ปุ่มกด)](#41-buttons)
   - 4.2 [Form Controls: Input & Textarea](#42-form-controls-input--textarea)
   - 4.3 [Select, Dropdowns & Address Hierarchies](#43-select-dropdowns--address-hierarchies)
   - 4.4 [Toggle Switch & Checkboxes](#44-toggle-switch--checkboxes)
   - 4.5 [Date Picker & Time Wheel Picker](#45-date-picker--time-wheel-picker)
   - 4.6 [Cards (การ์ดบรรจุเนื้อหา)](#46-cards)
   - 4.7 [Tables (ตารางข้อมูลเดสก์ท็อปและมือถือ)](#47-tables)
   - 4.8 [Badges & Status Chips](#48-badges--status-chips)
   - 4.9 [Modal Dialogs & Backdrops](#49-modal-dialogs--backdrops)
   - 4.10 [Tabs & Segmented Controls](#410-tabs--segmented-controls)
   - 4.11 [Stepper & Progress Tracking](#411-stepper--progress-tracking)
   - 4.12 [Feedback, Alerts, Skeleton & Empty State](#412-feedback-alerts-skeleton--empty-state)
   - 4.13 [Official Gov Form Document Paper](#413-official-gov-form-document-paper)
5. [Interaction Patterns (พฤติกรรมการโต้ตอบ)](#5-interaction-patterns)
6. [Page Design Patterns (รูปแบบหน้าจอมาตรฐาน)](#6-page-design-patterns)
7. [Responsive Guidelines (แนวทางการปรับขนาดหน้าจอ)](#7-responsive-guidelines)
8. [Developer Rules & Discrepancy Log (ข้อกำหนดและบันทึกข้อเสนอแนะ)](#8-developer-rules--discrepancy-log)

---

## 1. Design Principles

ระบบ **จับจอง (JapJong)** ถูกพัฒนาขึ้นเพื่อใช้ในหน่วยงานราชการส่วนท้องถิ่น (องค์การบริหารส่วนตำบล / เทศบาล) โดยมีหลักการออกแบบสำคัญ 4 ประการ:

1. **Minimal Clean (โปร่ง สะอาด เรียบง่าย สบายตา)**
   - ลดทอนกราฟิกและสิ่งรบกวนสายตาที่ไม่จำเป็น เน้นความชัดเจนของข้อมูล
   - ใช้โทนสีธรรมชาติ (Sage / Forest Green & Warm Neutral Cream) เพื่อสะท้อนความเป็นมิตรของหน่วยงานรัฐและสร้างความสบายตาเมื่อใช้งานต่อเนื่องหลายชั่วโมง
2. **Consistency & Reusability (สม่ำเสมอและใช้ซ้ำได้ 100%)**
   - ทุกหน้าจอต้องประกอบขึ้นจาก Design Tokens และ Components ชุดเดียวกัน ห้ามสร้างสไตล์หรือ Class แปลกแยก
   - การเว้นวรรค (Spacing), ความโค้งมน (Radius), และระดับเงา (Shadow) ต้องมีจังหวะที่ลงตัวและสม่ำเสมอทั้งระบบ
3. **Accessibility & Usability (a11y & การใช้งานง่าย)**
   - ตัวอักษรและคอนทราสต์ของสีทุกจุดผ่านเกณฑ์ WCAG AA ทั้งใน **Light Mode** และ **Dark Mode**
   - รองรับการใช้งานผ่านคีย์บอร์ดอย่างสมบูรณ์ (`focus-visible:outline-brand`)
   - รองรับ Safe Area Inset สำหรับอุปกรณ์พกพาที่มีรอยบากหน้าจอ (iPhone Notch / Dynamic Island / Android Navigation Bar)
4. **Desktop-first Responsive Design**
   - ออกแบบโดยยึดการทำงานบนคอมพิวเตอร์และแล็ปท็อปของเจ้าหน้าที่เป็นแกนหลัก (ความหนาแน่นของข้อมูลสูง มองเห็นภาพรวมได้ชัดเจน)
   - ยืดหยุ่นและแสดงผลสมบูรณ์แบบบน Tablet และ Mobile (ปรับเปลี่ยนการแสดงผลจากตารางเป็นการ์ดลิสต์ และเปลี่ยนแถบเมนูข้างเป็น Drawer อัตโนมัติ)

---

## 2. Design Tokens

### 2.1 Color Palette

ระบบใช้ CSS Variables ในรูปแบบ RGB triplets (`--rgb-*`) เพื่อให้ Tailwind CSS สามารถควบคุมค่าความโปร่งใส (Alpha Opacity) ได้อย่างยืดหยุ่น

#### A. Brand Colors (เขียวองค์กรราชการ / Emerald & Sage)
| Token Name | CSS Variable | Light Theme (HEX / RGB) | Dark Theme (HEX / RGB) | คำอธิบายการใช้งาน |
| :--- | :--- | :--- | :--- | :--- |
| `brand` | `--color-brand` | `#1E7D5A` <br> `248 247 243` | `#10B981` <br> `16 185 129` | สีหลักของปุ่ม Primary, เส้นแบ่ง Active, ลิงก์สำคัญ |
| `brand-ink` | `--color-brand-ink` | `#176548` <br> `23 101 72` | `#6EE7B7` <br> `110 231 183` | ข้อความเน้นบนพื้น Brand Mint/Tint, ปุ่ม Hover |
| `brand-tint` | `--color-brand-tint` | `#E8F2ED` <br> `232 242 237` | `#14352B` <br> `20 53 43` | พื้นหลังไฮไลต์แถวที่เลือก, เมนู Active, Badge พื้นเขียวอ่อน |
| `brand-mint` | `--color-brand-mint` | `#E8F2ED` <br> `232 242 237` | `#14352B` <br> `20 53 43` | พื้นชิปบอกขั้นตอน, Badge แสดงจำนวนที่เลือก |
| `brand-cal-range`| `--color-brand-cal-range`| `#D4E9DF` <br> `212 233 223` | `#1B4739` <br> `27 71 57` | แถบสีช่วงวันที่ที่เลือกในปฏิทินจองต่อเนื่อง |
| `brand-surface` | `--color-brand-surface` | `#FAF9F2` <br> `250 249 242` | `#14221D` <br> `20 34 29` | พื้นหลังการ์ดพิเศษที่ต้องการบรรยากาศโทนอุ่น |

#### B. Neutral, Background & Surface (พื้นหลังและพื้นผิว)
| Token Name | CSS Variable | Light Theme | Dark Theme | คำอธิบายการใช้งาน |
| :--- | :--- | :--- | :--- | :--- |
| `bg` | `--color-bg` | `#F8F7F3` | `#0F1614` | สีพื้นหลังสุดของเอกสาร (Page Canvas) |
| `ground` | `--color-ground` | `#F3F2ED` | `#131C19` | สีพื้นแผ่นล่างก่อนถึงการ์ด (AppShell Background) |
| `surface` | `--color-surface` | `#FFFFFF` | `#182420` | พื้นหลังการ์ด (`jw-card`), โมดอล, กล่องป้อนข้อมูล |
| `surface-muted` / `soft`| `--color-surface-muted`| `#F4F4F1` | `#1F2D28` | พื้นหลังแถบตัวกรอง, หัวตาราง (`thead`), Disabled |
| `hover` | `--color-hover` | `#F0F0EC` | `#263832` | สีพื้นเมื่อเอาเมาส์ชี้ (Hover State บนแถวและปุ่มรอง) |

#### C. Borders & Lines (เส้นขอบและเส้นแบ่ง)
| Token Name | CSS Variable | Light Theme | Dark Theme | คำอธิบายการใช้งาน |
| :--- | :--- | :--- | :--- | :--- |
| `line` | `--color-line` | `#E4E4E0` | `#2B3E37` | เส้นขอบการ์ด, เส้นแบ่งตาราง (`divide-line`), ขอบบน Footer |
| `line-soft` | `--color-line-soft` | `#EFEFEA` | `#23342E` | เส้นแบ่งย่อยภายในโมดอลหรือกลุ่มเมนูใน Sidebar |
| `line-input` | `--color-line-input` | `#D0D5DD` | `#384E46` | เส้นขอบกล่องข้อความ Input, DatePicker, Select ปกติ |

#### D. Typography & Text (สีตัวอักษร)
| Token Name | CSS Variable | Light Theme | Dark Theme | คำอธิบายการใช้งาน |
| :--- | :--- | :--- | :--- | :--- |
| `ink` | `--color-ink` | `#101828` | `#F0FDF7` | หัวเรื่องหลัก, ตัวเลขสำคัญ, ข้อความเนื้อหาหลัก (High Contrast) |
| `ink-soft` | `--color-ink-soft` | `#344054` | `#C8DED5` | ข้อความเนื้อหารอง, ป้ายกำกับฟิลด์ (Labels) |
| `ink-mute` / `muted` | `--color-ink-mute` | `#667085` | `#8BA89D` | คำอธิบายเสริม (Helper Text), ตัวช่วยกำกับ, วันที่กำกับ |
| `ink-ph` | `--color-ink-ph` | `#98A2B3` | `#597368` | ข้อความแนะนำในกล่องข้อความ (Placeholder Text) |

#### E. Semantic Status & Tones (สีแสดงสถานะการทำงาน)
| Semantic Role | Token Class | Background HEX | Foreground HEX | นิยามการใช้งานในระบบ |
| :--- | :--- | :--- | :--- | :--- |
| **Success (Ok)** | `bg-ok-bg text-ok-fg` | `#DCFCE7` | `#14532D` | คำขออนุมัติแล้ว, ซ่อมบำรุงเสร็จสิ้น, ตรวจรับผ่าน, คืนเรียบร้อย |
| **Warning (Warn)** | `bg-warn-bg text-warn-fg` | `#FEF3C7` | `#78350F` | รอเจ้าหน้าที่ตรวจ, รอตรวจรับคืน, คำขอยังไม่สมบูรณ์ |
| **Danger / Error** | `bg-danger-bg text-danger-fg` | `#FEE2E2` | `#7F1D1D` | ไม่อนุมัติ, ยกเลิกคำขอ, ฟิลด์บังคับที่กรอกผิด, แจ้งเตือนข้อผิดพลาด |
| **Info** | `bg-info-bg text-info-fg` | `#E0F2FE` | `#0C4A6E` | กำลังใช้งานอุปกรณ์, กำลังดำเนินการซ่อม, ประกาศข่าวสาร |

#### F. Extended Status Tones (สำหรับการระบุสถานะคำขอใน Chip)
- `blue`: `bg-[#E8F1FF] text-[#2454A6]` (รอตรวจสอบด่านแรก / เจ้าหน้าที่)
- `purple`: `bg-[#EBDDFB] text-[#5B21B6]` (รอปลัด อบต. กลั่นกรอง)
- `orange`: `bg-[#FFF0E3] text-[#963F08]` (รอนายก อบต. ลงนามขั้นสุดท้าย)
- `pink`: `bg-[#FCE7F1] text-[#972454]` (กำลังใช้งานอุปกรณ์ / เบิกยืมอยู่)
- `teal`: `bg-[#E5F4EF] text-[#176548]` (ช่างกำลังดำเนินการซ่อมบำรุง)
- `gray`: `bg-[#EEF0F3] text-[#4B5563]` (คำขอยกเลิกแล้ว / ประวัติคำขอเก่า)

---

### 2.2 Typography

* **ฟอนต์หลักของระบบ (Primary Interface Font):**  
  `'Noto Sans Thai', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
* **ฟอนต์สำหรับเอกสารราชการพิมพ์ (Official Paper Form):**  
  `'TH Sarabun New', 'Noto Sans Thai', sans-serif`

#### ขนาดตัวอักษรและ Line Height มาตรฐาน
| Token | ขนาด (Pixel / Rem) | Line Height | น้ำหนัก (Font Weight) | การใช้งาน |
| :--- | :--- | :--- | :--- | :--- |
| `text-display` | `26px` (1.625rem) | `1.3` | Bold (700) | หัวข้อเด่นประจำหน้าหลัก (Dashboard Banner) |
| `text-title` | `22px` (1.375rem) | `1.3` | Bold (700) | หัวเรื่องหน้าจอ, หัวข้อเอกสารคำขอราชการ |
| `text-heading` | `16px` (1.000rem) | `1.4` | Semibold (600) | หัวข้อการ์ด, ชื่อโมดอล, ชื่อสถานที่/ครุภัณฑ์ |
| `text-body` | `14px` (0.875rem) | `1.5` | Regular (400) / Semibold (600) | เนื้อหาฟอร์ม, ค่าในตาราง, ข้อความปุ่มกด |
| `text-caption` | `12px` (0.750rem) | `1.4` | Medium (500) / Semibold (600) | ป้ายกำกับฟิลด์ (Labels), ข้อความ Helper, ชิปสถานะ |
| `text-micro` | `11px` (0.6875rem) | `1.3` | Bold (700) | ป้ายบอกหมายเลขขั้นตอน (Step Badge), ตัวเลขแจ้งเตือน |

---

### 2.3 Spacing Scale

ระบบอิงมาตราวัด 4px Grid System ตามมาตรฐานของ Tailwind:
- `p-1` (4px) / `p-1.5` (6px) / `p-2` (8px) / `p-2.5` (10px) / `p-3` (12px)
- `p-3.5` (14px) / `p-4` (16px) — ระยะ Padding มาตรฐานภายในการ์ดขนาดกะทัดรัด
- `p-5` (20px) / `p-6` (24px) — ระยะ Padding มาตรฐานภายในการ์ดเดสก์ท็อปและโมดอล
- `gap-2` (8px) — ระยะห่างระหว่างปุ่มในกลุ่มการทำงาน (Button Group)
- `gap-4` (16px) — ระยะห่างระหว่างฟิลด์ในฟอร์ม หรือคอลัมน์ในการ์ด
- `gap-6` (24px) — ระยะห่างระหว่าง Section ใหญ่ในแนวตั้ง

---

### 2.4 Border Radius

| Token Name | Class | ขนาด (Pixel) | ชิ้นส่วนที่นำไปใช้งาน |
| :--- | :--- | :--- | :--- |
| `rounded-sm` | `rounded-sm` | `6px` | ป้ายชื่อขนาดจิ๋ว, ปุ่มย่อยขนาดเล็กมาก |
| `rounded-md` | `rounded-md` | `8px` | ชิ้นส่วน Tabs ย่อยภายใน Segmented Control |
| `rounded-lg` | `rounded-lg` | `12px` | รูปภาพตัวอย่าง Thumbnail, กรอบไอคอนประจำการ์ด |
| `rounded-control`| `rounded-control` / `rounded-xl` | `14px` | **ปุ่มมาตรฐาน (Buttons), กล่องป้อนข้อมูล (Input, Select), Time Picker Wheels** |
| `rounded-hard` | `rounded-hard` | `16px` | การ์ดรายการอุปกรณ์ย่อย, กล่องแจ้งเตือน Alert |
| `rounded-card` | `rounded-card` / `rounded-2xl` | `20px` | **การ์ดเนื้อหา (`jw-card`), กล่องโมดอล (Modal Dialog)** |
| `rounded-float` | `rounded-float` | `22px` | **Sidebar ลอยบนเดสก์ท็อป, Docked Action Footer Bar** |
| `rounded-full` | `rounded-full` | `9999px` | เม็ดสีสถานะ (Chips / Badges), สวิตช์เปิด-ปิด (Toggle), อวาตาร์โปรไฟล์ |

---

### 2.5 Borders & Elevation Shadows

* **Borders:** เส้นขอบมาตรฐานใช้ความหนา `1px`  
  - ขอบฟอร์มปกติ: `border border-line-input` (`#D0D5DD`)
  - ขอบการ์ด/เส้นแบ่ง: `border border-line` (`#E4E4E0`)
  - ขอบ Focus คีย์บอร์ด: `ring-2 ring-brand/25 border-brand`
* **Box Shadows:**
  - `shadow-xs`: `0 1px 2px rgba(16,24,40,.05)` (ปุ่มย่อย, แถบตัวเลือกขนาดเล็ก)
  - `shadow-card` / `shadow-sm`: `0 1px 3px rgba(16,24,40,.06)` (การ์ดเนื้อหาปกติ)
  - `shadow-float`: `0 8px 28px rgba(16,24,40,.08)` (Sidebar เดสก์ท็อป, Docked Action Bar)
  - `shadow-high`: `0 10px 24px -4px rgba(16,24,40,.12)` (ป๊อปอัป DatePicker, ดรอปดาวน์)
  - `shadow-pop`: `0 12px 32px rgba(16,24,40,.14)` (โมดอลหน้าจอหลัก, กล่องยืนยันการทำรายการ)

---

### 2.6 Iconography & Sizes

ใช้ **Lucide React** ร่วมกับไอคอนเสริมที่พัฒนาผ่าน SVG (`Icon` จาก `@/components/icons`):
- `size-3.5` (14px): ไอคอนช่วยอธิบายในข้อความ, ลูกศรชี้ในปุ่มขนาดเล็ก
- `size-4` (16px): ไอคอนปุ่มทั่วไป, ไอคอนปฏิทินในช่องวันที่
- `size-5` (20px): **ไอคอนเมนูใน Sidebar, ปุ่มปิดโมดอล (Close X)**
- `size-6` (24px) ถึง `size-8` (32px): ไอคอนหัวข้อสถานะ, ภาพแทนประเภททรัพยากร

---

## 3. Layout Guidelines

### 3.1 Main Layout Architecture (AppShell)

โครงสร้าง Layout หลักของทั้งระบบถูกห่อหุ้มด้วย `AppShell` (`@/components/shell`):

```
+----------------------------------------------------------------------------------------+
|                                  Window Viewport                                       |
| +------------------+ +---------------------------------------------------------------+ |
| |                  | | Mobile Header (< lg): sticky top-0, h-12, progress indicator  | |
| |                  | +---------------------------------------------------------------+ |
| |                  | |                                                               | |
| |                  | | Content Area (<main>):                                        | |
| | Sidebar          | |   - Desktop Pinned Step Header (sticky top-0 z-20)            | |
| | (Desktop lg+)    | |   - Dynamic Children Views (Cards, Grids, Split-Panes)         | |
| | w-sidebar (232px)| |                                                               | |
| | sticky top-3     | |                                                               | |
| | h-[100dvh-24px]  | |                                                               | |
| |                  | +---------------------------------------------------------------+ |
| |                  | | Unified Docked Footer: sticky bottom-0 z-30                   | |
| |                  | | (Floating Pill Card on Desktop lg / Docked Bar on Mobile)     | |
| +------------------+ +---------------------------------------------------------------+ |
+----------------------------------------------------------------------------------------+
```

### 3.2 Sidebar & Navigation
* **Desktop (ขนาดหน้าจอ ≥ 1024px / lg):**
  - แสดงเป็นแผงข้างลอย (`rounded-float`, `shadow-float`, `border-line-soft`) ลอยเหนือพื้นหลัง 12px (`top-3`) สูงเต็มจอ `calc(100dvh - 24px)`
  - โหมดปกติกว้าง 72px (`w-[72px]`) แสดงเฉพาะไอคอน เมื่อเอาเมาส์ชี้ (Hover) จะขยายออกนุ่มนวลเป็น 232px (`w-sidebar`) อัตโนมัติ
  - รายการเมนูถูกจัดกลุ่มตามสายงาน (ทั่วไป, ปฏิบัติงานเจ้าหน้าที่, ผู้บริหาร, ผู้ดูแลระบบ) พร้อมเส้นแบ่งขัดเจน
* **Mobile (< 1024px):**
  - ซ่อนเป็นลิ้นชักด้านข้าง (Off-canvas Drawer) ที่ขอบซ้าย เปิด-ปิดด้วยปุ่ม Hamburger บนหัวหน้าจอ
  - มี Backdrop สีทึบเบลอหลัง (`bg-ink/45 backdrop-blur-xs z-40`) กดปิดได้เมื่อคลิกด้านนอกหรือกดแป้น `Escape`

### 3.3 Header & Sticky Top Bar
* **Mobile (< lg):** มี Header ติดบนสุดเสมอ (`sticky top-0 z-30`) สูง 48px (`h-12`) มีปุ่มย้อนกลับ/เปิดเมนู, หัวข้อหน้า, และเส้นความคืบหน้ารวม (Progress Bar)
* **Desktop (≥ lg):** สำหรับหน้าจอง/ยืมแบบหลายขั้นตอน (Wizard) การ์ดหัวข้อขั้นตอนจะถูกตรึงไว้ที่ตำแหน่งบนสุด (`sticky top-0 z-20 bg-background/95 backdrop-blur-md`) เพื่อให้ผู้ใช้ทราบขั้นตอนและจำนวนที่เลือกตลอดเวลาขณะเลื่อนดูรายการ

### 3.4 Docked & Floating Sticky Footer
* แถบสรุปการเลือกและการกดปุ่มถัดไป/บันทึก จะถูกตรึงไว้ที่ขอบล่างเสมอ (`sticky bottom-0 z-30`):
  - **บน Desktop (≥ lg):** ลอยเป็นแคปซูลการ์ดสวยงาม (`lg:rounded-card lg:shadow-float lg:border lg:bg-surface/95 lg:backdrop-blur-md`) อยู่ภายใน Container ความกว้างของหน้าจอ
  - **บน Mobile (< lg):** แนบชิดขอบล่างของหน้าจอเต็มความกว้างพร้อมรองรับ `safe-area-inset-bottom`
  - มีการกำหนด `pb-24 sm:pb-28 lg:pb-28` ที่เนื้อหาของ `<main>` เพื่อไม่ให้ชิ้นส่วนสุดท้ายถูก Footer บัง

### 3.5 Content Containers & Breakpoints
* **ตัวคุมความกว้าง (Width Constraints):**
  - หน้าจอมาตรฐาน / ฟอร์ม / รายการทั่วไป: `max-w-[1440px] mx-auto`
  - หน้าจอแดชบอร์ด / ตารางแอดมิน: `max-w-none` (ใช้พื้นที่แนวนอนเต็มที่)
  - หน้าจอแบบฟอร์มเอกสารหรือยืนยันตัวตน: `max-w-[800px] mx-auto` หรือ `max-w-[1000px]`

---

## 4. Component Guidelines

### 4.1 Buttons

ใช้คอมโพเนนต์ `Button` (`@/components/ui/Button`) หรือ Utility Class `.jw-btn`:

```tsx
// 1. ปุ่มหลัก (Primary) - สำหรับการกระทำสำคัญ เช่น "ถัดไป", "ยืนยันส่งคำขอ", "บันทึก"
<Button variant="primary">ยืนยันข้อมูล</Button>
// หรือเขียนคลาสตรง:
<button className="jw-btn">บันทึกข้อมูล</button>

// 2. ปุ่มรอง (Secondary) - สำหรับ "ย้อนกลับ", "ยกเลิก", "ล้างข้อมูล"
<Button variant="secondary">ย้อนกลับ</Button>
// หรือเขียนคลาสตรง:
<button className="jw-btn-sec">ล้างทั้งหมด</button>

// 3. ปุ่มอันตราย (Danger) - สำหรับ "ไม่อนุมัติ", "ลบทิ้ง", "ยกเลิกคำขอ"
<Button variant="danger">ลบรายการ</Button>
<button className="jw-btn-red">ยกเลิกคำขอ</button>

// 4. ปุ่มไม่มีกรอบ (Ghost) และปุ่มไอคอน (Icon Button)
<Button variant="ghost">ดูรายละเอียด</Button>
<Button variant="icon" aria-label="ตั้งค่า"><Icon name="settings" className="size-5" /></Button>
```

* **กฎการใช้งานปุ่ม:**
  - ความสูงมาตรฐานของปุ่มคือ `h-11` (44px) รองรับการสัมผัสบนหน้าจอพกพา (Touch Target Size)
  - ห้ามใช้สีแดงสดฉูดฉาด ให้ใช้ `bg-danger-fg` (`#7F1D1D`) เพื่อความสุภาพในระบบราชการ
  - สถานะโหลด (Loading) ต้องปิดการคลิก (`disabled`) พร้อมแสดงตัวหมุน Spinner

---

### 4.2 Form Controls: Input & Textarea

ใช้คอมโพเนนต์ `Input` (`@/components/ui/Input`) หรือ Utility Class `.jw-in` และ `.jw-lbl`:

```tsx
<div className="flex flex-col gap-1.5 w-full">
  <label htmlFor="fullname" className="jw-lbl">ชื่อ-นามสกุล ผู้ยื่นคำขอ <span className="text-danger-fg">*</span></label>
  <input
    id="fullname"
    type="text"
    placeholder="ระบุชื่อและนามสกุล"
    className="jw-in"
  />
  <span className="text-caption text-muted">กรอกข้อมูลตามบัตรประจำตัวประชาชน</span>
</div>
```

* **สถานะความผิดพลาด (Error State):**
  - ขอบเปลี่ยนเป็นสีแดง: `border-danger-fg`
  - ข้อความเตือนด้านล่าง: `text-caption font-medium text-danger-fg`
  - เพิ่ม `aria-invalid="true"` เสมอ

---

### 4.3 Select, Dropdowns & Address Hierarchies

* **Select ธรรมดา:** ใช้โครงสร้างความสูง `h-11 rounded-control border border-line-input bg-surface px-3.5`
* **ระบบที่อยู่ราชการไทย (`ThaiAddressSelect`):**  
  รองรับลำดับชั้น จังหวัด -> อำเภอ/เขต -> ตำบล/แขวง -> รหัสไปรษณีย์ โดยดึงข้อมูลมาตรฐานจาก `@japjong/shared` ป้องกันการพิมพ์รหัสไปรษณีย์หรือชื่อตำบลผิดพลาด

---

### 4.4 Toggle Switch & Checkboxes

ใช้คอมโพเนนต์ `Toggle` (`@/components/ui-widgets`):
```tsx
<Toggle
  checked={isEnabled}
  onChange={setIsEnabled}
  title="เปิดให้ประชาชนจองสถานที่นี้"
/>
```
* **ขนาด:** กว้าง `44px` (`w-11`), สูง `26px`, วงกลมสวิตช์เส้นผ่านศูนย์กลาง `20px` (`w-5 h-5`)
* **สี:** เมื่อเปิดเป็น `bg-brand`, เมื่อปิดเป็น `bg-[#C4C8D6]` (เทาอ่อนสบายตา)

---

### 4.5 Date Picker & Time Wheel Picker

ใช้คอมโพเนนต์จาก `@/components/date-time-picker`:
1. **`DatePickerField`:** ปฏิทินแสดงเดือนภาษาไทย (เช่น "พฤศจิกายน 2569") พร้อมระบบล็อกวันย้อนหลังหรือเงื่อนไขการจองล่วงหน้าขั้นต่ำ (`minAdvanceDays`)
2. **`TimePickerField`:** วงล้อเลื่อนเลือกเวลาสไตล์ iOS/Modern Wheel (แยกหลักชั่วโมงและนาที) กลิ้งเลือกได้นุ่มนวลและแม่นยำ

---

### 4.6 Cards (การ์ดบรรจุเนื้อหา)

ใช้คอมโพเนนต์ `Card` (`@/components/ui/Card`) หรือ Class `.jw-card`:
```tsx
<div className="jw-card p-5 sm:p-6">
  <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
    <h3 className="text-heading font-bold text-ink">ข้อมูลสถานที่</h3>
    <StatusChip status="approved" />
  </div>
  <p className="text-body text-ink-soft">รายละเอียดข้อมูล...</p>
</div>
```

---

### 4.7 Tables (ตารางข้อมูลเดสก์ท็อปและมือถือ)

**Desktop View (≥ 768px):**  
```tsx
<div className="overflow-x-auto rounded-card border border-line bg-surface">
  <table className="w-full text-left border-collapse text-[13.5px]">
    <thead>
      <tr className="bg-surface-muted/70 border-b border-line text-[12px] font-semibold text-ink-mute">
        <th className="py-3 px-4">เลขที่คำขอ</th>
        <th className="py-3 px-4">ประเภท</th>
        <th className="py-3 px-4">รายการ</th>
        <th className="py-3 px-4">สถานะ</th>
        <th className="py-3 px-4 text-right">การดำเนินการ</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-line">
      <tr className="hover:bg-brand-tint/20 transition cursor-pointer">
        <td className="py-3.5 px-4 font-bold text-brand">BK-2569-0001</td>
        ...
      </tr>
    </tbody>
  </table>
</div>
```

**Mobile View (< 768px):**  
ซ่อนตารางแล้วแสดงผลเป็นรายการการ์ดกะทัดรัด (`divide-y divide-line`) แสดงเลขคำขอ ชิปสถานะ และรายละเอียดหลักในแนวตั้ง

---

### 4.8 Badges & Status Chips

ใช้ `Chip` หรือ `StatusChip` (`@/components/ui`):
```tsx
<StatusChip status="pending_staff" /> // สีน้ำเงิน "รอตรวจสอบ"
<StatusChip status="approved" />      // สีเขียว "อนุมัติแล้ว"
<StatusChip status="rejected" />      // สีแดง "ไม่อนุมัติ"
```
* ขอบมนแบบ `rounded-full` ความสูงไม่น้อยกว่า `26px` มีเส้นตัดขอบคมชัดด้วย Ring Inset

---

### 4.9 Modal Dialogs & Backdrops

โครงสร้างโมดอลมาตรฐาน:
```tsx
{isOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
    <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-pop">
      <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
        <h3 className="text-heading font-bold text-ink">หัวข้อหน้าต่าง</h3>
        <button onClick={onClose} className="p-1 rounded-control hover:bg-hover text-ink-mute">
          <Icon name="x" className="size-5" />
        </button>
      </div>
      <div className="text-body text-ink-soft mb-6">
        เนื้อหาฟอร์มหรือคำยืนยัน...
      </div>
      <div className="flex justify-end gap-2.5">
        <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
        <Button variant="primary" onClick={onConfirm}>ยืนยันการดำเนินการ</Button>
      </div>
    </div>
  </div>
)}
```

---

### 4.10 Tabs & Segmented Controls

ใช้ `Tabs` (`@/components/ui-widgets`):
- พื้นหลังรางเป็นสี `bg-soft` โค้งมนแบบ `rounded-control`
- ปุ่มที่ถูกเลือก (Active Tab) มีพื้นสีขาว `bg-white text-ink shadow-xs` ปรับเปลี่ยนนุ่มนวล

---

### 4.11 Stepper & Progress Tracking

1. **`Stepper` สำหรับเดสก์ท็อป:** แสดงวงกลมหมายเลข 1, 2, 3, 4 มีเส้นเชื่อมสี `brand` แสดงสถานะสำเร็จแล้วด้วยไอคอน Check
2. **Multi-Segment Progress Bar สำหรับโมบายล์:** แถบขีดหลายช่วงบนหัวหน้าจอ แสดงสัดส่วนขั้นตอนที่กำลังดำเนินการ

---

### 4.12 Feedback, Alerts, Skeleton & Empty State

* **Empty State:** กล่องขอบประลวดลายเส้นประ (`border-dashed border-line bg-surface p-10`) พร้อมข้อความแจ้งความว่างเปล่าและปุ่ม Action สร้างรายการใหม่
* **Skeleton Loading:** แท่งสี `bg-surface-muted animate-pulse rounded-card` รักษา Layout เดิมไม่ให้กระตุกขณะโหลดข้อมูล
* **Error Banner:** พื้นหลังสีแดงอ่อนนวล `bg-danger-bg border border-danger-fg/20 text-danger-fg p-4 rounded-xl`

---

### 4.13 Official Gov Form Document Paper

สำหรับการแสดงแบบฟอร์มขอใช้สถานที่ราชการ (แบบฟอร์มเอกสารทางราชการจริง):
- คลาส `.gov-form-paper`: ขนาดความกว้างจำลอง A4 พอดีสายตา
- รองรับระบบลงนามดิจิทัล 3 ระดับ (ผู้ขอ / เจ้าหน้าที่ผู้ตรวจสอบ / ปลัด / นายก)
- เมื่อสั่งพิมพ์ทางเครื่องพิมพ์ (`@media print`): จะตัด Sidebar, Header, และส่วนควบคุมเว็บออก 100% เหลือเฉพาะกระดาษเอกสาร A4 คมชัดพร้อมลายเซ็นจริง

---

## 5. Interaction Patterns

1. **การกดและการวางเมาส์ (Hover & Active):**
   - ปุ่มกดและการ์ดที่คลิกได้ มีเอฟเฟกต์ `active:scale-[0.99]` หรือ `active:scale-95`
   - แถวตารางเปลี่ยนเป็น `hover:bg-brand-tint/20`
2. **การนำทางด้วยแป้นพิมพ์ (Keyboard Accessibility):**
   - ชิ้นส่วนที่โต้ตอบได้ทุกตัวต้องมี `focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2`
3. **การตรวจสอบความถูกต้องของฟอร์ม (Validation & Errors):**
   - ตรวจสอบความถูกต้องทันทีเมื่อผู้ใช้พิมพ์เสร็จ (OnBlur / OnChange)
   - หากมีข้อผิดพลาดร้ายแรง ให้แสดงกล่องสรุปรายการข้อผิดพลาดด้านบนสุด และเลื่อนหน้าจอไปยังตำแหน่งนั้นอย่างนุ่มนวล (`scrollIntoView({ behavior: 'smooth' })`)
4. **การยืนยันคำสั่งสำคัญ (Confirmation Pattern):**
   - การลงนามของผู้บริหาร (ปลัด / นายก) มีกล่องกดรหัส PIN 6 หลัก (`PinKeypad`) เพื่อความปลอดภัยเทียบเท่าระบบราชการดิจิทัลมาตรฐาน

---

## 6. Page Design Patterns

1. **Dashboard Pattern (`/staff`, `/admin`, `/approver`):**
   - ส่วนบนสุด: Banner ต้อนรับ + สรุปสายงาน + ปุ่มลัดด่วน (Quick Actions)
   - ส่วนกลาง: 4 KPI Cards สรุปยอดงานในคิว (ใช้ขอบข้างเน้นสี `border-l-4 border-l-brand`)
   - ส่วนล่าง: ตารางคิวงานที่ต้องจัดการ พร้อมแท็บตัวกรอง (Filter Tabs)
2. **Split-Pane List & Detail Pattern (`/borrow/my`, `/staff/review`):**
   - จอเดสก์ท็อปแบ่งเป็น 2 ฝั่ง: ฝั่งซ้าย (380px) เป็นรายการคำขอแบบย่อ, ฝั่งขวา (Flex-1) แสดงรายละเอียดคำขอ ตัวอย่างเอกสาร และกล่องบันทึกผลการตรวจสอบ
3. **Multi-Step Wizard Pattern (`/booking`, `/borrow`):**
   - ส่วนบน: Step Header การ์ดบอกขั้นตอนปัจจุบันและจำนวนที่เลือก ตรึงติดบนสุด (`sticky top-0`)
   - ส่วนกลาง: ตัวเลือกสถานที่หรือครุภัณฑ์ในรูปแบบ Grid การ์ด
   - ส่วนล่าง: Footer แคปซูลลอย แสดงรายการที่เลือกทั้งหมดพร้อมปุ่ม "ถัดไป" ตรึงติดล่างสุด (`sticky bottom-0`)

---

## 7. Responsive Guidelines

| อุปกรณ์ | Breakpoint | พฤติกรรมของ Layout | พฤติกรรมของตารางและเมนู |
| :--- | :--- | :--- | :--- |
| **Desktop ใหญ่** | `xl:` (≥ 1280px) | กริิด 4 คอลัมน์, Sidebar แสดงเต็มจอ, Split-Pane สองฝั่งสบายตา | ตารางแสดงคอลัมน์ครบถ้วน |
| **Laptop / Desktop** | `lg:` (≥ 1024px) | กริิด 2-3 คอลัมน์, Sidebar ย่อ-ขยายแบบ Hover ลอย | ตารางแสดงคอลัมน์มาตรฐาน |
| **Tablet** | `md:` (768px – 1023px) | Sidebar กลายเป็น Drawer ปิดซ่อน, Header โมบายล์แสดง | ตารางเริ่มปรับข้อมูลที่ไม่จำเป็นออก |
| **Mobile** | `< md` (< 768px) | คอลัมน์เดี่ยวแนวตั้ง, Header และ Footer แนบขอบจอ | ตารางถูกแปลงเป็น Card List Rows 100% |

---

## 8. Developer Rules & Discrepancy Log

### ข้อกำหนดสำหรับผู้พัฒนา (Developer Rules)
1. **ห้ามสร้างสีใหม่ (No Custom Arbitrary Colors):** ห้ามใช้ `bg-[#...]` สุ่มขึ้นมาเอง ให้ใช้ Token เช่น `bg-surface`, `bg-brand`, `bg-brand-tint`, `text-ink` เท่านั้น
2. **ห้ามละเลย Dark Mode:** ทุกครั้งที่ใส่ Class สี ให้ตรวจสอบการแสดงผลในโหมดมืดเสมอ
3. **ใช้คอมโพเนนต์กลางก่อนเสมอ:** ห้ามเขียนปุ่ม `<button>` ขึ้นใหม่ ให้พิจารณาใช้ `<Button>` หรือคลาส `.jw-btn`
4. **ความสูงมาตรฐานของกล่องควบคุมคือ 44px (`h-11`):** เพื่อให้ผู้ใช้งานทั้งบนจอคอมพิวเตอร์และมือถือสามารถกดได้ง่าย

### บันทึกข้อเสนอแนะและจุดปรับปรุงในอนาคต (Discrepancy Notes)
*ในระหว่างการสำรวจ Codebase พบจุดที่ยังใช้คลาสสีแบบฮาร์ดโค้ดบางแห่ง ซึ่งควรทยอย Refactor ในอนาคต (โดยไม่แก้ไขในรอบงานนี้):*
- ใน `apps/web/src/components/ui/Chip.tsx` มีการระบุสีรหัสตรงเช่น `bg-[#FFF4CC] text-[#765500]` ควรปรับให้ดึงจาก Semantic Token `bg-warn-bg text-warn-fg` ให้สอดคล้องกันทั้งหมด
- ในหน้า `booking/page.tsx` มีการใช้ `bg-[#FDE8E8]` ในบางจุดของกล่องแจ้งเตือน ควรปรับมาใช้ `bg-danger-bg text-danger-fg`
- ใน `apps/web/src/components/Sidebar.tsx` มีการใช้ `bg-[#FBFCFA]` ควรปรับมาใช้ `bg-surface` หรือ `bg-ground` เพื่อให้สอดคล้องกับโทเค็นระบบอย่างแท้จริง

