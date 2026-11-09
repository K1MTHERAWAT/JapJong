import { PERMISSION_LABEL, ROLE_LABEL, ROLE_META, SIGN_LEVEL_TITLE } from './labels';
import type {
  Account,
  AnyRequest,
  Equipment,
  Period,
  PermissionKey,
  RequestWithTimeline,
  Role,
  SignLevel,
  TimelineStep,
  Venue,
} from './types';

export function overlaps(a: Period, b: Period): boolean {
  return new Date(a.start).getTime() < new Date(b.end).getTime() && new Date(b.start).getTime() < new Date(a.end).getTime();
}

/** ระยะเวลาเป็นข้อความ เช่น "2 วัน 4 ชม." — นับชั่วโมงตามช่วงเวลาเปิด-ปิดในแต่ละวัน */
export function periodDurationText(p: Period): string {
  const s = new Date(p.start);
  const e = new Date(p.end);
  const dayMs = 86400000;
  const startDay = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate());
  const endDay = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());
  const days = Math.round((endDay - startDay) / dayMs);
  if (days <= 0) {
    const h = Math.max(0, (e.getTime() - s.getTime()) / 3600000);
    return `${trimNum(h)} ชม.`;
  }
  const hoursRemainder = (e.getHours() + e.getMinutes() / 60) - (s.getHours() + s.getMinutes() / 60);
  const h = hoursRemainder >= 0 ? hoursRemainder : hoursRemainder + 24;
  const d = hoursRemainder >= 0 ? days : days - 1;
  return h > 0 ? `${d} วัน ${trimNum(h)} ชม.` : `${d} วัน`;
}

function trimNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const LEVEL_ORDER: SignLevel[] = ['staff', 'l2', 'l1'];

function approvalTimeline(req: Extract<AnyRequest, { signatures: unknown }>): TimelineStep[] {
  const steps: TimelineStep[] = [
    { key: 'submit', label: 'ผู้ขอลงนามและส่งคำขอ', at: req.createdAt, state: 'done' },
  ];
  const labels: Record<SignLevel, string> = {
    staff: SIGN_LEVEL_TITLE.staff,
    l2: SIGN_LEVEL_TITLE.l2,
    l1: SIGN_LEVEL_TITLE.l1,
  };
  let blocked = false;
  let currentAssigned = false;
  for (const level of LEVEL_ORDER) {
    const sig = req.signatures.find((s) => s.level === level);
    if (sig) {
      steps.push({
        key: level,
        label: sig.title || labels[level],
        at: sig.at,
        note: sig.decision === 'reject' ? `ไม่ผ่าน${sig.note ? ` · ${sig.note}` : ''}` : `${sig.signerName} · ${sig.title || SIGN_LEVEL_TITLE[level]}`,
        state: sig.decision === 'reject' ? 'rejected' : 'done',
      });
      if (sig.decision === 'reject') blocked = true;
    } else {
      const isCurrent = !blocked && !currentAssigned && req.status !== 'cancelled';
      if (isCurrent) currentAssigned = true;
      steps.push({ key: level, label: labels[level], note: isCurrent ? 'รอดำเนินการ' : undefined, state: isCurrent ? 'current' : 'todo' });
    }
  }
  const approved = req.signatures.filter((s) => s.decision === 'approve').length === 3;
  steps.push({
    key: 'issue',
    label: 'ออกเอกสาร PDF และแจ้งผล',
    at: approved ? req.signatures.find((s) => s.level === 'l1')?.at : undefined,
    state: approved ? 'done' : 'todo',
  });
  if (req.status === 'cancelled') {
    steps.push({ key: 'cancel', label: 'ยกเลิกคำขอ', at: req.updatedAt, state: 'rejected' });
  }
  return steps;
}

