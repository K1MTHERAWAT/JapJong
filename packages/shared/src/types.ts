// ===== Roles & accounts =====
export type Role = 'USER' | 'STAFF' | 'APPROVER_L2' | 'APPROVER_L1' | 'ADMIN';

export type PermissionKey =
  | 'review'
  | 'handover'
  | 'walkIn'
  | 'manageResources'
  | 'sign'
  | 'manageUsers';

export interface Account {
  id: string;
  username: string;
  password: string;
  name: string;
  nickname: string;
  initial: string;
  role: Role;
  position: string;
  department: string;
  phone: string;
  lineName?: string;
  lineUserId?: string;
  email?: string;
  emailVerified?: boolean;
  addressHouseNo?: string;
  addressMoo?: string;
  addressSubdistrict?: string;
  addressDistrict?: string;
  addressProvince?: string;
  permissions: Record<PermissionKey, boolean>;
  /** ข้อความ/ภาพลายเซ็น (data URL) — null = ยังไม่ตั้งค่า */
  signature: string | null;
  pin: string | null;
  /** บัญชีสำหรับโหมดเดโม (เฉพาะโหมดเดโมเท่านั้นที่ล็อกอิน one-click ได้) */
  isDemo?: boolean;
  /** สถานะเปิด/ปิดการใช้งานบัญชี (ค่าเริ่มต้น = true) */
  active?: boolean;
  registrationCompletedAt?: string;
  accountStatus?: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
}

export type PublicAccount = Omit<Account, 'password' | 'pin'> & { hasPin: boolean };

export interface DemoAccountSummary {
  id: string;
  name: string;
  role: Role;
  position: string;
  department: string;
  initial: string;
  nickname: string;
}

// ===== Resources =====
export type VenueType = 'meeting' | 'pavilion' | 'field' | 'yard' | 'training';

export interface Venue {
  id: string;
  name: string;
  type: VenueType;
  building: string;
  floor: string;
  capacity: number;
  status: 'available' | 'maintenance';
  enabled: boolean;
  facilities: string[];
  openTime: string;
  closeTime: string;
  /** 0 = อาทิตย์ … 6 = เสาร์ */
  openDays: number[];
  advanceDays: number;
  formName: string;
  approvalLevels: number;
}

export type EquipmentCategory = 'audio' | 'tent' | 'it';

export interface Equipment {
  id: string;
  name: string;
  category: EquipmentCategory;
  stock: number;
  enabled: boolean;
}

// ===== Requests =====
export interface Period {
  start: string;
  end: string;
}

export type RequestType = 'booking' | 'borrow' | 'repair';

export type RequestStatus =
  | 'pending_staff'
  | 'pending_l2'
  | 'pending_l1'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'borrowing'
  | 'return_inspect'
  | 'returned'
  | 'repair_submitted'
  | 'repair_in_progress'
  | 'repair_awaiting_acceptance'
  | 'repair_done';

export type SignLevel = 'staff' | 'l2' | 'l1';

export interface SignatureRecord {
  level: SignLevel;
  signerId: string;
  signerName: string;
  title: string;
  at: string;
  decision: 'approve' | 'reject';
  /** ภาพลายเซ็นที่วาดด้วยมือ (data:image/...) */
  signature?: string;
  note?: string;
  round?: number;
}

export interface TimelineStep {
  key: string;
  label: string;
  at?: string;
  note?: string;
  state: 'done' | 'current' | 'todo' | 'rejected';
}

export interface ItemQty {
  equipmentId: string;
  qty: number;
}

export interface OfficialFormPurposeItem {
  item: string;
  forWhat: string;
}

interface BaseRequest {
  id: string;
  code: string;
  status: RequestStatus;
  requesterId: string;
  requesterName: string;
  organization: string;
  createdAt: string;
  updatedAt: string;
  approvalRound?: number;
  /** ลายเซ็นผู้ยื่นคำขอ (วาดบนหน้าจอ data:image/...) */
  requesterSignature?: string;
  /** เจ้าหน้าที่ที่กรอกแทนที่เคาน์เตอร์ */
  createdByStaffId?: string;
  /** ลายเซ็นเจ้าหน้าที่ผู้กรอกแทนที่เคาน์เตอร์ */
  createdByStaffSignature?: string;
  rejectReason?: string;
  /** ข้อมูลตามแบบขอใช้สถานที่ราชการ (Official Government Form) */
  writtenAt?: string;
  requesterPosition?: string;
  addressHouseNo?: string;
  addressMoo?: string;
  addressSubdistrict?: string;
  addressDistrict?: string;
  addressProvince?: string;
  purposeItems?: OfficialFormPurposeItem[];
}

