import type {
  EquipmentCategory,
  PermissionKey,
  RequestStatus,
  RequestType,
  Role,
  VenueType,
  VerificationDocumentType,
  VerificationStatus,
} from './types';

export type Tone = 'green' | 'amber' | 'blue' | 'red' | 'gray' | 'orange' | 'purple' | 'teal' | 'cyan' | 'indigo' | 'pink';

export const ROLE_LABEL: Record<Role, string> = {
  USER: 'ผู้ใช้งานทั่วไป',
  STAFF: 'เจ้าหน้าที่',
  APPROVER_L2: 'ปลัดองค์การบริหารส่วนตำบล',
  APPROVER_L1: 'นายกองค์การบริหารส่วนตำบล',
  ADMIN: 'ผู้ดูแลระบบ (แอดมิน)',
};

export const ROLE_TONE: Record<Role, Tone> = {
  USER: 'gray',
  STAFF: 'blue',
  APPROVER_L2: 'amber',
  APPROVER_L1: 'amber',
  ADMIN: 'green',
};

export interface RoleMetaInfo {
  role: Role;
  label: string;
  shortLabel: string;
  tone: Tone;
  homePath: string;
  defaultAccountId: string;
  summary: string;
  capabilities: string[];
}

export const ROLE_META: Record<Role, RoleMetaInfo> = {
  USER: {
    role: 'USER',
    label: 'ผู้ใช้งานทั่วไป (ประชาชน / หน่วยงานภายนอก)',
    shortLabel: 'ผู้ใช้งานทั่วไป',
    tone: 'gray',
    homePath: '/',
    defaultAccountId: 'u-somchai',
    summary: 'ยื่นคำขอออนไลน์ผ่าน LINE OA และติดตามสถานะคำขอของตนเอง',
    capabilities: [
      'ยื่นคำขอใช้สถานที่ (4 ขั้นตอน) พร้อมลงลายมือชื่อผู้ขอ',
      'ยื่นคำขอใช้อุปกรณ์ (3 ขั้นตอน) และกดแจ้งคืนเมื่อครบกำหนด',
      'แจ้งปัญหา / แจ้งซ่อมพร้อมแนบรูปถ่าย และกดตรวจรับงานเมื่อซ่อมเสร็จ',
      'ขอเลื่อนวันเวลา หรือยกเลิกคำขอของตนเอง พร้อมระบุเหตุผล',
      'ดูและดาวน์โหลดเอกสารใบอนุญาต (PDF) ของคำขอที่อนุมัติครบ 3 ระดับแล้ว',
    ],
  },
  STAFF: {
    role: 'STAFF',
    label: 'เจ้าหน้าที่ผู้รับผิดชอบ (ธุรการ / พัสดุ)',
    shortLabel: 'เจ้าหน้าที่',
    tone: 'blue',
    homePath: '/staff',
    defaultAccountId: 's-suda',
    summary: 'ตรวจสอบคำขอด่านแรก ลงนามระดับ 1 (เจ้าหน้าที่) รับมอบ–คืนอุปกรณ์ และรับเรื่องซ่อม',
    capabilities: [
      'ตรวจสอบความครบถ้วนของคำขอ และลงนามระดับที่ 1 (เจ้าหน้าที่) เพื่อสร้างเอกสารส่งต่อปลัด อบต.',
      'ส่งคืนแก้ไข / ไม่อนุมัติคำขอในชั้นเจ้าหน้าที่ พร้อมระบุเหตุผล',
      'บันทึกเช็คลิสต์รับมอบ (ก่อนใช้) และรับคืน (หลังใช้) พร้อมถ่ายรูปหลักฐาน',
      'รับเรื่องแจ้งซ่อม อัปเดตสถานะกำลังดำเนินการ และบันทึกซ่อมเสร็จส่งผู้แจ้งตรวจรับ',
      'กรอกคำขอใช้สถานที่แทนผู้มาติดต่อหน้าเคาน์เตอร์ (Walk-in)',
    ],
  },
  APPROVER_L2: {
    role: 'APPROVER_L2',
    label: 'ปลัดองค์การบริหารส่วนตำบล',
    shortLabel: 'ปลัดองค์การบริหารส่วนตำบล',
    tone: 'amber',
    homePath: '/approver',
    defaultAccountId: 'a-wichai',
    summary: 'กลั่นกรองและลงนาม "เห็นชอบ" (ระดับที่ 2) ด้วยลายเซ็นดิจิทัลและรหัส PIN 6 หลัก',
    capabilities: [
      'พิจารณาคำขอที่ผ่านการตรวจสอบจากเจ้าหน้าที่แล้ว (สถานะ รอปลัดองค์การบริหารส่วนตำบล)',
      'ลงนาม "เห็นชอบ" (ระดับ 2) ด้วยลายเซ็นดิจิทัล + ยืนยันรหัส PIN 6 หลัก เพื่อส่งต่อนายก อบต.',
      'สั่งไม่ผ่าน / ส่งคืนคำขอ พร้อมระบุเหตุผลแจ้งผู้ยื่น',
      'ตั้งค่าลายเซ็นดิจิทัลประจำตัวและรหัส PIN 6 หลัก',
    ],
  },
  APPROVER_L1: {
    role: 'APPROVER_L1',
    label: 'นายกองค์การบริหารส่วนตำบล',
    shortLabel: 'นายกองค์การบริหารส่วนตำบล',
    tone: 'amber',
    homePath: '/approver',
    defaultAccountId: 'a-prasert',
    summary: 'พิจารณาอนุมัติขั้นสุดท้าย (ระดับที่ 3) และออกเอกสารใบอนุญาต PDF อัตโนมัติ',
    capabilities: [
      'พิจารณาคำขอที่ผ่านความเห็นชอบจากปลัด อบต. แล้ว (สถานะ รอนายกองค์การบริหารส่วนตำบล)',
      'ลงนาม "อนุมัติ" ขั้นสุดท้ายด้วยลายเซ็นดิจิทัล + ยืนยันรหัส PIN 6 หลัก',
      'สร้างและออกเอกสารใบอนุญาต (PDF) ที่มีลายเซ็นครบทั้ง 4 ฝ่ายโดยอัตโนมัติ',
      'สั่งไม่อนุมัติคำขอ พร้อมระบุเหตุผลแจ้งผู้ยื่น',
    ],
  },
  ADMIN: {
    role: 'ADMIN',
    label: 'ผู้ดูแลระบบ (แอดมิน อบต.)',
    shortLabel: 'แอดมิน',
    tone: 'green',
    homePath: '/admin',
    defaultAccountId: 'ad-admin',
    summary: 'บริหารจัดการทรัพยากร แบบฟอร์ม บทบาท และกำหนดสิทธิ์รายเมนูของผู้ใช้ทั้งระบบ',
    capabilities: [
      'กำหนดบทบาท (Role) และเปิด–ปิดสิทธิ์รายย่อย (6 สิทธิ์) ให้กับผู้ใช้แต่ละบัญชี',
      'เพิ่ม/แก้ไข/เปิด–ปิดให้จอง สถานที่ ครุภัณฑ์ ยานพาหนะ และแบบฟอร์มคำขอ',
      'ตรวจสอบภาพรวมระบบและประวัติกิจกรรม (Audit Log) ทั้งหมด',
      'สามารถเข้าช่วยปฏิบัติงานแทนเจ้าหน้าที่ (ตรวจคำขอ / รับมอบ-คืน / Walk-in) ตามสิทธิ์ที่เปิดไว้',
    ],
  },
};