export function computeTimeline(req: AnyRequest): TimelineStep[] {
  if (req.type === 'repair') {
    if (req.status === 'rejected' || req.status === 'cancelled') {
      return [
        { key: 'submit', label: 'ส่งแจ้งปัญหา', at: req.createdAt, state: 'done' },
        {
          key: 'accept',
          label: req.status === 'rejected' ? 'ส่งกลับ / ไม่รับเรื่อง' : 'ยกเลิกการแจ้งซ่อม',
          at: req.updatedAt,
          state: 'rejected',
          note: req.rejectReason || (req.status === 'rejected' ? 'เจ้าหน้าที่ส่งกลับ / ไม่รับเรื่อง' : 'ยกเลิกคำขอ'),
        },
      ];
    }
    const order = ['repair_submitted', 'repair_in_progress', 'repair_awaiting_acceptance', 'repair_done'];
    const idx = order.indexOf(req.status);
    return [
      { key: 'submit', label: 'ส่งแจ้งปัญหา', at: req.createdAt, state: 'done' },
      {
        key: 'accept',
        label: 'เจ้าหน้าที่รับเรื่อง',
        at: req.acceptedAt,
        state: idx >= 1 ? 'done' : 'current',
        note: idx >= 1 ? undefined : 'รอเจ้าหน้าที่รับเรื่อง',
      },
      {
        key: 'fix',
        label: 'ซ่อมเสร็จ',
        at: req.finishedAt,
        note: idx >= 2 ? req.resolution : idx === 1 ? 'กำลังดำเนินการ' : undefined,
        state: idx >= 2 ? 'done' : idx === 1 ? 'current' : 'todo',
      },
      {
        key: 'check',
        label: 'ตรวจรับงาน',
        at: idx >= 3 ? req.updatedAt : undefined,
        note: idx === 2 ? 'รอคุณตรวจรับ' : undefined,
        state: idx >= 3 ? 'done' : idx === 2 ? 'current' : 'todo',
      },
    ];
  }
  return approvalTimeline(req);
}

export function describeRequest(
  req: AnyRequest,
  venues: Venue[],
  equipment: Equipment[],
): { title: string; subtitle: string } {
  const vName = (id: string) => venues.find((v) => v.id === id)?.name ?? id;
  const eName = (id: string) => equipment.find((e) => e.id === id)?.name ?? id;
  if (req.type === 'booking') {
    const extras = req.extraItems.map((i) => `${eName(i.equipmentId)} ${i.qty}`).join(', ');
    return {
      title: req.venueIds.map(vName).join(', '),
      subtitle: extras ? `+ ${extras}` : req.activity,
    };
  }
  if (req.type === 'borrow') {
    return {
      title: req.items.map((i) => `${eName(i.equipmentId)} ×${i.qty}`).join(', '),
      subtitle: req.purpose,
    };
  }
  return { title: req.detail.length > 40 ? `${req.detail.slice(0, 40)}…` : req.detail, subtitle: req.location };
}

export function withTimeline(req: AnyRequest, venues: Venue[], equipment: Equipment[]): RequestWithTimeline {
  return { ...req, ...describeRequest(req, venues, equipment), timeline: computeTimeline(req) };
}

// ===== RBAC & Permission Checks =====

export function hasPermission(
  account: Pick<Account, 'role' | 'permissions'> | null | undefined,
  perm: PermissionKey,
): boolean {
  if (!account) return false;
  return Boolean(account.permissions?.[perm]);
}

export interface SignAccessCheck {
  allowed: boolean;
  expectedLevel?: SignLevel;
  requiredRole?: Role;
  requiredPermission?: PermissionKey;
  reason?: string;
}