export interface BookingRequest extends BaseRequest {
  type: 'booking';
  venueIds: string[];
  periods: Period[];
  attendees: number;
  activity: string;
  purpose: string;
  attachments: string[];
  extraItems: ItemQty[];
  signatures: SignatureRecord[];
  rescheduleTo?: Period[];
}

export interface BorrowRequest extends BaseRequest {
  type: 'borrow';
  items: ItemQty[];
  pickupDate: string;
  returnDate: string;
  purpose: string;
  attachments: string[];
  signatures: SignatureRecord[];
  returnRequestedAt?: string;
  returnedAt?: string;
}

export interface RepairRequest extends BaseRequest {
  type: 'repair';
  building: string;
  floor: string;
  location: string;
  category: string;
  detail: string;
  photos: number;
  acceptedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  resolution?: string;
  /** ลายเซ็นเจ้าหน้าที่ผู้รับเรื่อง/ซ่อมเสร็จ */
  staffSignature?: string;
  staffSignerName?: string;
  /** ลายเซ็นผู้แจ้งตรวจรับงานซ่อม */
  acceptanceSignature?: string;
  acceptedByRequesterAt?: string;
}

export type AnyRequest = BookingRequest | BorrowRequest | RepairRequest;

export type RequestWithTimeline = AnyRequest & {
  timeline: TimelineStep[];
  title: string;
  subtitle: string;
  handovers?: HandoverRecord[];
  handoverBefore?: HandoverRecord;
  handoverAfter?: HandoverRecord;
};

// ===== Others =====
export type NotificationChannel = 'IN_APP' | 'LINE';

export type NotificationCategory =
  | 'BOOKING_STATUS'
  | 'BORROW_STATUS'
  | 'BORROW_RETURN'
  | 'REPAIR_STATUS'
  | 'DOCUMENT_SIGNING'
  | 'SYSTEM';

export type NotificationReferenceType = 'booking' | 'borrow' | 'repair' | 'signing' | 'system';

export type LineDeliveryStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'SKIPPED';

export type LineFriendshipStatus = 'FRIEND' | 'UNFRIEND' | 'BLOCKED' | 'UNKNOWN';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  message?: string;
  notificationType?: NotificationCategory | string;
  referenceType?: NotificationReferenceType | string | null;
  referenceId?: string | null;
  at: string;
  createdAt?: string;
  read: boolean;
  isRead?: boolean;
  readAt?: string | null;
  link?: string;
}