export const PERMISSION_KEYS: PermissionKey[] = [
  'review',
  'walkIn',
  'manageResources',
  'sign',
  'manageUsers',
];

export const PERMISSION_LABEL: Record<PermissionKey, string> = {
  review: 'ตรวจคำขอ & ลงนามระดับเจ้าหน้าที่ + รับงานซ่อม',
  handover: 'บันทึกเช็คลิสต์รับมอบ–รับคืนอุปกรณ์',
  walkIn: 'กรอกคำขอแทนผู้มาติดต่อหน้าเคาน์เตอร์ (Walk-in)',
  manageResources: 'จัดการทรัพยากร (สถานที่ / อุปกรณ์ / แบบฟอร์ม)',
  sign: 'ลงนามเห็นชอบ/อนุมัติเอกสาร (ระดับ 2 ปลัด / ระดับ 1 นายก)',
  manageUsers: 'จัดการบัญชีผู้ใช้ บทบาท และกำหนดสิทธิ์ระบบ',
};

export interface PermissionMetaInfo {
  key: PermissionKey;
  label: string;
  description: string;
  defaultRoles: Role[];
  routes: string[];
}

export const PERMISSION_META: Record<PermissionKey, PermissionMetaInfo> = {
  review: {
    key: 'review',
    label: PERMISSION_LABEL.review,
    description: 'เข้าหน้า /staff/review เพื่อตรวจเอกสาร ลงนามระดับที่ 1 (เจ้าหน้าที่) และรับเรื่อง/ปิดงานแจ้งซ่อม',
    defaultRoles: ['STAFF', 'ADMIN'],
    routes: ['/staff', '/staff/review'],
  },
  handover: {
    key: 'handover',
    label: PERMISSION_LABEL.handover,
    description: 'เข้าหน้า /staff/handover เพื่อตรวจเช็คลิสต์ก่อนใช้ (รับมอบ) และหลังใช้ (รับคืน) พร้อมลงนาม 2 ฝ่าย',
    defaultRoles: ['STAFF', 'ADMIN'],
    routes: ['/staff/handover'],
  },
  walkIn: {
    key: 'walkIn',
    label: PERMISSION_LABEL.walkIn,
    description: 'เข้าหน้า /staff/walk-in เพื่อบันทึกคำขอจองสถานที่แทนประชาชนที่มาติดต่อที่สำนักงาน',
    defaultRoles: ['STAFF', 'ADMIN'],
    routes: ['/staff/walk-in'],
  },
  manageResources: {
    key: 'manageResources',
    label: PERMISSION_LABEL.manageResources,
    description: 'เข้าหน้า /admin/resources และ /admin/resources/new เพื่อเพิ่ม/แก้ไข/เปิด–ปิดสถานที่และครุภัณฑ์',
    defaultRoles: ['STAFF', 'ADMIN'],
    routes: ['/admin/resources', '/admin/resources/new'],
  },
  sign: {
    key: 'sign',
    label: PERMISSION_LABEL.sign,
    description: 'เข้าหน้า /approver และ /approver/sign/[id] เพื่อลงนามเห็นชอบ (L2) หรืออนุมัติ (L1) ด้วย PIN 6 หลัก',
    defaultRoles: ['APPROVER_L2', 'APPROVER_L1'],
    routes: ['/approver', '/approver/sign'],
  },
  manageUsers: {
    key: 'manageUsers',
    label: PERMISSION_LABEL.manageUsers,
    description: 'เข้าหน้า /admin และ /admin/permissions เพื่อเปลี่ยนบทบาทและเปิด–ปิดสิทธิ์รายเมนูของผู้ใช้ทุกคน',
    defaultRoles: ['ADMIN'],
    routes: ['/admin', '/admin/permissions'],
  },
};

