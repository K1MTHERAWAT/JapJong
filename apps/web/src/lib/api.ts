/**
 * =====================================================================
 * Client API SDK & Utilities - ระบบจับจอง (@japjong/web)
 * =====================================================================
 * รวม Endpoint การเรียกใช้งาน Backend API ทั้งหมดของระบบ:
 * 1. Auth & Session Management (Local, LIFF, LINE OAuth, Demo Accounts)
 * 2. OTP & Digital Signatures (PIN, Resend Email OTP, Canvas Signatures)
 * 3. Resources & Availability (Venues, Equipment, Real-time Slot Conflicts)
 * 4. Citizen Requests & Lifecycle (Booking, Borrowing, Repair, Handovers)
 * 5. Admin & RBAC (User permissions, Notification logs, Dynamic Services, LINE Rich Menu)
 * 6. Document Templates & QR Verification
 * 7. Thai Date Formatters & Image Compression Helpers
 */

import type {
  ActivityLog,
  AdminNotificationDashboardSummary,
  AppNotification,
  BulkAssignRoleDto,
  ConflictInfo,
  CreateRoleDto,
  CreateSidebarServiceDto,
  DayAvailability,
  DemoAccountSummary,
  DocumentScanLog,
  DocumentVerification,
  Equipment,
  HandoverRecord,
  ItemQty,
  LineAuthStatusResponse,
  LineAuthUrlResponse,
  LineDeliveryStatus,
  LineNotificationLog,
  LineNotificationStatusResponse,
  LineRegisterPayload,
  LineRegistrationTicketInfo,
  LoginResponse,
  NotificationCategory,
  NotificationChannel,
  Period,
  PermissionKey,
  PublicAccount,
  PublicVerificationResult,
  RequestSignOtpResponse,
  RequestType,
  RequestWithTimeline,
  Role,
  RoleItem,
  ServiceRelationCheckResult,
  SidebarServiceItem,
  SignSessionStatus,
  StaffVerificationResult,
  UpdateRoleDto,
  UpdateSidebarServiceDto,
  UserNotificationPreference,
  Venue,
  VerifySignOtpResponse,
  DocumentTemplateItem,
  DocumentTemplateVersionItem,
  GeneratedDocumentItem,
} from '@japjong/shared';

// คีย์สำหรับจัดเก็บ Token และ Account ID ใน LocalStorage
const TOKEN_KEY = 'japjong_token';
const ACCOUNT_KEY = 'japjong_account_id';
// คีย์ดั้งเดิมเพื่อรองรับการย้ายระบบ (Legacy Backward Compatibility)
const LEGACY_TOKEN_KEY = 'jongwen_token';
const LEGACY_ACCOUNT_KEY = 'jongwen_account_id';

/**
 * ดึง Auth Token จาก LocalStorage
 */
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
}

/**
 * บันทึก Auth Token และ Account ID ลง LocalStorage
 */
export function setStoredAuth(token: string, accountId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ACCOUNT_KEY, accountId);
}

/**
 * ล้างข้อมูลการยืนยันตัวตนออกจาก LocalStorage ทั้งหมดเมื่อออกจากระบบ
 */
export function clearStoredAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ACCOUNT_KEY);
}

/**
 * ฟังก์ชันกลางสำหรับส่ง HTTP Request ไปยัง Backend API
 * - แทรก Authorization Bearer Token อัตโนมัติหากมี
 * - ตั้งค่า Timeout ป้องกันการค้างที่ 6,000ms ด้วย AbortController
 * - แปลง Error Response จาก NestJS ให้อ่านง่าย
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`/api${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: init.signal || controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        msg = Array.isArray(data.message) ? data.message.join(', ') : data.message || msg;
      } catch {
        // ข้ามหากแปลง JSON error ไม่ได้
      }
      throw new Error(msg);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export type MockAccountHint = PublicAccount;

/**
 * ออบเจกต์รวม Client API Methods ทั้งหมดของระบบจับจอง
 */