export interface UserNotificationPreference {
  id: string;
  userId: string;
  channel: NotificationChannel;
  notificationType: NotificationCategory;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LineNotificationLog {
  id: string;
  userId: string;
  userName?: string;
  notificationId?: string | null;
  lineUserId: string;
  notificationType: string;
  eventKey?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  status: LineDeliveryStatus;
  providerMessageId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  attemptCount: number;
  sentAt?: string | null;
  createdAt: string;
}

export interface LineWebhookEventRecord {
  id: string;
  webhookEventId: string;
  eventType: string;
  lineUserId?: string | null;
  eventTimestamp: string;
  processedAt?: string | null;
  processingStatus: 'PROCESSED' | 'IGNORED' | 'FAILED';
  createdAt: string;
}

export interface LineNotificationStatusResponse {
  lineNotificationEnabled: boolean;
  isLinked: boolean;
  lineAccount?: {
    displayName: string;
    pictureUrl?: string | null;
    linkedAt: string;
    friendshipStatus: LineFriendshipStatus;
  } | null;
  oaBasicId?: string | null;
  addFriendUrl?: string | null;
}

export interface AdminNotificationDashboardSummary {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  skipped: number;
  logs: LineNotificationLog[];
}

export interface ActivityLog {
  id: string;
  kind: 'user' | 'role' | 'resource' | 'request';
  title: string;
  detail: string;
  actorId?: string;
  actorName?: string;
  actorRole?: Role;
  ip?: string;
  at: string;
}

export interface HandoverRecord {
  requestId: string;
  phase: 'before' | 'after';
  items: { label: string; ok: boolean }[];
  note: string;
  at: string;
  staffId: string;
  staffName?: string;
  /** ลายเซ็นผู้รับมอบ / ผู้ส่งคืน (ฝั่งผู้ยืม/ผู้ขอ) */
  citizenSignature?: string;
  /** ลายเซ็นเจ้าหน้าที่ผู้ส่งมอบ / ผู้ตรวจรับคืน */
  staffSignature?: string;
}

export interface DayAvailability {
  date: string; // YYYY-MM-DD
  level: 'many' | 'few' | 'full' | 'closed';
  bookedHours: number;
}

export interface ConflictInfo {
  periodIndex: number;
  venueId: string;
  venueName: string;
  start: string;
  end: string;
  code: string;
}

export interface LoginResponse {
  token: string;
  account: PublicAccount;
}

// ===== Document Verification & QR Code =====
export type VerificationStatus = 'VALID' | 'REVOKED' | 'INVALID' | 'NOT_FOUND';

export type VerificationDocumentType =
  | 'booking_request'
  | 'booking_permit'
  | 'borrow_request'
  | 'borrow_permit'
  | 'handover';

export interface DocumentVerification {
  id: string;
  documentId: string;
  verificationToken: string;
  documentNumber: string;
  documentHash: string;
  version: number;
  status: 'VALID' | 'REVOKED' | 'INVALID';
  documentType: VerificationDocumentType;
  title: string;
  issuingOrg: string;
  metadata?: Record<string, unknown>;
  qrCodeDataUrl?: string;
  verificationUrl?: string;
  issuedAt: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentScanLog {
  id: string;
  verificationId: string;
  scannedBy?: string;
  scannedByName?: string;
  scannedByRole?: string;
  result: VerificationStatus;
  note?: string;
  ip?: string;
  userAgent?: string;
  scannedAt: string;
  documentNumber?: string;
  documentTitle?: string;
}

export interface PublicVerificationResult {
  status: VerificationStatus;
  documentNumber?: string;
  documentType?: VerificationDocumentType;
  title?: string;
  issuingOrg?: string;
  issuedAt?: string;
  revokedAt?: string;
  version?: number;
  documentHash?: string;
  message?: string;
  requestStatus?: string;
}

export interface StaffVerificationResult extends PublicVerificationResult {
  documentId?: string;
  requesterName?: string;
  organization?: string;
  purpose?: string;
  signatures?: {
    level: string;
    title: string;
    signerName: string;
    decision: string;
    signedAt: string;
  }[];
  history?: DocumentScanLog[];
}

// ===================== Email OTP for Signing =====================

export interface SignSessionStatus {
  isVerified: boolean;
  expiresAt?: string;
  email?: string;
  maskedEmail?: string;
}

export interface RequestSignOtpResponse {
  ok: boolean;
  email: string;
  maskedEmail: string;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  demoOtp?: string;
}

export interface VerifySignOtpResponse {
  ok: boolean;
  verified: boolean;
  expiresAt: string;
  message?: string;
}

// ===================== LINE Authentication =====================

export interface UserLineAccount {
  id: string;
  userId: string;
  lineUserId: string;
  displayName: string;
  pictureUrl?: string | null;
  friendshipStatus?: LineFriendshipStatus;
  statusUpdatedAt?: string | null;
  linkedAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LineAuthStatusResponse {
  isLinked: boolean;
  lineAccount?: {
    lineUserId: string;
    displayName: string;
    pictureUrl?: string | null;
    linkedAt: string;
  } | null;
}

export interface LineAuthUrlResponse {
  url: string;
  state: string;
}

// ===================== PDPA Consent & LINE Registration =====================

export interface UserConsent {
  id: string;
  userId: string;
  consentType: string;
  consentVersion: string;
  consentStatus: 'GRANTED' | 'WITHDRAWN';
  consentedAt: string;
  withdrawnAt?: string | null;
  createdAt: string;
}

export interface ConsentItemInput {
  consentType: string;
  consentVersion: string;
  agreed: boolean;
}

export interface LineRegistrationTicketInfo {
  valid: boolean;
  lineProfile?: {
    displayName: string;
    pictureUrl?: string | null;
  };
  error?: string;
}

export interface LineRegisterPayload {
  ticket: string;
  name: string;
  phone: string;
  consents: ConsentItemInput[];
}