export function canSignRequest(
  account: (Pick<Account, 'role' | 'permissions'> & { id?: string; name?: string }) | null | undefined,
  req: Pick<AnyRequest, 'type' | 'status'> & {
    requesterId?: string;
    requesterName?: string;
    createdByStaffId?: string;
    signatures?: { signerId: string; decision: string }[];
  },
): SignAccessCheck {
  if (!account) {
    return { allowed: false, reason: 'กรุณาเข้าสู่ระบบก่อนลงนาม' };
  }
  // Separation of Duties: ห้ามตนเองอนุมัติคำขอตนเอง (ยกเว้นคำขอ Walk-in ที่เจ้าหน้าที่กรอกแทนผู้มาติดต่อ โดยผู้ขอจริงไม่ใช่เจ้าหน้าที่)
  const isOwnRequest =
    account.id &&
    req.requesterId &&
    account.id === req.requesterId &&
    (!req.createdByStaffId || (req.requesterName && account.name && req.requesterName.trim() === account.name.trim()));
  if (isOwnRequest) {
    return {
      allowed: false,
      reason: 'ไม่สามารถลงนามอนุมัติคำขอของตนเองได้ (Separation of Duties)',
    };
  }
  // Separation of Duties: ห้ามบุคคลเดิมลงนามซ้ำข้ามระดับในคำขอเดียวกัน
  if (
    account.id &&
    Array.isArray(req.signatures) &&
    req.signatures.some((s) => s.signerId === account.id && s.decision === 'approve')
  ) {
    return {
      allowed: false,
      reason: 'คุณได้ลงนามอนุมัติคำขอนี้ในระดับก่อนหน้าไปแล้ว ไม่สามารถลงนามซ้ำในระดับนี้ได้ (Separation of Duties)',
    };
  }
  if (req.type === 'repair') {
    return { allowed: false, reason: 'รายการแจ้งซ่อมไม่ต้องลงนาม 3 ระดับ' };
  }
  if (req.status === 'pending_staff') {
    const ok = (account.role === 'STAFF' || account.role === 'ADMIN') && hasPermission(account, 'review');
    return {
      allowed: ok,
      expectedLevel: 'staff',
      requiredRole: 'STAFF',
      requiredPermission: 'review',
      reason: ok
        ? undefined
        : 'คำขอนี้อยู่ในขั้นรอเจ้าหน้าที่ตรวจสอบ (ระดับ 1) ต้องใช้บัญชีเจ้าหน้าที่ที่มีสิทธิ์ "ตรวจคำขอ & ลงนามระดับเจ้าหน้าที่"',
    };
  }
  if (req.status === 'pending_l2') {
    const ok = account.role === 'APPROVER_L2' && hasPermission(account, 'sign');
    return {
      allowed: ok,
      expectedLevel: 'l2',
      requiredRole: 'APPROVER_L2',
      requiredPermission: 'sign',
      reason: ok
        ? undefined
        : 'คำขอนี้อยู่ในขั้นรอเห็นชอบระดับ 2 ต้องลงนามโดย "ปลัดองค์การบริหารส่วนตำบล" ที่มีสิทธิ์ลงนามอนุมัติเอกสาร',
    };
  }
  if (req.status === 'pending_l1') {
    const ok = account.role === 'APPROVER_L1' && hasPermission(account, 'sign');
    return {
      allowed: ok,
      expectedLevel: 'l1',
      requiredRole: 'APPROVER_L1',
      requiredPermission: 'sign',
      reason: ok
        ? undefined
        : 'คำขอนี้อยู่ในขั้นรออนุมัติขั้นสุดท้าย ต้องลงนามโดย "นายกองค์การบริหารส่วนตำบล" ที่มีสิทธิ์ลงนามอนุมัติเอกสาร',
    };
  }
  return {
    allowed: false,
    reason: 'คำขอนี้ไม่ได้อยู่ในสถานะรอลงนาม (อนุมัติแล้ว / ไม่ผ่าน / ยกเลิกแล้ว)',
  };
}

export interface RouteAccessResult {
  allowed: boolean;
  title: string;
  requiredRoles: Role[];
  requiredPermission?: PermissionKey;
  reason?: string;
}