export const api = {
  // ========================================================
  // 1. หมวดการยืนยันตัวตน และบัญชีทดสอบ (Auth & Demo)
  // ========================================================
  /** ดึงรายชื่อบัญชีสาธิตสำหรับทดสอบระบบ (Demo Accounts) */
  demoAccounts: () => request<DemoAccountSummary[]>('/auth/demo-accounts'),
  /** เข้าสู่ระบบด้วยบัญชีสาธิตแบบ 1-Click */
  demoLogin: (accountId: string) =>
    request<LoginResponse>('/auth/demo-login', { method: 'POST', body: JSON.stringify({ accountId }) }),
  /** เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน */
  login: (payload: { username: string; password: string }) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  /** ออกจากระบบ */
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: JSON.stringify({}) }),
  /** ดึง URL สำหรับทำ LINE Login */
  getLineAuthUrl: () => request<LineAuthUrlResponse>('/auth/line?redirect=false'),
  /** ดึง URL สำหรับผูกบัญชีปัจจุบันเข้ากับ LINE */
  getLineLinkUrl: () => request<LineAuthUrlResponse>('/auth/line/link-url'),
  /** ยกเลิกการเชื่อมต่อบัญชีกับ LINE */
  unlinkLine: () => request<{ ok: boolean }>('/auth/line/unlink', { method: 'POST', body: JSON.stringify({}) }),
  /** ตรวจสอบสถานะการเชื่อมต่อ LINE ของบัญชีปัจจุบัน */
  getLineStatus: () => request<LineAuthStatusResponse>('/auth/line/status'),
  /** ส่ง ID Token จาก LINE Front-end Framework (LIFF) เพื่อแลกเป็นเซสชันของระบบ */
  authLiff: (idToken: string) =>
    request<{
      status: 'AUTHENTICATED' | 'NEW_USER';
      token?: string;
      account?: PublicAccount;
      ticket?: string;
      lineProfile?: { displayName: string; pictureUrl: string | null };
    }>('/auth/line/liff', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),
  /** ดึงการตั้งค่า LIFF ID และ Channel ID */
  getLiffConfig: () =>
    request<{ liffId: string | null; channelId: string | null }>('/auth/line/liff/config'),
  /** ตรวจสอบสถานะบัตรคิวลงทะเบียนผ่าน LINE (Registration Ticket) */
  getLineRegistrationStatus: (ticket: string) =>
    request<LineRegistrationTicketInfo>(`/auth/line/registration-status?ticket=${encodeURIComponent(ticket)}`),
  /** ลงทะเบียนสร้างบัญชีใหม่ที่เชื่อมโยงกับ LINE */
  registerWithLine: (payload: LineRegisterPayload) =>
    request<LoginResponse>('/auth/line/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  /** สั่งยกเลิกเซสชันของ LINE */
  lineLogout: () => request<{ ok: boolean }>('/auth/line/logout', { method: 'POST', body: JSON.stringify({}) }),
  /** ดึงข้อมูลบัญชีผู้ใช้ปัจจุบัน พร้อมสถานะความยินยอม PDPA และข้อมูล LINE */
  getUsersMe: () => request<{ account: PublicAccount; lineAccount: any; consents: any[] }>('/users/me'),
  /** อัปเดตข้อมูลผู้ใช้และบันทึกความยินยอม PDPA เพิ่มเติม */
  updateUsersMe: (payload: any) =>
    request<PublicAccount>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  /** ขอถอนความยินยอม PDPA */
  withdrawConsent: (consentType: string) =>
    request<{ ok: boolean; withdrawn: boolean }>('/users/me/consents/withdraw', {
      method: 'POST',
      body: JSON.stringify({ consentType }),
    }),
  /** ขอรหัส OTP ยืนยันเบอร์โทรศัพท์ */
  requestOtp: (phone: string) =>
    request<{ ok: boolean; message: string }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  /** ลงทะเบียนบัญชีผู้ใช้ใหม่ทั่วไป */
  register: (payload: {
    name: string;
    password: string;
    email?: string;
    phone?: string;
    otp?: string;
    lineName?: string;
    department?: string;
  }) => request<LoginResponse>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  /** ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบัน */
  me: () => request<PublicAccount>('/auth/me'),
  /** อัปเดตข้อมูลโปรไฟล์และที่อยู่ตามทะเบียนราษฎร์ */
  updateProfile: (payload: {
    name?: string;
    nickname?: string;
    position?: string;
    department?: string;
    phone?: string;
    email?: string;
    lineName?: string;
    addressHouseNo?: string;
    addressMoo?: string;
    addressProvinceId?: string;
    addressDistrictId?: string;
    addressSubdistrictId?: string;
    addressSubdistrict?: string;
    addressDistrict?: string;
    addressProvince?: string;
  }) => request<PublicAccount>('/auth/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
  /** เปลี่ยนรหัสผ่าน */
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>('/auth/password', { method: 'POST', body: JSON.stringify(payload) }),
  /** บันทึกลายเซ็นดิจิทัล (PNG Base64 จาก Canvas) */
  saveSignature: (signature: string) =>
    request<PublicAccount>('/auth/signature', { method: 'POST', body: JSON.stringify({ signature }) }),
  /** ตั้งค่าหรือเปลี่ยนรหัส PIN 6 หลักสำหรับอนุมัติคำขอ */
  savePin: (pin: string) =>
    request<PublicAccount>('/auth/pin', { method: 'POST', body: JSON.stringify({ pin }) }),
  /** ตรวจสอบความถูกต้องของรหัส PIN 6 หลัก */
  verifyPin: (pin: string) =>
    request<{ ok: boolean }>('/auth/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  // ========================================================
  // 2. หมวด Email OTP สำหรับการลงนามอนุมัติ (Resend Mailer)
  // ========================================================
  /** ขอส่งรหัส OTP ไปยังอีเมลเพื่อเปิดเซสชันลงนามเอกสาร */
  requestSignOtp: (email?: string) =>
    request<RequestSignOtpResponse>('/auth/sign-otp/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  /** ยืนยันรหัส OTP เพื่อเปิดเซสชันลงนาม (มีอายุ 15 นาที) */
  verifySignOtp: (otp: string) =>
    request<VerifySignOtpResponse>('/auth/sign-otp/verify', {
      method: 'POST',
      body: JSON.stringify({ otp }),
    }),
  /** ตรวจสอบสถานะเซสชันการลงนามดิจิทัลปัจจุบัน */
  getSignSessionStatus: () =>
    request<SignSessionStatus>('/auth/sign-session/status'),
  /** ยกเลิกเซสชันการลงนามก่อนกำหนด */
  revokeSignSession: () =>
    request<{ ok: boolean }>('/auth/sign-session/revoke', {
      method: 'POST',
    }),

  // ========================================================
  // 3. หมวดทรัพยากรราชการและตรวจสอบความว่าง (Resources)
  // ========================================================
  /** ดึงรายชื่อสถานที่ราชการทั้งหมด (ห้องประชุม, สนามกีฬา, อาคาร) */
  venues: () => request<Venue[]>('/resources/venues'),
  /** ดึงรายชื่ออุปกรณ์และพัสดุราชการทั้งหมด (เต็นท์, โต๊ะ, เก้าอี้, เครื่องเสียง) */
  equipment: () => request<Equipment[]>('/resources/equipment'),
  /** เพิ่มสถานที่ราชการใหม่ */
  createVenue: (payload: Partial<Venue>) =>
    request<Venue>('/resources/venues', { method: 'POST', body: JSON.stringify(payload) }),
  /** แก้ไขข้อมูลสถานที่ราชการ */
  updateVenue: (id: string, payload: Partial<Venue>) =>
    request<Venue>(`/resources/venues/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  /** ลบสถานที่ราชการ */
  deleteVenue: (id: string) =>
    request<{ ok: boolean; id: string }>(`/resources/venues/${id}`, { method: 'DELETE' }),
  /** เพิ่มรายการอุปกรณ์ใหม่ */
  createEquipment: (payload: Partial<Equipment>) =>
    request<Equipment>('/resources/equipment', { method: 'POST', body: JSON.stringify(payload) }),
  /** แก้ไขข้อมูลอุปกรณ์และจำนวนสต็อก */
  updateEquipment: (id: string, payload: Partial<Equipment>) =>
    request<Equipment>(`/resources/equipment/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  /** ลบรายการอุปกรณ์ */
  deleteEquipment: (id: string) =>
    request<{ ok: boolean; id: string }>(`/resources/equipment/${id}`, { method: 'DELETE' }),
  /** ดึงปฏิทินความว่างของสถานที่รายเดือน */
  availability: (venueIds: string[], month: string) =>
    request<DayAvailability[]>(`/resources/availability?venueIds=${venueIds.join(',')}&month=${month}`),
  /** ตรวจสอบช่วงเวลาที่ชนกัน (Slot Conflict Check) สำหรับการจองสถานที่ */
  checkConflicts: (venueIds: string[], periods: Period[], excludeRequestId?: string) =>
    request<{ conflicts: ConflictInfo[] }>('/resources/check-conflicts', {
      method: 'POST',
      body: JSON.stringify({ venueIds, periods, excludeRequestId }),
    }),
  /** ตรวจสอบสต็อกอุปกรณ์คงเหลือแบบ Real-time ตลอดช่วงเวลายืม-คืน */
  checkEquipmentAvailability: (params: {
    items: { equipmentId: string; qty: number }[];
    pickupDate?: string;
    returnDate?: string;
    periods?: Period[];
    month?: string;
    excludeRequestId?: string;
  }) =>
    request<{
      isAvailable: boolean;
      dayAvailability: (DayAvailability & {
        isConflict: boolean;
        details: {
          equipmentId: string;
          name: string;
          requestedQty: number;
          reservedQty: number;
          availableQty: number;
          totalStock: number;
        }[];
      })[];
      summary: {
        equipmentId: string;
        name: string;
        requestedQty: number;
        maxReservedInPeriod: number;
        minAvailableInPeriod: number;
        totalStock: number;
        isShortage: boolean;
      }[];
    }>('/resources/check-equipment-availability', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // ========================================================
  // 4. หมวดคำขอรับบริการและวงจรเอกสาร (Requests & Lifecycle)
  // ========================================================
  /** ดึงรายการคำขอทั้งหมด พร้อมตัวกรอง (คำขอของฉัน, ประเภท, คิวเจ้าหน้าที่/ผู้อนุมัติ) */
  listRequests: (params?: { mine?: boolean; type?: RequestType; queue?: 'staff' | 'l2' | 'l1' | 'handover' }) => {
    const qs = new URLSearchParams();
    if (params?.mine) qs.set('mine', '1');
    if (params?.type) qs.set('type', params.type);
    if (params?.queue) qs.set('queue', params.queue);
    const s = qs.toString();
    return request<RequestWithTimeline[]>(`/requests${s ? `?${s}` : ''}`);
  },
  /** ดึงรายละเอียดคำขอฉบับสมบูรณ์ พร้อมเส้นเวลาการดำเนินการ (Timeline) และบันทึกการส่งมอบ */
  getRequest: (id: string) => request<RequestWithTimeline & { handovers?: HandoverRecord[] }>(`/requests/${id}`),
  /** สร้างคำขอใช้สถานที่ราชการ (Booking Request) */
  createBooking: (payload: {
    venueIds: string[];
    periods: Period[];
    attendees?: number;
    activity?: string;
    purpose?: string;
    organization?: string;
    attachments?: string[];
    extraItems?: ItemQty[];
    requesterId?: string;
    requesterName?: string;
    requesterPhone?: string;
    requesterSignature?: string;
    createdByStaffSignature?: string;
    writtenAt?: string;
    requesterPosition?: string;
    addressHouseNo?: string;
    addressMoo?: string;
    addressProvinceId?: string;
    addressDistrictId?: string;
    addressSubdistrictId?: string;
    addressSubdistrict?: string;
    addressDistrict?: string;
    addressProvince?: string;
    purposeItems?: { item: string; forWhat: string }[];
  }) => request<RequestWithTimeline>('/requests/booking', { method: 'POST', body: JSON.stringify(payload) }),
  /** สร้างคำขอยืมอุปกรณ์ราชการ (Borrow Request) */
  createBorrow: (payload: {
    items: ItemQty[];
    pickupDate: string;
    returnDate: string;
    purpose?: string;
    organization?: string;
    attachments?: string[];
    requesterId?: string;
    requesterName?: string;
    requesterPhone?: string;
    requesterSignature?: string;
    createdByStaffSignature?: string;
    writtenAt?: string;
    requesterPosition?: string;
    addressHouseNo?: string;
    addressMoo?: string;
    addressProvinceId?: string;
    addressDistrictId?: string;
    addressSubdistrictId?: string;
    addressSubdistrict?: string;
    addressDistrict?: string;
    addressProvince?: string;
    purposeItems?: { item: string; forWhat: string }[];
  }) => request<RequestWithTimeline>('/requests/borrow', { method: 'POST', body: JSON.stringify(payload) }),
  /** สร้างคำขอแจ้งซ่อมบำรุงพัสดุและสิ่งปลูกสร้าง (Repair Fast-Ticket) */
  createRepair: (payload: {
    building: string;
    floor: string;
    location: string;
    category: string;
    detail: string;
    photos?: number;
    attachments?: string[];
    requesterId?: string;
    requesterName?: string;
    requesterPhone?: string;
    organization?: string;
    requesterSignature?: string;
    createdByStaffSignature?: string;
  }) => request<RequestWithTimeline>('/requests/repair', { method: 'POST', body: JSON.stringify(payload) }),
  /** ลงนามอนุมัติหรือปฏิเสธคำขอ (Sign & Approve/Reject) */
  signRequest: (id: string, payload: { decision: 'approve' | 'reject'; note?: string; pin?: string; signature?: string }) =>
    request<RequestWithTimeline>(`/requests/${id}/sign`, { method: 'POST', body: JSON.stringify(payload) }),
  /** ยื่นขอเลื่อนกำหนดวัน-เวลาใช้บริการ */
  reschedule: (
    id: string,
    payload: Period[] | { periods?: Period[]; pickupDate?: string; returnDate?: string },
  ) =>
    request<RequestWithTimeline>(`/requests/${id}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(Array.isArray(payload) ? { periods: payload } : payload),
    }),
  /** ขอยกเลิกคำขอรับบริการ */
  cancelRequest: (id: string, reason?: string) =>
    request<RequestWithTimeline>(`/requests/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  /** แจ้งความประสงค์ส่งคืนอุปกรณ์ยืมก่อนหรือตามกำหนด */
  returnRequest: (id: string) =>
    request<RequestWithTimeline>(`/requests/${id}/return-request`, { method: 'POST', body: JSON.stringify({}) }),
  /** เจ้าหน้าที่บันทึกการส่งมอบอุปกรณ์ให้ประชาชนนำไปใช้งาน */
  receiveEquipment: (id: string, payload: { photos?: string[]; note?: string }) =>
    request<RequestWithTimeline>(`/requests/${id}/receive`, { method: 'POST', body: JSON.stringify(payload) }),
  /** ประชาชนส่งคืนอุปกรณ์ราชการเข้าระบบ */
  submitReturnEquipment: (id: string, payload: { photos?: string[]; note?: string }) =>
    request<RequestWithTimeline>(`/requests/${id}/return-submit`, { method: 'POST', body: JSON.stringify(payload) }),
  /** เจ้าหน้าที่ตรวจรับสภาพอุปกรณ์คืน (ปกติ, ชำรุด, สูญหาย/ไม่ครบ) */
  inspectReturnEquipment: (
    id: string,
    payload: { result: 'normal' | 'damaged' | 'incomplete'; note?: string; photos?: string[] },
  ) =>
    request<RequestWithTimeline>(`/requests/${id}/inspect-return`, { method: 'POST', body: JSON.stringify(payload) }),
  /** บันทึกรายงานการตรวจรับ-ส่งมอบสถานที่ราชการ (ก่อนใช้/หลังใช้) พร้อมลายเซ็น 2 ฝ่าย */
  handover: (
    id: string,
    payload: {
      phase: 'before' | 'after';
      items: { label: string; ok: boolean }[];
      note?: string;
      citizenSignature?: string;
      staffSignature?: string;
    },
  ) => request<RequestWithTimeline>(`/requests/${id}/handover`, { method: 'POST', body: JSON.stringify(payload) }),
  /** ปรับปรุงสถานะงานแจ้งซ่อม (รับงาน, เสร็จสิ้น, ยืนยัน, เปิดซ่อมใหม่, ปฏิเสธ) */
  updateRepairStatus: (
    id: string,
    payload: {
      action: 'accept' | 'finish' | 'confirm' | 'reopen' | 'reject';
      resolution?: string;
      reason?: string;
      signature?: string;
      pin?: string;
      afterPhotos?: string[];
    },
  ) => request<RequestWithTimeline>(`/requests/${id}/repair-status`, { method: 'POST', body: JSON.stringify(payload) }),

  // ========================================================
  // 5. หมวดผู้ดูแลระบบ รายงาน และการแจ้งเตือน (Admin & Reports)
  // ========================================================
  /** ดึงรายชื่อผู้ใช้ทั้งหมดในระบบ พร้อมค้นหาตามชื่อ/บทบาท */
  users: (q?: string, role?: Role) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (role) qs.set('role', role);
    const s = qs.toString();
    return request<PublicAccount[]>(`/users${s ? `?${s}` : ''}`);
  },
  /** อัปเดตสิทธิ์ย่อย บทบาท สถานะการใช้งาน หรือรหัสผ่านของผู้ใช้ (RBAC Admin) */
  updatePermissions: (
    id: string,
    payload: {
      role?: Role;
      permissions?: Partial<Record<PermissionKey, boolean>>;
      active?: boolean;
      name?: string;
      nickname?: string;
      position?: string;
      department?: string;
      phone?: string;
      lineName?: string;
      newPassword?: string;
    },
  ) => request<PublicAccount>(`/users/${id}/permissions`, { method: 'PATCH', body: JSON.stringify(payload) }),
  /** ดึงข้อมูลสรุปแดชบอร์ดผู้บริหาร (จำนวนผู้ใช้, ทรัพยากร, คำขอประจำเดือน, กิจกรรมล่าสุด) */
  adminOverview: () =>
    request<{
      usersCount: number;
      resourcesCount: number;
      monthRequestsCount: number;
      todayRequestsCount?: number;
      pendingCount?: number;
      dueReturnCount?: number;
      activities: ActivityLog[];
    }>('/admin/overview'),
  /** ดึงรายการแจ้งเตือนทั้งหมดของผู้ใช้ */
  notifications: () => request<AppNotification[]>('/notifications'),
  /** ดึงจำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน */
  getUnreadCount: () => request<{ unreadCount: number }>('/notifications/unread-count'),
  /** ทำเครื่องหมายการแจ้งเตือนว่าอ่านแล้ว */
  markNotificationRead: (id: string) =>
    request<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH' }),
  /** ทำเครื่องหมายการแจ้งเตือนทั้งหมดว่าอ่านแล้ว */
  readAllNotifications: () => request<{ ok: boolean }>('/notifications/read-all', { method: 'POST', body: '{}' }),
  /** ดึงการตั้งค่าช่องทางรับแจ้งเตือนของผู้ใช้ (In-App, LINE, Email) */
  getNotificationPreferences: () =>
    request<{ preferences: UserNotificationPreference[] }>('/notifications/preferences'),
  /** บันทึกการตั้งค่าช่องทางรับแจ้งเตือนของผู้ใช้ */
  updateNotificationPreferences: (
    preferences: { channel: NotificationChannel; notificationType: NotificationCategory; isEnabled: boolean }[],
  ) =>
    request<{ ok: boolean; preferences: UserNotificationPreference[] }>('/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ preferences }),
    }),
  /** ดึงสถานะการเชื่อมต่อ LINE Messaging API สำหรับแจ้งเตือน */
  getLineNotificationStatus: () =>
    request<LineNotificationStatusResponse>('/line/notification/status'),
  /** ส่งข้อความแจ้งเตือนทดสอบผ่าน LINE */
  testLineNotification: (payload?: { userId?: string; useFlex?: boolean }) =>
    request<{ ok: boolean; inAppNotification?: AppNotification; lineLog?: LineNotificationLog }>(
      '/line/notification/test',
      { method: 'POST', body: JSON.stringify(payload || {}) },
    ),
  /** ดึงประวัติ Log การส่งแจ้งเตือนผ่าน LINE สำหรับผู้ดูแลระบบ */
  getAdminNotificationLogs: (status?: LineDeliveryStatus, limit?: number) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (limit) q.set('limit', String(limit));
    const qs = q.toString();
    return request<AdminNotificationDashboardSummary>(`/admin/notifications/logs${qs ? `?${qs}` : ''}`);
  },
  /** ดึงรายการแจ้งเตือนที่จัดส่งไม่สำเร็จ */
  getAdminFailedNotifications: (limit?: number) =>
    request<{ failedCount: number; logs: LineNotificationLog[] }>(
      `/admin/notifications/failed${limit ? `?limit=${limit}` : ''}`,
    ),
  /** สั่งส่งข้อความแจ้งเตือนที่เคยล้มเหลวซ้ำอีกครั้ง (Retry) */
  retryNotification: (id: string) =>
    request<{ ok: boolean; log: LineNotificationLog }>(`/admin/notifications/${id}/retry`, {
      method: 'POST',
    }),
  /** รีเซ็ตข้อมูลจำลองสำหรับโหมดพัฒนา */
  resetDemo: () => request<{ ok: boolean }>('/dev/reset', { method: 'POST', body: '{}' }),

  // ========================================================
  // 6. หมวดจัดการบริการและเมนูนำทาง (Dynamic Services & Navigation)
  // ========================================================
  /** ดึงรายการเมนูนำทางปัจจุบัน */
  getNavigation: () => request<SidebarServiceItem[]>('/navigation'),
  /** ดึงรายการบริการทั้งหมดสำหรับหน้าตั้งค่าของผู้ดูแลระบบ */
  adminServices: () => request<SidebarServiceItem[]>('/admin/services'),
  /** ดึงข้อมูลบริการเดี่ยวตาม ID */
  adminService: (id: string) => request<SidebarServiceItem>(`/admin/services/${id}`),
  /** สร้างบริการใหม่ในระบบ */
  createService: (dto: CreateSidebarServiceDto) =>
    request<SidebarServiceItem>('/admin/services', { method: 'POST', body: JSON.stringify(dto) }),
  /** แก้ไขการตั้งค่าบริการ */
  updateService: (id: string, dto: UpdateSidebarServiceDto) =>
    request<SidebarServiceItem>(`/admin/services/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
  /** สลับเปิด/ปิดการใช้งานบริการ */
  toggleService: (id: string) =>
    request<SidebarServiceItem>(`/admin/services/${id}/toggle`, { method: 'PATCH' }),
  /** บันทึกลำดับการแสดงผลเมนูบริการใหม่ (Drag & Drop Reorder) */
  reorderServices: (items: { id: string; sortOrder: number; category?: string }[]) =>
    request<{ success: boolean; count: number }>('/admin/services/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    }),
  /** ตรวจสอบความเชื่อมโยงก่อนลบบริการ (ป้องกันคำขอหรือเอกสารตกค้าง) */
  checkDeleteService: (id: string) =>
    request<ServiceRelationCheckResult>(`/admin/services/${id}/check-delete`),
  /** ลบบริการออกจากระบบ */
  deleteService: (id: string) =>
    request<{ success: boolean; message: string }>(`/admin/services/${id}`, { method: 'DELETE' }),
  /** ดูตัวอย่างการแสดงผลเมนูตามบทบาทผู้ใช้จำลอง */
  previewNavigation: (role?: Role) =>
    request<SidebarServiceItem[]>(`/admin/services/preview${role ? `?role=${role}` : ''}`),

  // ========================================================
  // 7. หมวดจัดการบทบาทผู้ใช้งาน (Role Management)
  // ========================================================
  /** ดึงรายชื่อบทบาททั้งหมดในระบบ */
  getRoles: () => request<RoleItem[]>('/admin/roles'),
  /** สร้างบทบาทใหม่ */
  createRole: (dto: CreateRoleDto) =>
    request<RoleItem>('/admin/roles', { method: 'POST', body: JSON.stringify(dto) }),
  /** แก้ไขรายละเอียดบทบาท */
  updateRole: (id: string, dto: UpdateRoleDto) =>
    request<RoleItem>(`/admin/roles/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
  /** สลับเปิด/ปิดบทบาท */
  toggleRole: (id: string) =>
    request<RoleItem>(`/admin/roles/${id}/toggle`, { method: 'PATCH' }),
  /** ลบบทบาท */
  deleteRole: (id: string) =>
    request<{ ok: boolean }>(`/admin/roles/${id}`, { method: 'DELETE' }),
  /** กำหนดบทบาทให้ผู้ใช้พร้อมกันหลายคน (Bulk Role Assignment) */
  bulkAssignRole: (userIds: string[], role: Role) =>
    request<{ updatedCount: number; errors: string[] }>('/admin/roles/bulk-assign', {
      method: 'POST',
      body: JSON.stringify({ userIds, role }),
    }),

  // ========================================================
  // 8. หมวดตรวจสอบเอกสารดิจิทัลและ QR Code (Document Verification)
  // ========================================================
  /** ดึงข้อมูลการตรวจสอบเอกสารดิจิทัล */
  getVerification: (documentId: string) =>
    request<DocumentVerification | null>(`/documents/${documentId}/verification`),
  /** สร้างหรือออกโทเค็นตรวจสอบเอกสารและ QR Code ใหม่ */
  createVerification: (
    documentId: string,
    payload?: { documentType?: string; title?: string; forceNew?: boolean },
  ) =>
    request<DocumentVerification>(`/documents/${documentId}/verification`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  /** เพิกถอนการรับรองเอกสารดิจิทัล */
  revokeVerification: (documentId: string, reason: string) =>
    request<DocumentVerification>(`/documents/${documentId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  /** ตรวจสอบความถูกต้องของเอกสารสาธารณะผ่าน Token (สำหรับประชาชนสแกน QR) */
  publicVerify: (token: string) =>
    request<PublicVerificationResult>(`/public/verify/${token}`),
  /** เจ้าหน้าที่สแกนตรวจสอบเอกสารราชการเชิงลึก */
  staffVerify: (query: string) =>
    request<StaffVerificationResult>('/staff/documents/verify', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),
  /** ดึงประวัติการสแกนตรวจสอบเอกสารของเจ้าหน้าที่ */
  staffVerifyHistory: (limit = 50) =>
    request<DocumentScanLog[]>(`/staff/documents/verify-history?limit=${limit}`),

  // ========================================================
  // 9. หมวดจัดการ LINE Rich Menu & Flex Templates
  // ========================================================
  /** ดึงรายชื่อ Rich Menu ทั้งหมด */
  getRichMenus: () =>
    request<any[]>('/admin/line/rich-menus'),
  /** ดึงข้อมูล Rich Menu เดี่ยว */
  getRichMenu: (id: string) =>
    request<any>(`/admin/line/rich-menus/${encodeURIComponent(id)}`),
  /** สร้าง Rich Menu ใหม่ */
  createRichMenu: (data: any) =>
    request<any>('/admin/line/rich-menus', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  /** แก้ไขการตั้งค่า Rich Menu */
  updateRichMenu: (id: string, data: any) =>
    request<any>(`/admin/line/rich-menus/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  /** ลบ Rich Menu */
  deleteRichMenu: (id: string) =>
    request<{ success: boolean }>(`/admin/line/rich-menus/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  /** ติดตั้งชุด Rich Menu เริ่มต้นของ อบต. */
  initDefaultRichMenus: () =>
    request<{ success: boolean; message: string }>('/admin/line/rich-menus/init-defaults', {
      method: 'POST',
    }),
  /** เผยแพร่ Rich Menu ขึ้นระบบ LINE Official Account */
  publishRichMenu: (id: string) =>
    request<any>(`/admin/line/rich-menus/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
    }),
  /** กำหนด Rich Menu นี้เป็นค่าเริ่มต้นสำหรับผู้ใช้ทุกคน */
  setDefaultRichMenu: (id: string) =>
    request<any>(`/admin/line/rich-menus/${encodeURIComponent(id)}/set-default`, {
      method: 'POST',
    }),
  /** อัปโหลดภาพกราฟิก Rich Menu ไปยัง LINE Messaging API */
  uploadRichMenuImage: (id: string, imageData: string, mimeType: string) =>
    request<{ success: boolean; width: number; height: number }>(
      `/admin/line/rich-menus/${encodeURIComponent(id)}/upload-image`,
      {
        method: 'POST',
        body: JSON.stringify({ imageData, mimeType }),
      },
    ),
  /** ผูก Rich Menu เฉพาะบุคคลกับบัญชี LINE */
  linkRichMenuUser: (lineUserId: string, richMenuId: string) =>
    request<{ success: boolean }>('/admin/line/rich-menus/link-user', {
      method: 'POST',
      body: JSON.stringify({ lineUserId, richMenuId }),
    }),
  /** ยกเลิกการผูก Rich Menu เฉพาะบุคคล */
  unlinkRichMenuUser: (lineUserId: string) =>
    request<{ success: boolean }>('/admin/line/rich-menus/unlink-user', {
      method: 'POST',
      body: JSON.stringify({ lineUserId }),
    }),
  /** สลับ Rich Menu ตามบทบาทของผู้ใช้ */
  switchUserRole: (lineUserId: string, role?: string) =>
    request<{ switched: boolean; menuType: string; richMenuId?: string }>(
      '/admin/line/rich-menus/switch-user-role',
      {
        method: 'POST',
        body: JSON.stringify({ lineUserId, role }),
      },
    ),
  /** ดึงรายการ Flex Message Templates ทั้งหมด */
  getFlexTemplates: () =>
    request<any[]>('/admin/line/flex-templates'),
  /** บันทึกหรือสร้าง Flex Template ใหม่ */
  upsertFlexTemplate: (dto: any) =>
    request<any>('/admin/line/flex-templates', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
  /** ดูตัวอย่างการแสดงผล Flex Message ด้วยข้อมูลจำลอง */
  previewFlexTemplate: (eventType: string, sampleData?: any) =>
    request<any>('/admin/line/flex-templates/preview', {
      method: 'POST',
      body: JSON.stringify({ eventType, sampleData }),
    }),

  // ========================================================
  // 10. หมวดแม่แบบเอกสารราชการและประวัติเอกสาร (Templates & Docs)
  // ========================================================
  /** ดึงรายการแม่แบบเอกสารราชการ (Document Templates) */
  listDocumentTemplates: (params?: { category?: string; status?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.category) q.set('category', params.category);
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return request<DocumentTemplateItem[]>(`/document-templates${qs ? `?${qs}` : ''}`);
  },
  /** ดึงรายละเอียดแม่แบบเอกสารเดี่ยว */
  getDocumentTemplate: (id: string) =>
    request<DocumentTemplateItem>(`/document-templates/${id}`),
  /** สร้างแม่แบบเอกสารราชการใหม่ */
  createDocumentTemplate: (data: Partial<DocumentTemplateItem> & { name: string }) =>
    request<DocumentTemplateItem>('/document-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  /** แก้ไขแม่แบบเอกสารราชการ */
  updateDocumentTemplate: (id: string, data: Partial<DocumentTemplateItem>) =>
    request<DocumentTemplateItem>(`/document-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  /** ลบแม่แบบเอกสาร */
  deleteDocumentTemplate: (id: string) =>
    request<{ success: boolean; id: string }>(`/document-templates/${id}`, {
      method: 'DELETE',
    }),
  /** คัดลอกแม่แบบเอกสาร (Duplicate) */
  duplicateDocumentTemplate: (id: string) =>
    request<DocumentTemplateItem>(`/document-templates/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  /** เผยแพร่แม่แบบเอกสารเพื่อใช้งานจริง */
  publishDocumentTemplate: (id: string, note?: string) =>
    request<DocumentTemplateItem>(`/document-templates/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  /** ย้ายแม่แบบเอกสารเข้าที่จัดเก็บถาวร (Archive) */
  archiveDocumentTemplate: (id: string) =>
    request<DocumentTemplateItem>(`/document-templates/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  /** ดึงประวัติเวอร์ชันของแม่แบบเอกสาร */
  listTemplateVersions: (id: string) =>
    request<DocumentTemplateVersionItem[]>(`/document-templates/${id}/versions`),
  /** ดึงข้อมูลแม่แบบเวอร์ชันที่ระบุ */
  getTemplateVersion: (id: string, version: number) =>
    request<DocumentTemplateVersionItem>(`/document-templates/${id}/versions/${version}`),
  /** ย้อนคืนแม่แบบเอกสารไปยังเวอร์ชันในอดีต (Rollback) */
  rollbackTemplateVersion: (id: string, version: number) =>
    request<DocumentTemplateItem>(`/document-templates/${id}/versions/${version}/rollback`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  /** ดึงรายการเอกสารราชการที่ถูกสร้างแล้ว */
  listGeneratedDocuments: (params?: { requestId?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.requestId) q.set('requestId', params.requestId);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return request<GeneratedDocumentItem[]>(`/documents${qs ? `?${qs}` : ''}`);
  },
  /** ดึงรายละเอียดเอกสารราชการที่ถูกสร้างเดี่ยว */
  getGeneratedDocument: (id: string) =>
    request<GeneratedDocumentItem>(`/documents/${id}`),
  /** สั่งสร้างเอกสารราชการฉบับทางการจากคำขอและแม่แบบ */
  generateDocument: (data: { templateId: string; requestId: string; documentNumber?: string }) =>
    request<GeneratedDocumentItem>('/documents/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ========================================================
// 11. ฟังก์ชันช่วยจัดรูปแบบวันที่และเวลาภาษาไทย (Thai Date Helpers)
// ========================================================
// ชื่อย่อเดือนภาษาไทย
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// ชื่อเต็มเดือนภาษาไทย
const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

/**
 * แปลง ISO Date String เป็นรูปแบบวันที่ภาษาไทย พ.ศ. (เช่น "12 มี.ค. 2569")
 */
export function formatThaiDate(iso?: string, withYear = true): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = THAI_MONTHS_SHORT[d.getMonth()];
  // แปลง ค.ศ. เป็น พ.ศ. โดยบวก 543
  const year = d.getFullYear() + 543;
  return withYear ? `${day} ${month} ${year}` : `${day} ${month}`;
}

/**
 * แปลง ISO Date String เป็นรูปแบบวันที่และเวลาภาษาไทย (เช่น "12 มี.ค. · 09:30")
 */
export function formatThaiDateTime(iso?: string, withYear = false): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatThaiDate(iso, withYear)} · ${hh}:${mm}`;
}

/**
 * จัดรูปแบบช่วงเวลาบริการ (เช่น "12 มี.ค. 2569 · 08:30–16:30")
 */
export function formatPeriodRange(p: Period): string {
  const s = new Date(p.start);
  const e = new Date(p.end);
  const sameDay = s.toDateString() === e.toDateString();
  const sh = `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
  const eh = `${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
  if (sameDay) {
    return `${formatThaiDate(p.start, true)} · ${sh}–${eh}`;
  }
  return `${formatThaiDate(p.start, false)} ${sh} – ${formatThaiDate(p.end, true)} ${eh}`;
}

/**
 * จัดรูปแบบหัวข้อเดือน พ.ศ. (เช่น "มีนาคม 2569")
 */
export function formatMonthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${THAI_MONTHS_FULL[(m || 1) - 1]} ${(y || 2026) + 543}`;
}

/**
 * อ่านไฟล์รูปภาพจาก <input type="file"> และย่อขนาดอัตโนมัติ (สูงสุด 1000px) เป็น Data URL
 * ช่วยลดขนาดก่อนอัปโหลด ป้องกันปัญหา Bandwidth บนมือถือ
 */
export async function readAndCompressImages(
  fileList: FileList | File[] | null,
  maxCount = 3,
): Promise<string[]> {
  if (!fileList) return [];
  const files = Array.from(fileList)
    .filter((f) => f.type.startsWith('image/'))
    .slice(0, maxCount);

  const readSingle = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
      reader.onload = () => {
        const rawDataUrl = String(reader.result || '');
        const img = new Image();
        img.onerror = () => resolve(rawDataUrl);
        img.onload = () => {
          try {
            const maxDim = 1000;
            let { width, height } = img;
            // คำนวณสัดส่วนใหม่หากด้านใดด้านหนึ่งเกิน 1000px
            if (width > maxDim || height > maxDim) {
              if (width >= height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            // วาดรูปลง HTML5 Canvas เพื่อบีบอัดเป็น JPEG คุณภาพ 82%
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(rawDataUrl);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } catch {
            resolve(rawDataUrl);
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });

  return Promise.all(files.map(readSingle));
}
