/**
 * Configuration & Static Copy for the Public Landing Page.
 * Separated from UI components so agency branding and workflow copy
 * can be updated centrally or overridden via environment variables.
 */

export const LANDING_CONFIG = {
  appName: 'ระบบจับจอง',
  appCode: 'JapJong',
  subtitle: 'Smart Gov Resource Platform',
  orgName:
    process.env.NEXT_PUBLIC_ORG_NAME?.trim() || 'องค์การบริหารส่วนตำบล (อบต.)',
  navLinks: [
    { href: '#services', label: 'บริการหลัก' },
    { href: '#workflow', label: 'ขั้นตอนอนุมัติ' },
    { href: '#tech', label: 'จุดเด่นและตรวจสอบ QR' },
  ],
} as const;

export interface WorkflowStepConfig {
  step: string;
  title: string;
  description: string;
  delayMs: number;
}

export const WORKFLOW_STEPS: WorkflowStepConfig[] = [
  {
    step: '01',
    title: 'ยืนยันตัวตน',
    description: 'เข้าสู่ระบบด้วย LINE Login, บัญชีผู้ใช้ หรือ Gov Center SSO',
    delayMs: 100,
  },
  {
    step: '02',
    title: 'ยื่นคำขอออนไลน์',
    description: 'เลือกบริการ ระบุวัน-เวลา ระบบตรวจสอบคิวว่างให้อัตโนมัติ',
    delayMs: 200,
  },
  {
    step: '03',
    title: 'ลงนามตามลำดับขั้น',
    description: 'เจ้าหน้าที่ตรวจรับ → ปลัด อบต. → นายก อบต. ลงนามดิจิทัล',
    delayMs: 300,
  },
  {
    step: '04',
    title: 'รับใบอนุญาต QR',
    description: 'แจ้งเตือนผลทาง LINE ทันที พร้อม QR Code แสดงหน้างาน',
    delayMs: 400,
  },
];
