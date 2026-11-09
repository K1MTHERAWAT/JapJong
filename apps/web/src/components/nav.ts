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
  Layers,
  FolderTree,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { canAccessRoute, PublicAccount, Role, SidebarServiceItem } from '@japjong/shared';

export function resolveNavIcon(iconName?: string): LucideIcon {
  if (!iconName) return FolderTree;
  const found = (LucideIcons as Record<string, any>)[iconName];
  if (typeof found === 'function' || typeof found === 'object') {
    return found as LucideIcon;
  }
  return FolderTree;
}

export type NavItem = {
  id?: string;
  href: string;
  label: string;
  icon: LucideIcon;
  section: string;
  roles?: Role[];
  exact?: boolean;
  enabled?: boolean;
  allowedUserIds?: string[];
  deniedUserIds?: string[];
  description?: string;
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
  { href: '/staff/review', label: 'ตรวจคำขอ (สถานที่/อุปกรณ์)', icon: ClipboardList, section: 'งานเจ้าหน้าที่', roles: ['STAFF', 'ADMIN'] },
  { href: '/staff/repairs', label: 'จัดการงานซ่อม', icon: Wrench, section: 'งานเจ้าหน้าที่', roles: ['STAFF', 'ADMIN'] },
  { href: '/staff/resources', label: 'จัดการสถานที่/อุปกรณ์', icon: Shield, section: 'งานเจ้าหน้าที่', roles: ['STAFF', 'ADMIN'] },
  { href: '/staff/verify', label: 'ตรวจสอบเอกสาร QR Code', icon: QrCode, section: 'งานเจ้าหน้าที่', roles: ['STAFF', 'ADMIN'] },

  // ผู้อนุมัติ (ปลัด / นายก)
  { href: '/approver', label: 'คิวลงนามอนุมัติ', icon: CheckSquare, section: 'งานผู้บริหาร', roles: ['APPROVER_L2', 'APPROVER_L1'] },

  // แอดมินและทรัพยากร
  { href: '/admin', label: 'ภาพรวมผู้ดูแลระบบ', icon: LayoutDashboard, section: 'ระบบและผู้ดูแล', roles: ['ADMIN'], exact: true },
  { href: '/admin/services', label: 'จัดการบริการ & เมนู', icon: Layers, section: 'ระบบและผู้ดูแล', roles: ['ADMIN'] },
  { href: '/admin/line', label: 'จัดการ LINE & Rich Menu', icon: Smartphone, section: 'ระบบและผู้ดูแล', roles: ['ADMIN'] },
  { href: '/admin/notifications', label: 'บันทึกแจ้งเตือน & LINE', icon: BellRing, section: 'ระบบและผู้ดูแล', roles: ['ADMIN'] },
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

export function serviceToNavItem(service: SidebarServiceItem): NavItem {
  return {
    id: service.id,
    href: service.href,
    label: service.label,
    icon: resolveNavIcon(service.icon),
    section: service.category || 'บริการทั่วไป',
    roles: service.roles,
    exact: service.exact,
    enabled: service.enabled,
    allowedUserIds: service.allowedUserIds,
    deniedUserIds: service.deniedUserIds,
    description: service.description,
  };
}

export function getVisibleNav(account: PublicAccount | null, services?: SidebarServiceItem[]): NavItem[] {
  // หากได้รับข้อมูลบริการจากฐานข้อมูล ให้ใช้ข้อมูลบริการจากฐานข้อมูล
  if (services && services.length > 0) {
    return services
      .filter((s) => {
        if (!s.enabled) return false;

        // สิทธิ์เฉพาะรายบุคคล
        if (account?.id && s.deniedUserIds?.includes(account.id)) return false;
        if (account?.id && s.allowedUserIds?.includes(account.id)) return true;

        if (account) {
          if (account.role === 'ADMIN') {
            // สำหรับ Admin: แสดงเฉพาะเมนูระบบและผู้ดูแล
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
              '/staff/repairs',
              '/staff/resources',
              '/staff/walk-in',
              '/staff/verify',
            ].includes(s.href);
            if (isCitizenOrStaffService && !s.href.startsWith('/admin')) {
              return false;
            }
          }
          if (account.role === 'STAFF' && s.href === '/repair') {
            return false;
          }
          return s.roles.includes(account.role);
        } else {
          return s.roles.includes('USER') && ['/', '/booking', '/borrow', '/repair'].includes(s.href);
        }
      })
      .map(serviceToNavItem);
  }

  // Fallback เดิม
  return NAV.filter((item) => {
    // สำหรับ Admin: ซ่อนบริการประชาชนและงานเจ้าหน้าที่ใน Sidebar
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
        '/staff/repairs',
        '/staff/resources',
        '/staff/walk-in',
        '/staff/verify',
      ].includes(item.href);

      if (isCitizenOrStaffService) {
        return false;
      }
    }

    // สำหรับเจ้าหน้าที่: ไม่ต้องมีบริการ แจ้งซ่อม / ปัญหา
    if (account?.role === 'STAFF' && item.href === '/repair') {
      return false;
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