export const DEFAULT_PERMISSIONS: Record<Role, Record<PermissionKey, boolean>> = {
  USER: {
    review: false,
    handover: false,
    walkIn: false,
    manageResources: false,
    sign: false,
    manageUsers: false,
  },
  STAFF: {
    review: true,
    handover: true,
    walkIn: true,
    manageResources: true,
    sign: false,
    manageUsers: false,
  },
  APPROVER_L2: {
    review: false,
    handover: false,
    walkIn: false,
    manageResources: false,
    sign: true,
    manageUsers: false,
  },
  APPROVER_L1: {
    review: false,
    handover: false,
    walkIn: false,
    manageResources: false,
    sign: true,
    manageUsers: false,
  },
  ADMIN: {
    review: true,
    handover: true,
    walkIn: true,
    manageResources: true,
    sign: false,
    manageUsers: true,
  },
};

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  booking: 'สถานที่',
  borrow: 'อุปกรณ์',
  repair: 'แจ้งซ่อม',
};

export const STATUS_META: Record<RequestStatus, { label: string; tone: Tone }> = {
  pending_staff: { label: 'รอตรวจสอบ', tone: 'blue' },
  pending_l2: { label: 'รอปลัดองค์การบริหารส่วนตำบล', tone: 'purple' },
  pending_l1: { label: 'รอนายกองค์การบริหารส่วนตำบล', tone: 'orange' },
  approved: { label: 'อนุมัติแล้ว', tone: 'green' },
  rejected: { label: 'ไม่อนุมัติ', tone: 'red' },
  cancelled: { label: 'ยกเลิกแล้ว', tone: 'gray' },
  borrowing: { label: 'กำลังใช้งาน', tone: 'pink' },
  return_inspect: { label: 'รอตรวจรับ', tone: 'amber' },
  returned: { label: 'เสร็จสิ้น', tone: 'green' },
  repair_submitted: { label: 'รอตรวจสอบ', tone: 'blue' },
  repair_in_progress: { label: 'กำลังดำเนินการ', tone: 'teal' },
  repair_awaiting_acceptance: { label: 'รอตรวจรับ', tone: 'amber' },
  repair_done: { label: 'เสร็จสิ้น', tone: 'green' },
};

