import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Building2,
  Package,
  Wrench,
  FileText,
  Clock,
  Bell,
  BellRing,
  ClipboardList,
  CheckSquare,
  PenTool,
  QrCode,
  Shield,
  Users,
  UserCircle,
  LayoutDashboard,
  Smartphone,
} from 'lucide-react';
import { canAccessRoute, PublicAccount, Role } from '@japjong/shared';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section: string;
  roles?: Role[];
  exact?: boolean;
};

export const NAV: NavItem[] = [
  // บริการประชาชน
  { href: '/', label: 'หน้าแรกบริการ', icon: Home, section: 'บริการหลัก', exact: true },
  { href: '/booking', label: 'ขอใช้สถานที่', icon: Building2, section: 'บริการหลัก' },
  { href: '/borrow', label: 'ยืม–คืนอุปกรณ์', icon: Package, section: 'บริการหลัก', exact: true },
  { href: '/repair', label: 'แจ้งซ่อม / ปัญหา', icon: Wrench, section: 'บริการหลัก' },

  // รายการและประวัติ
  {
    href: '/borrow/my',
    label: 'รายการยืมของฉัน',
    icon: FileText,
    section: 'รายการและประวัติ',
    roles: ['USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN'],
  },
  {
    href: '/history',
    label: 'ประวัติคำขอทั้งหมด',
    icon: Clock,
    section: 'รายการและประวัติ',
    roles: ['USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN'],
  },
  {
    href: '/notifications',
    label: 'ศูนย์แจ้งเตือน',
    icon: Bell,
    section: 'รายการและประวัติ',
    roles: ['USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN'],
  },

  // เจ้าหน้าที่
  { href: '/staff/review', label: 'ตรวจคำขอ & งานซ่อม', icon: ClipboardList, section: 'งานเจ้าหน้าที่', roles: ['STAFF', 'ADMIN'] },
  { href: '/staff/handover', label: 'รับมอบ–รับคืน', icon: CheckSquare, section: 'งานเจ้าหน้าที่', roles: ['STAFF', 'ADMIN'] },
  { href: '/staff/walk-in', label: 'กรอกคำขอแทน (Walk-in)', icon: PenTool, section: 'งานเจ้าหน้าที่', roles: ['STAFF', 'ADMIN'] },
  { href: '/staff/verify', label: 'ตรวจสอบเอกสาร QR Code', icon: QrCode, section: 'งานเจ้าหน้าที่', roles: ['STAFF', 'ADMIN'] },

  // ผู้อนุมัติ (ปลัด / นายก)
  { href: '/approver', label: 'คิวลงนามอนุมัติ', icon: CheckSquare, section: 'งานผู้บริหาร', roles: ['APPROVER_L2', 'APPROVER_L1'] },

  // แอดมินและทรัพยากร
  { href: '/admin', label: 'ภาพรวมผู้ดูแลระบบ', icon: LayoutDashboard, section: 'ระบบและผู้ดูแล', roles: ['ADMIN'], exact: true },
  { href: '/admin/line', label: 'จัดการ LINE & Rich Menu', icon: Smartphone, section: 'ระบบและผู้ดูแล', roles: ['ADMIN'] },
  { href: '/admin/notifications', label: 'บันทึกแจ้งเตือน & LINE', icon: BellRing, section: 'ระบบและผู้ดูแล', roles: ['ADMIN'] },
  { href: '/admin/resources', label: 'จัดการสถานที่/อุปกรณ์', icon: Shield, section: 'ระบบและผู้ดูแล', roles: ['ADMIN', 'STAFF'] },
  { href: '/admin/permissions', label: 'บัญชีผู้ใช้ & สิทธิ์', icon: Users, section: 'ระบบและผู้ดูแล', roles: ['ADMIN'] },

  // บัญชีของฉัน
  {
    href: '/account',
    label: 'จัดการบัญชีส่วนตัว',
    icon: UserCircle,
    section: 'บัญชีผู้ใช้งาน',
    roles: ['USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN'],
  },
];

export function getVisibleNav(account: PublicAccount | null): NavItem[] {
  return NAV.filter((item) => {
    // สำหรับ Admin: ซ่อนบริการประชาชนและงานเจ้าหน้าที่ใน Sidebar (ตามภาพที่ 2) ให้แสดงเฉพาะเมนูระบบและผู้ดูแล
    if (account?.role === 'ADMIN') {
      const isCitizenOrStaffService = [
        '/',
        '/booking',
        '/borrow',
        '/repair',
        '/borrow/my',
        '/history',
        '/notifications',
        '/account',
        '/staff/review',
        '/staff/handover',
        '/staff/walk-in',
        '/staff/verify',
      ].includes(item.href);

      if (isCitizenOrStaffService) {
        return false;
      }
    }

    if (item.roles && !account) {
      return false;
    }
    if (account) {
      return canAccessRoute(account, item.href).allowed;
    }
    return true;
  });
}
