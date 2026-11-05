import type {
  ActivityLog,
  AdminNotificationDashboardSummary,
  AppNotification,
  ConflictInfo,
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
  SignSessionStatus,
  StaffVerificationResult,
  UserNotificationPreference,
  Venue,
  VerifySignOtpResponse,
} from '@japjong/shared';

const TOKEN_KEY = 'japjong_token';
const ACCOUNT_KEY = 'japjong_account_id';
const LEGACY_TOKEN_KEY = 'jongwen_token';
const LEGACY_ACCOUNT_KEY = 'jongwen_account_id';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function setStoredAuth(token: string, accountId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ACCOUNT_KEY, accountId);
}

export function clearStoredAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ACCOUNT_KEY);
}

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
        // ignore
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

export const api = {
  // Auth & Demo
  demoAccounts: () => request<DemoAccountSummary[]>('/auth/demo-accounts'),
  demoLogin: (accountId: string) =>
    request<LoginResponse>('/auth/demo-login', { method: 'POST', body: JSON.stringify({ accountId }) }),
  login: (payload: { username: string; password: string }) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: JSON.stringify({}) }),
  getLineAuthUrl: () => request<LineAuthUrlResponse>('/auth/line?redirect=false'),
  getLineLinkUrl: () => request<LineAuthUrlResponse>('/auth/line/link-url'),
  unlinkLine: () => request<{ ok: boolean }>('/auth/line/unlink', { method: 'POST', body: JSON.stringify({}) }),
  getLineStatus: () => request<LineAuthStatusResponse>('/auth/line/status'),
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
  getLiffConfig: () =>
    request<{ liffId: string | null; channelId: string | null }>('/auth/line/liff/config'),
  getLineRegistrationStatus: (ticket: string) =>
    request<LineRegistrationTicketInfo>(`/auth/line/registration-status?ticket=${encodeURIComponent(ticket)}`),
  registerWithLine: (payload: LineRegisterPayload) =>
    request<LoginResponse>('/auth/line/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  lineLogout: () => request<{ ok: boolean }>('/auth/line/logout', { method: 'POST', body: JSON.stringify({}) }),
  getUsersMe: () => request<{ account: PublicAccount; lineAccount: any; consents: any[] }>('/users/me'),
  updateUsersMe: (payload: any) =>
    request<PublicAccount>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  withdrawConsent: (consentType: string) =>
    request<{ ok: boolean; withdrawn: boolean }>('/users/me/consents/withdraw', {
      method: 'POST',
      body: JSON.stringify({ consentType }),
    }),
  requestOtp: (phone: string) =>
    request<{ ok: boolean; message: string }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  register: (payload: {
    name: string;
    password: string;
    email?: string;
    phone?: string;
    otp?: string;
    lineName?: string;
    department?: string;
  }) => request<LoginResponse>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request<PublicAccount>('/auth/me'),
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
    addressSubdistrict?: string;
    addressDistrict?: string;
    addressProvince?: string;
  }) => request<PublicAccount>('/auth/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>('/auth/password', { method: 'POST', body: JSON.stringify(payload) }),
  saveSignature: (signature: string) =>
    request<PublicAccount>('/auth/signature', { method: 'POST', body: JSON.stringify({ signature }) }),
  savePin: (pin: string) =>
    request<PublicAccount>('/auth/pin', { method: 'POST', body: JSON.stringify({ pin }) }),
  verifyPin: (pin: string) =>
    request<{ ok: boolean }>('/auth/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  // Email OTP for Signing (Resend)
  requestSignOtp: (email?: string) =>
    request<RequestSignOtpResponse>('/auth/sign-otp/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  verifySignOtp: (otp: string) =>
    request<VerifySignOtpResponse>('/auth/sign-otp/verify', {
      method: 'POST',
      body: JSON.stringify({ otp }),
    }),
  getSignSessionStatus: () =>
    request<SignSessionStatus>('/auth/sign-session/status'),
  revokeSignSession: () =>
    request<{ ok: boolean }>('/auth/sign-session/revoke', {
      method: 'POST',
    }),

  // Resources
  venues: () => request<Venue[]>('/resources/venues'),
  equipment: () => request<Equipment[]>('/resources/equipment'),
  createVenue: (payload: Partial<Venue>) =>
    request<Venue>('/resources/venues', { method: 'POST', body: JSON.stringify(payload) }),
  updateVenue: (id: string, payload: Partial<Venue>) =>
    request<Venue>(`/resources/venues/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteVenue: (id: string) =>
    request<{ ok: boolean; id: string }>(`/resources/venues/${id}`, { method: 'DELETE' }),
  createEquipment: (payload: Partial<Equipment>) =>
    request<Equipment>('/resources/equipment', { method: 'POST', body: JSON.stringify(payload) }),
  updateEquipment: (id: string, payload: Partial<Equipment>) =>
    request<Equipment>(`/resources/equipment/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteEquipment: (id: string) =>
    request<{ ok: boolean; id: string }>(`/resources/equipment/${id}`, { method: 'DELETE' }),
  availability: (venueIds: string[], month: string) =>
    request<DayAvailability[]>(`/resources/availability?venueIds=${venueIds.join(',')}&month=${month}`),
  checkConflicts: (venueIds: string[], periods: Period[], excludeRequestId?: string) =>
    request<{ conflicts: ConflictInfo[] }>('/resources/check-conflicts', {
      method: 'POST',
      body: JSON.stringify({ venueIds, periods, excludeRequestId }),
    }),

  // Requests
  listRequests: (params?: { mine?: boolean; type?: RequestType; queue?: 'staff' | 'l2' | 'l1' | 'handover' }) => {
    const qs = new URLSearchParams();
    if (params?.mine) qs.set('mine', '1');
    if (params?.type) qs.set('type', params.type);
    if (params?.queue) qs.set('queue', params.queue);
    const s = qs.toString();
    return request<RequestWithTimeline[]>(`/requests${s ? `?${s}` : ''}`);
  },
  getRequest: (id: string) => request<RequestWithTimeline & { handovers?: HandoverRecord[] }>(`/requests/${id}`),
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
    addressSubdistrict?: string;
    addressDistrict?: string;
    addressProvince?: string;
    purposeItems?: { item: string; forWhat: string }[];
  }) => request<RequestWithTimeline>('/requests/booking', { method: 'POST', body: JSON.stringify(payload) }),
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
    addressSubdistrict?: string;
    addressDistrict?: string;
    addressProvince?: string;
    purposeItems?: { item: string; forWhat: string }[];
  }) => request<RequestWithTimeline>('/requests/borrow', { method: 'POST', body: JSON.stringify(payload) }),
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
  signRequest: (id: string, payload: { decision: 'approve' | 'reject'; note?: string; pin?: string; signature?: string }) =>
    request<RequestWithTimeline>(`/requests/${id}/sign`, { method: 'POST', body: JSON.stringify(payload) }),
  reschedule: (id: string, periods: Period[]) =>
    request<RequestWithTimeline>(`/requests/${id}/reschedule`, { method: 'POST', body: JSON.stringify({ periods }) }),
  cancelRequest: (id: string, reason?: string) =>
    request<RequestWithTimeline>(`/requests/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  returnRequest: (id: string) =>
    request<RequestWithTimeline>(`/requests/${id}/return-request`, { method: 'POST', body: JSON.stringify({}) }),
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
  updateRepairStatus: (
    id: string,
    payload: {
      action: 'accept' | 'finish' | 'confirm' | 'reopen';
      resolution?: string;
      signature?: string;
      pin?: string;
    },
  ) => request<RequestWithTimeline>(`/requests/${id}/repair-status`, { method: 'POST', body: JSON.stringify(payload) }),

  // Admin & reports
  users: (q?: string, role?: Role) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (role) qs.set('role', role);
    const s = qs.toString();
    return request<PublicAccount[]>(`/users${s ? `?${s}` : ''}`);
  },
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
  notifications: () => request<AppNotification[]>('/notifications'),
  getUnreadCount: () => request<{ unreadCount: number }>('/notifications/unread-count'),
  markNotificationRead: (id: string) =>
    request<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH' }),
  readAllNotifications: () => request<{ ok: boolean }>('/notifications/read-all', { method: 'POST', body: '{}' }),
  getNotificationPreferences: () =>
    request<{ preferences: UserNotificationPreference[] }>('/notifications/preferences'),
  updateNotificationPreferences: (
    preferences: { channel: NotificationChannel; notificationType: NotificationCategory; isEnabled: boolean }[],
  ) =>
    request<{ ok: boolean; preferences: UserNotificationPreference[] }>('/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ preferences }),
    }),
  getLineNotificationStatus: () =>
    request<LineNotificationStatusResponse>('/line/notification/status'),
  testLineNotification: (payload?: { userId?: string; useFlex?: boolean }) =>
    request<{ ok: boolean; inAppNotification?: AppNotification; lineLog?: LineNotificationLog }>(
      '/line/notification/test',
      { method: 'POST', body: JSON.stringify(payload || {}) },
    ),
  getAdminNotificationLogs: (status?: LineDeliveryStatus, limit?: number) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (limit) q.set('limit', String(limit));
    const qs = q.toString();
    return request<AdminNotificationDashboardSummary>(`/admin/notifications/logs${qs ? `?${qs}` : ''}`);
  },
  getAdminFailedNotifications: (limit?: number) =>
    request<{ failedCount: number; logs: LineNotificationLog[] }>(
      `/admin/notifications/failed${limit ? `?limit=${limit}` : ''}`,
    ),
  retryNotification: (id: string) =>
    request<{ ok: boolean; log: LineNotificationLog }>(`/admin/notifications/${id}/retry`, {
      method: 'POST',
    }),
  resetDemo: () => request<{ ok: boolean }>('/dev/reset', { method: 'POST', body: '{}' }),

  // Document Verification & QR Code
  getVerification: (documentId: string) =>
    request<DocumentVerification | null>(`/documents/${documentId}/verification`),
  createVerification: (
    documentId: string,
    payload?: { documentType?: string; title?: string; forceNew?: boolean },
  ) =>
    request<DocumentVerification>(`/documents/${documentId}/verification`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  revokeVerification: (documentId: string, reason: string) =>
    request<DocumentVerification>(`/documents/${documentId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  publicVerify: (token: string) =>
    request<PublicVerificationResult>(`/public/verify/${token}`),
  staffVerify: (query: string) =>
    request<StaffVerificationResult>('/staff/documents/verify', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),
  staffVerifyHistory: (limit = 50) =>
    request<DocumentScanLog[]>(`/staff/documents/verify-history?limit=${limit}`),

  // LINE Rich Menu & Flex Templates (Phase 5)
  getRichMenus: () =>
    request<any[]>('/admin/line/rich-menus'),
  getRichMenu: (id: string) =>
    request<any>(`/admin/line/rich-menus/${encodeURIComponent(id)}`),
  createRichMenu: (data: any) =>
    request<any>('/admin/line/rich-menus', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateRichMenu: (id: string, data: any) =>
    request<any>(`/admin/line/rich-menus/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteRichMenu: (id: string) =>
    request<{ success: boolean }>(`/admin/line/rich-menus/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  initDefaultRichMenus: () =>
    request<{ success: boolean; message: string }>('/admin/line/rich-menus/init-defaults', {
      method: 'POST',
    }),
  publishRichMenu: (id: string) =>
    request<any>(`/admin/line/rich-menus/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
    }),
  setDefaultRichMenu: (id: string) =>
    request<any>(`/admin/line/rich-menus/${encodeURIComponent(id)}/set-default`, {
      method: 'POST',
    }),
  uploadRichMenuImage: (id: string, imageData: string, mimeType: string) =>
    request<{ success: boolean; width: number; height: number }>(
      `/admin/line/rich-menus/${encodeURIComponent(id)}/upload-image`,
      {
        method: 'POST',
        body: JSON.stringify({ imageData, mimeType }),
      },
    ),
  linkRichMenuUser: (lineUserId: string, richMenuId: string) =>
    request<{ success: boolean }>('/admin/line/rich-menus/link-user', {
      method: 'POST',
      body: JSON.stringify({ lineUserId, richMenuId }),
    }),
  unlinkRichMenuUser: (lineUserId: string) =>
    request<{ success: boolean }>('/admin/line/rich-menus/unlink-user', {
      method: 'POST',
      body: JSON.stringify({ lineUserId }),
    }),
  switchUserRole: (lineUserId: string, role?: string) =>
    request<{ switched: boolean; menuType: string; richMenuId?: string }>(
      '/admin/line/rich-menus/switch-user-role',
      {
        method: 'POST',
        body: JSON.stringify({ lineUserId, role }),
      },
    ),
  getFlexTemplates: () =>
    request<any[]>('/admin/line/flex-templates'),
  upsertFlexTemplate: (dto: any) =>
    request<any>('/admin/line/flex-templates', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
  previewFlexTemplate: (eventType: string, sampleData?: any) =>
    request<any>('/admin/line/flex-templates/preview', {
      method: 'POST',
      body: JSON.stringify({ eventType, sampleData }),
    }),
};

// ===== Thai date formatting helpers =====
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
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

export function formatThaiDate(iso?: string, withYear = true): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = THAI_MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear() + 543;
  return withYear ? `${day} ${month} ${year}` : `${day} ${month}`;
}

export function formatThaiDateTime(iso?: string, withYear = false): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatThaiDate(iso, withYear)} · ${hh}:${mm}`;
}

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

export function formatMonthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${THAI_MONTHS_FULL[(m || 1) - 1]} ${(y || 2026) + 543}`;
}

/**
 * อ่านไฟล์รูปภาพจาก <input type="file"> และย่อขนาดอัตโนมัติ (สูงสุด 1000px) เป็น Data URL
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
            if (width > maxDim || height > maxDim) {
              if (width >= height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
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