export const VENUE_TYPE_LABEL: Record<VenueType, string> = {
  meeting: 'ห้องประชุม',
  pavilion: 'ศาลา',
  field: 'สนามกีฬา',
  yard: 'ลานกิจกรรม',
  training: 'ห้องอบรม',
};

export const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  audio: 'เครื่องเสียง',
  tent: 'เต็นท์ / เก้าอี้',
  it: 'IT',
};

export const REPAIR_CATEGORIES = ['ไฟฟ้า', 'ประปา', 'เครื่องปรับอากาศ', 'เฟอร์นิเจอร์', 'อื่น ๆ'];

export const FACILITIES = ['เครื่องเสียง', 'โปรเจกเตอร์', 'เครื่องปรับอากาศ', 'Wi-Fi', 'ที่จอดรถ'];

export const SIGN_LEVEL_TITLE = {
  staff: 'เจ้าหน้าที่',
  l2: 'ปลัดองค์การบริหารส่วนตำบล',
  l1: 'นายกองค์การบริหารส่วนตำบล',
} as const;

export const ACTIVE_BOOKING_STATUSES: RequestStatus[] = ['pending_staff', 'pending_l2', 'pending_l1', 'approved'];

export const VERIFICATION_STATUS_LABEL: Record<VerificationStatus, string> = {
  VALID: 'เอกสารถูกต้องและยังมีผล',
  REVOKED: 'เอกสารถูกยกเลิก',
  INVALID: 'ข้อมูลเอกสารไม่ถูกต้อง',
  NOT_FOUND: 'ไม่พบข้อมูลเอกสาร',
};

export const VERIFICATION_STATUS_TONE: Record<VerificationStatus, Tone> = {
  VALID: 'green',
  REVOKED: 'amber',
  INVALID: 'red',
  NOT_FOUND: 'gray',
};

export const VERIFICATION_DOC_TYPE_LABEL: Record<VerificationDocumentType, string> = {
  booking_request: 'แบบขอใช้สถานที่ราชการ',
  booking_permit: 'หนังสืออนุมัติใช้สถานที่ราชการ',
  borrow_request: 'แบบคำขอยืมอุปกรณ์',
  borrow_permit: 'หนังสืออนุมัติยืมอุปกรณ์',
  handover: 'เอกสารส่งมอบและคืนอุปกรณ์',
};