export function canAccessRoute(
  account: Pick<Account, 'role' | 'permissions'> | null | undefined,
  pathname: string,
): RouteAccessResult {
  // หน้าสาธารณะ
  if (pathname === '/login' || pathname === '/register' || pathname.startsWith('/register/line')) {
    return { allowed: true, title: 'เข้าสู่ระบบ / ลงทะเบียน', requiredRoles: [] };
  }

  if (!account) {
    return {
      allowed: false,
      title: 'ต้องเข้าสู่ระบบ',
      requiredRoles: ['USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN'],
      reason: 'กรุณาเข้าสู่ระบบก่อนใช้งานหน้านี้',
    };
  }

  // 1. หน้าจัดการสิทธิ์ผู้ใช้ (/admin/permissions)
  if (pathname.startsWith('/admin/permissions')) {
    const ok = account.role === 'ADMIN' || hasPermission(account, 'manageUsers');
    return {
      allowed: ok,
      title: 'จัดการบทบาทและสิทธิ์ผู้ใช้',
      requiredRoles: ['ADMIN'],
      requiredPermission: 'manageUsers',
      reason: ok
        ? undefined
        : `เฉพาะ "${ROLE_LABEL.ADMIN}" หรือผู้ที่มีสิทธิ์ "${PERMISSION_LABEL.manageUsers}" เท่านั้น`,
    };
  }

  // 2. หน้าจัดการทรัพยากรของเจ้าหน้าที่ (/staff/resources, /staff/resources/new, /staff/resources/edit)
  if (pathname.startsWith('/staff/resources') || pathname.startsWith('/admin/resources')) {
    const ok =
      (account.role === 'STAFF' || account.role === 'ADMIN') && hasPermission(account, 'manageResources');
    return {
      allowed: ok,
      title: 'จัดการทรัพยากรและแบบฟอร์ม',
      requiredRoles: ['STAFF', 'ADMIN'],
      requiredPermission: 'manageResources',
      reason: ok
        ? undefined
        : `ต้องมีบทบาทเจ้าหน้าที่หรือแอดมิน และเปิดสิทธิ์ "${PERMISSION_LABEL.manageResources}"`,
    };
  }

  // 3. หน้าโฮมแอดมิน (/admin), จัดการบริการ (/admin/services), ระบบแจ้งเตือน (/admin/notifications) และ LINE Rich Menu (/admin/line)
  if (
    pathname === '/admin' ||
    pathname.startsWith('/admin/services') ||
    pathname.startsWith('/admin/notifications') ||
    pathname.startsWith('/admin/line')
  ) {
    const ok = account.role === 'ADMIN' || hasPermission(account, 'manageUsers');
    return {
      allowed: ok,
      title: 'แดชบอร์ดผู้ดูแลระบบ (แอดมิน)',
      requiredRoles: ['ADMIN'],
      requiredPermission: 'manageUsers',
      reason: ok
        ? undefined
        : `หน้านี้สำหรับ "${ROLE_LABEL.ADMIN}" ที่มีสิทธิ์ "${PERMISSION_LABEL.manageUsers}" เท่านั้น`,
    };
  }

  // 4. หน้าตรวจคำขอของเจ้าหน้าที่ (/staff/review)
  if (pathname.startsWith('/staff/review')) {
    const ok = (account.role === 'STAFF' || account.role === 'ADMIN') && hasPermission(account, 'review');
    return {
      allowed: ok,
      title: 'ตรวจคำขอ (สถานที่/อุปกรณ์)',
      requiredRoles: ['STAFF', 'ADMIN'],
      requiredPermission: 'review',
      reason: ok
        ? undefined
        : `ต้องมีบทบาทเจ้าหน้าที่/แอดมิน และเปิดสิทธิ์ "${PERMISSION_LABEL.review}"`,
    };
  }

  // 4.1 หน้าจัดการงานซ่อมของเจ้าหน้าที่ (/staff/repairs)
  if (pathname.startsWith('/staff/repairs')) {
    const ok = (account.role === 'STAFF' || account.role === 'ADMIN') && hasPermission(account, 'review');
    return {
      allowed: ok,
      title: 'จัดการงานซ่อม',
      requiredRoles: ['STAFF', 'ADMIN'],
      requiredPermission: 'review',
      reason: ok
        ? undefined
        : `ต้องมีบทบาทเจ้าหน้าที่/แอดมิน และเปิดสิทธิ์ "${PERMISSION_LABEL.review}"`,
    };
  }

  // 5. หน้ากรอกคำขอแทนผู้มาติดต่อ (/staff/walk-in)
  if (pathname.startsWith('/staff/walk-in')) {
    const ok = (account.role === 'STAFF' || account.role === 'ADMIN') && hasPermission(account, 'walkIn');
    return {
      allowed: ok,
      title: 'กรอกคำขอแทนผู้มาติดต่อ (Walk-in)',
      requiredRoles: ['STAFF', 'ADMIN'],
      requiredPermission: 'walkIn',
      reason: ok
        ? undefined
        : `ต้องมีบทบาทเจ้าหน้าที่/แอดมิน และเปิดสิทธิ์ "${PERMISSION_LABEL.walkIn}"`,
    };
  }

  // 6.1 หน้าตรวจสอบเอกสาร QR Code (/staff/verify)
  if (pathname.startsWith('/staff/verify')) {
    const ok = account.role === 'STAFF' || account.role === 'ADMIN';
    return {
      allowed: ok,
      title: 'ตรวจสอบเอกสาร QR Code',
      requiredRoles: ['STAFF', 'ADMIN'],
      reason: ok
        ? undefined
        : 'ต้องมีบทบาทเจ้าหน้าที่หรือผู้ดูแลระบบเท่านั้น',
    };
  }

  // 7. หน้าโฮมเจ้าหน้าที่ (/staff)
  if (pathname === '/staff') {
    const ok =
      account.role === 'STAFF' ||
      account.role === 'ADMIN' ||
      hasPermission(account, 'review') ||
      hasPermission(account, 'handover') ||
      hasPermission(account, 'walkIn');
    return {
      allowed: ok,
      title: 'หน้าหลักเจ้าหน้าที่',
      requiredRoles: ['STAFF', 'ADMIN'],
      requiredPermission: 'review',
      reason: ok ? undefined : 'หน้านี้สำหรับเจ้าหน้าที่ผู้รับผิดชอบ หรือผู้ดูแลระบบเท่านั้น',
    };
  }

  // 8. หน้าตั้งค่าลายเซ็นและ PIN (/approver/settings) — เจ้าหน้าที่และผู้อนุมัติใช้ตั้งค่าลายเซ็นของตนได้
  if (pathname.startsWith('/approver/settings')) {
    const ok =
      account.role === 'STAFF' ||
      account.role === 'APPROVER_L2' ||
      account.role === 'APPROVER_L1' ||
      account.role === 'ADMIN';
    return {
      allowed: ok,
      title: 'ตั้งค่าลายเซ็นดิจิทัลและรหัส PIN 6 หลัก',
      requiredRoles: ['APPROVER_L2', 'APPROVER_L1', 'STAFF', 'ADMIN'],
      reason: ok
        ? undefined
        : 'เฉพาะผู้อนุมัติและเจ้าหน้าที่เท่านั้นที่ต้องตั้งค่าลายเซ็นดิจิทัลและรหัส PIN 6 หลัก (ผู้ใช้งานทั่วไปเซ็นบนหน้าจอยื่นคำขอโดยตรง)',
    };
  }

  // 9. หน้าใบอนุญาต PDF (/approver/permit/[id]) — ทุกคนที่เกี่ยวข้อง (ผู้ยื่น, เจ้าหน้าที่, ผู้อนุมัติ, แอดมิน) ดูใบอนุญาตที่อนุมัติแล้วได้
  if (pathname.startsWith('/approver/permit')) {
    return {
      allowed: true,
      title: 'เอกสารใบอนุญาต (PDF)',
      requiredRoles: ['USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN'],
    };
  }

  // 10. หน้าโฮมผู้อนุมัติ (/approver) และหน้าลงนาม (/approver/sign/[id])
  if (pathname === '/approver' || pathname.startsWith('/approver/sign')) {
    const ok =
      (account.role === 'APPROVER_L2' || account.role === 'APPROVER_L1') &&
      hasPermission(account, 'sign');
    return {
      allowed: ok,
      title: 'ลงนามอนุมัติเอกสาร (ปลัด / นายกองค์การบริหารส่วนตำบล)',
      requiredRoles: ['APPROVER_L2', 'APPROVER_L1'],
      requiredPermission: 'sign',
      reason: ok
        ? undefined
        : `เฉพาะปลัดองค์การบริหารส่วนตำบล หรือนายกองค์การบริหารส่วนตำบล ที่เปิดสิทธิ์ "${PERMISSION_LABEL.sign}" เท่านั้น`,
    };
  }

  // 11. หน้าฝั่งประชาชนทั่วไป (/, /booking, /borrow, /repair, /requests/[id])
  return {
    allowed: true,
    title: ROLE_META[account.role]?.label ?? 'ผู้ใช้งาน',
    requiredRoles: ['USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN'],
  };
}

export function canAccessServiceRoute(
  account: (Pick<Account, 'role' | 'permissions'> & { id?: string }) | null | undefined,
  pathname: string,
  services?: import('./types').SidebarServiceItem[],
): RouteAccessResult {
  if (services && services.length > 0) {
    const matched = services.find((s) => (s.exact || s.href === '/' ? pathname === s.href : pathname.startsWith(s.href)));
    if (matched) {
      if (!matched.enabled) {
        return {
          allowed: false,
          title: matched.label,
          requiredRoles: matched.roles,
          reason: `บริการ "${matched.label}" ถูกปิดใช้งานชั่วคราวโดยผู้ดูแลระบบ`,
        };
      }
      if (account?.id && matched.deniedUserIds?.includes(account.id)) {
        return {
          allowed: false,
          title: matched.label,
          requiredRoles: matched.roles,
          reason: `บัญชีของคุณถูกจำกัดการเข้าถึงบริการ "${matched.label}"`,
        };
      }
      if (account?.id && matched.allowedUserIds?.includes(account.id)) {
        return {
          allowed: true,
          title: matched.label,
          requiredRoles: matched.roles,
        };
      }
      if (account?.role && matched.roles.includes(account.role)) {
        return {
          allowed: true,
          title: matched.label,
          requiredRoles: matched.roles,
        };
      }
      if (!account && matched.roles.includes('USER') && ['/', '/booking', '/borrow', '/repair'].includes(matched.href)) {
        return {
          allowed: true,
          title: matched.label,
          requiredRoles: matched.roles,
        };
      }
      return {
        allowed: false,
        title: matched.label,
        requiredRoles: matched.roles,
        reason: account ? `คุณไม่มีสิทธิ์เข้าถึงบริการ "${matched.label}"` : 'กรุณาเข้าสู่ระบบก่อนใช้งาน',
      };
    }
  }

  return canAccessRoute(account, pathname);
}

// ===== Phone Validation (10-digit numeric string 0-9) =====

export interface PhoneValidationResult {
  valid: boolean;
  value: string;
  normalized: string;
  error?: string;
}

export function sanitizePhoneInput(raw: unknown, maxLength = 10): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  return String(raw).replace(/\D+/g, '').slice(0, maxLength);
}

export function validateThaiPhone(phone: unknown): PhoneValidationResult {
  if (typeof phone !== 'string') {
    return {
      valid: false,
      value: '',
      normalized: '',
      error: 'กรุณากรอกเบอร์โทรศัพท์เป็นตัวเลข 10 หลัก (0-9)',
    };
  }
  const trimmed = phone.trim();
  if (!trimmed) {
    return {
      valid: false,
      value: '',
      normalized: '',
      error: 'กรุณากรอกเบอร์โทรศัพท์ 10 หลัก',
    };
  }
  if (/[^0-9]/.test(trimmed)) {
    return {
      valid: false,
      value: trimmed,
      normalized: trimmed,
      error: 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 0-9 เท่านั้น ห้ามมีขีด เว้นวรรค หรือตัวอักษร',
    };
  }
  if (trimmed.length < 10) {
    return {
      valid: false,
      value: trimmed,
      normalized: trimmed,
      error: `เบอร์โทรศัพท์ต้องครบ 10 หลัก (น้อยกว่า 10 หลัก: กรอกแล้ว ${trimmed.length} หลัก)`,
    };
  }
  if (trimmed.length > 10) {
    return {
      valid: false,
      value: trimmed,
      normalized: trimmed,
      error: 'เบอร์โทรศัพท์ต้องไม่เกิน 10 หลัก',
    };
  }
  return {
    valid: true,
    value: trimmed,
    normalized: trimmed,
  };
}

// ===== Borrow Equipment Pickup Date Eligibility (Asia/Bangkok) =====

export interface BorrowReceiveEligibility {
  allowed: boolean;
  todayBkk: string;
  pickupDate: string;
  lastAllowedReceiveDate: string;
  daysUntilPickup: number;
  isOnPickupDate: boolean;
  isAfterPickupDate: boolean;
  isPastDeadline: boolean;
  reason?: string;
}

/**
 * Returns YYYY-MM-DD in Asia/Bangkok (UTC+7) timezone.
 */
export function getBangkokDateString(input?: Date | string | number): string {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }
  const d = input !== undefined ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date(Date.now() + 7 * 3600000);
    return fallback.toISOString().slice(0, 10);
  }
  // Shift UTC timestamp by +7 hours to get exact Bangkok calendar date
  const bkkTime = new Date(d.getTime() + 7 * 3600000);
  return bkkTime.toISOString().slice(0, 10);
}

function normalizeDateYmd(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return getBangkokDateString(trimmed);
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays);
  return new Date(utc).toISOString().slice(0, 10);
}

function diffDaysYmd(targetYmd: string, baseYmd: string): number {
  const [ty, tm, td] = targetYmd.split('-').map(Number);
  const [by, bm, bd] = baseYmd.split('-').map(Number);
  const tUtc = Date.UTC(ty, (tm || 1) - 1, td || 1);
  const bUtc = Date.UTC(by, (bm || 1) - 1, bd || 1);
  return Math.round((tUtc - bUtc) / 86400000);
}

/**
 * Checks whether a borrower can confirm equipment receipt on `now` given `pickupDate`.
 * Rule: Borrower must confirm receipt AT LEAST 1 day before `pickupDate` (i.e. todayBkk <= pickupDate - 1 day).
 * Example: If pickupDate is 2026-11-15, lastAllowedReceiveDate is 2026-11-14.
 * Confirming on 2026-11-14 or earlier is allowed; confirming on 2026-11-15 or later is rejected.
 */
export function checkBorrowReceiveEligibility(
  pickupDate: string,
  now?: Date | string | number,
): BorrowReceiveEligibility {
  const pickupYmd = normalizeDateYmd(pickupDate);
  const todayBkk = getBangkokDateString(now);

  if (!pickupYmd) {
    return {
      allowed: false,
      todayBkk,
      pickupDate: String(pickupDate || ''),
      lastAllowedReceiveDate: '',
      daysUntilPickup: -1,
      isOnPickupDate: false,
      isAfterPickupDate: false,
      isPastDeadline: true,
      reason: 'ไม่พบข้อมูลวันรับครุภัณฑ์ที่ถูกต้อง',
    };
  }

  const lastAllowedReceiveDate = addDaysYmd(pickupYmd, -1);
  const daysUntilPickup = diffDaysYmd(pickupYmd, todayBkk);
  const isOnPickupDate = todayBkk === pickupYmd;
  const isAfterPickupDate = todayBkk > pickupYmd;
  const isPastDeadline = todayBkk >= pickupYmd;
  const allowed = todayBkk <= lastAllowedReceiveDate;

  let reason: string | undefined;
  if (!allowed) {
    if (isOnPickupDate) {
      reason = `เลยกำหนดยืนยันรับมอบครุภัณฑ์ (ต้องกดยืนยันล่วงหน้าอย่างน้อย 1 วันก่อนวันรับครุภัณฑ์ ${pickupYmd} คือภายในวันที่ ${lastAllowedReceiveDate}) กรุณาติดต่อเจ้าหน้าที่หรือเลื่อนวันรับครุภัณฑ์`;
    } else {
      reason = `เลยกำหนดวันรับครุภัณฑ์ (${pickupYmd}) แล้ว (ต้องกดยืนยันรับมอบภายในวันที่ ${lastAllowedReceiveDate}) กรุณาติดต่อเจ้าหน้าที่เพื่อดำเนินการหรือกำหนดวันรับใหม่`;
    }
  }

  return {
    allowed,
    todayBkk,
    pickupDate: pickupYmd,
    lastAllowedReceiveDate,
    daysUntilPickup,
    isOnPickupDate,
    isAfterPickupDate,
    isPastDeadline,
    reason,
  };
}


