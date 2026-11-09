'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Lock,
  LogOut,
  ShieldAlert,
  User,
} from 'lucide-react';
import {
  PERMISSION_LABEL,
  ROLE_LABEL,
  Role,
  SidebarServiceItem,
  canAccessServiceRoute,
} from '@japjong/shared';
import { useAuth } from './auth-context';
import { Sidebar } from './Sidebar';
import { getVisibleNav } from './nav';
import { Button, Card } from './ui';
import { api } from '@/lib/api';

export function roleHomePath(role?: Role): string {
  switch (role) {
    case 'STAFF':
      return '/staff';
    case 'APPROVER_L2':
    case 'APPROVER_L1':
      return '/approver';
    case 'ADMIN':
      return '/admin';
    default:
      return '/';
  }
}

const ROUTE_LABELS: Record<string, string> = {
  '/': 'หน้าแรกบริการ',
  '/booking': 'ขอใช้สถานที่ราชการ',
  '/borrow': 'ยืม–คืนอุปกรณ์ครุภัณฑ์',
  '/borrow/my': 'รายการยืม–คืนอุปกรณ์',
  '/repair': 'แจ้งซ่อมและปัญหา',
  '/history': 'ประวัติคำขอทั้งหมด',
  '/notifications': 'ศูนย์แจ้งเตือน',
  '/notifications/settings': 'ตั้งค่าการแจ้งเตือน',
  '/account': 'จัดการบัญชีผู้ใช้งาน',
  '/staff': 'แดชบอร์ดเจ้าหน้าที่',
  '/staff/review': 'ตรวจคำขอ (สถานที่/อุปกรณ์)',
  '/staff/repairs': 'จัดการงานซ่อม',
  '/staff/verify': 'ตรวจสอบเอกสาร QR Code',
  '/staff/walk-in': 'ลงทะเบียนหน้าจุดบริการ',
  '/approver': 'คิวลงนามอนุมัติ',
  '/approver/settings': 'ตั้งค่าการลงนาม',
  '/admin': 'ภาพรวมผู้ดูแลระบบ',
  '/admin/services': 'จัดการบริการและเมนูระบบ',
  '/admin/resources': 'จัดการสถานที่และครุภัณฑ์',
  '/admin/resources/new': 'เพิ่มทรัพยากรใหม่',
  '/admin/resources/edit': 'แก้ไขทรัพยากร',
  '/admin/permissions': 'จัดการบทบาทผู้ใช้งาน (RBAC)',
  '/admin/line': 'จัดการ LINE OA & Rich Menu',
  '/admin/notifications': 'ประวัติแจ้งเตือน & Outbox',
  '/admin/document-templates': 'แม่แบบเอกสารราชการ',
  '/admin/documents': 'เอกสารที่สร้างจากคำขอ',
};

export interface AppShellProps {
  title?: string;
  rightLabel?: string;
  maxWidth?: string;
  footer?: React.ReactNode;
  onBack?: () => void;
  backHref?: string;
  children: React.ReactNode;
}

export function AppShell({
  title,
  footer,
  onBack,
  backHref,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    account,
    loading,
    logout,
    unreadCount,
  } = useAuth();

  const [dbServices, setDbServices] = useState<SidebarServiceItem[]>([]);

  const fetchNav = useCallback(() => {
    api
      .getNavigation()
      .then((items) => {
        if (Array.isArray(items)) {
          setDbServices(items);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchNav();
    window.addEventListener('japjong-navigation-refresh', fetchNav);
    return () => {
      window.removeEventListener('japjong-navigation-refresh', fetchNav);
    };
  }, [account?.id, account?.role, fetchNav]);

  const visibleNav = useMemo(() => {
    return getVisibleNav(account, dbServices.length > 0 ? dbServices : undefined);
  }, [account, dbServices]);

  const access = useMemo(() => {
    return canAccessServiceRoute(account, pathname, dbServices.length > 0 ? dbServices : undefined);
  }, [account, pathname, dbServices]);

  const breadcrumbs = useMemo(() => {
    const homeHref = roleHomePath(account?.role);
    const homeLabel =
      account?.role === 'ADMIN'
        ? 'ระบบผู้ดูแล'
        : account?.role === 'STAFF'
        ? 'งานเจ้าหน้าที่'
        : account?.role === 'APPROVER_L1' || account?.role === 'APPROVER_L2'
        ? 'งานผู้บริหาร'
        : 'หน้าหลัก';

    const crumbs: { label: string; href?: string }[] = [{ label: homeLabel, href: homeHref }];
    const currentLabel = title || ROUTE_LABELS[pathname];

    if (pathname !== homeHref && currentLabel) {
      crumbs.push({ label: currentLabel });
    } else if (pathname !== homeHref) {
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        const prefix = `/${segments[0]}`;
        if (ROUTE_LABELS[prefix] && prefix !== homeHref) {
          crumbs.push({ label: ROUTE_LABELS[prefix], href: prefix });
        }
        if (title) {
          crumbs.push({ label: title });
        }
      }
    }
    return crumbs;
  }, [account?.role, pathname, title]);

  const handleLogoutAndLogin = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="flex min-h-dvh bg-bg text-ink font-sans selection:bg-brand-tint selection:text-brand-ink print:bg-white print:block">
      {/* Collapsible Sidebar (Desktop lg+) & Drawer (Mobile <lg) */}
      <Sidebar items={visibleNav} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact Enterprise Top Header */}
        <header className="sticky top-0 z-20 h-14 border-b border-line bg-surface/95 backdrop-blur-xs px-4 pl-14 lg:px-6 flex items-center justify-between gap-4 print:hidden">
          {/* Left: Back Action + Breadcrumb Trail */}
          <div className="flex items-center gap-2.5 min-w-0">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-muted px-2.5 py-1 text-[12.5px] font-semibold text-ink-soft hover:bg-hover hover:text-ink transition-colors shrink-0"
              >
                <ArrowLeft className="size-3.5" />
                <span className="hidden sm:inline">ย้อนกลับ</span>
              </button>
            ) : backHref && pathname !== backHref ? (
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-muted px-2.5 py-1 text-[12.5px] font-semibold text-ink-soft hover:bg-hover hover:text-ink transition-colors shrink-0"
              >
                <ArrowLeft className="size-3.5" />
                <span className="hidden sm:inline">ย้อนกลับ</span>
              </Link>
            ) : null}

            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0 text-[13px]">
              <span className="hidden md:inline font-semibold text-brand-ink">จับจอง</span>
              <ChevronRight className="hidden md:inline size-3.5 text-ink-ph shrink-0" />
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={`${crumb.label}-${idx}`}>
                    {idx > 0 && <ChevronRight className="size-3.5 text-ink-ph shrink-0" />}
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className="text-ink-mute hover:text-ink transition-colors truncate max-w-[160px]"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="font-semibold text-ink truncate max-w-[240px] sm:max-w-[360px]">
                        {crumb.label}
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          {/* Right: Notifications, Organization/Department & User Profile */}
          {account && (
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Notification Bell */}
              <Link
                href="/notifications"
                title="ศูนย์แจ้งเตือน"
                aria-label="ศูนย์แจ้งเตือน"
                className="relative grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink-soft hover:bg-hover hover:text-ink transition-colors"
              >
                <Bell className="size-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-status-crit text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>

              {/* User & Department Summary Pill */}
              <Link
                href="/account"
                title="จัดการบัญชีผู้ใช้งาน"
                className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-muted/70 hover:bg-hover px-2.5 py-1 transition-colors"
              >
                <div className="size-7 rounded-full bg-brand-tint text-brand-ink text-[12px] font-bold flex items-center justify-center shrink-0 border border-brand/20">
                  {account.initial || account.name.charAt(0) || <User className="size-3.5" />}
                </div>
                <div className="hidden sm:flex flex-col leading-tight text-left max-w-[190px]">
                  <span className="text-[12.5px] font-semibold text-ink truncate">
                    {account.name}
                  </span>
                  <span className="text-[11px] text-ink-mute truncate">
                    {account.department || account.position || ROLE_LABEL[account.role]}
                  </span>
                </div>
                <span className="hidden md:inline-block rounded-md bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-ink">
                  {ROLE_LABEL[account.role]}
                </span>
              </Link>

              <button
                type="button"
                onClick={handleLogoutAndLogin}
                title="ออกจากระบบ"
                aria-label="ออกจากระบบ"
                className="grid size-9 place-items-center rounded-lg border border-line text-ink-mute hover:bg-danger-bg hover:text-danger-fg hover:border-danger-fg/30 transition-colors"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </header>

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-none p-4 md:p-5 lg:px-6 lg:py-5 min-w-0 print:p-0 print:max-w-none flex flex-col">
          {loading ? (
            <Card className="p-8 max-w-[480px] mx-auto my-8 text-center text-body text-muted flex flex-col items-center justify-center gap-3">
              <div className="size-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span>กำลังตรวจสอบสถานะการเข้าสู่ระบบ...</span>
            </Card>
          ) : !account ? (
            <Card className="p-8 max-w-[500px] mx-auto my-8 flex flex-col items-center text-center gap-4">
              <div className="size-12 rounded-full bg-brand-tint text-brand-ink flex items-center justify-center">
                <Lock className="size-6" />
              </div>
              <div>
                <h2 className="text-heading font-bold text-ink">กรุณาเข้าสู่ระบบก่อนใช้งาน</h2>
                <p className="text-body text-muted mt-1">
                  เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านตามบทบาทที่ต้องการใช้งาน
                </p>
              </div>
              <Link href="/login" className="w-full sm:w-auto">
                <Button variant="primary" className="w-full sm:w-56">
                  ไปหน้าเข้าสู่ระบบ
                </Button>
              </Link>
            </Card>
          ) : !access.allowed ? (
            <Card className="p-6 max-w-[620px] mx-auto my-6 border-danger-fg/30 flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <div className="size-11 rounded-[12px] bg-danger-bg text-danger-fg flex items-center justify-center shrink-0">
                  <ShieldAlert className="size-6" />
                </div>
                <div>
                  <h2 className="text-heading font-bold text-ink">
                    บัญชีของคุณไม่มีสิทธิ์เข้าถึงหน้านี้
                  </h2>
                  <p className="text-body text-muted mt-1 leading-relaxed">
                    ระบบจำกัดการเข้าถึงตามบทบาทและสิทธิ์ย่อยที่ได้รับมอบหมายจากผู้ดูแลระบบ
                  </p>
                </div>
              </div>

              <div className="rounded-control bg-surface-muted border border-line p-4 flex flex-col gap-2 text-caption">
                <div className="flex justify-between gap-2">
                  <span className="text-muted">บัญชีของคุณขณะนี้:</span>
                  <span className="font-semibold text-ink">
                    {account.name} ({ROLE_LABEL[account.role]})
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted">บทบาทที่เข้าใช้งานได้:</span>
                  <span className="font-semibold text-brand">
                    {access.requiredRoles.map((r) => ROLE_LABEL[r]).join(' / ')}
                  </span>
                </div>
                {access.requiredPermission && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">สิทธิ์ย่อยที่ต้องเปิด:</span>
                    <span className="font-semibold text-warn-fg">
                      {PERMISSION_LABEL[access.requiredPermission]}
                    </span>
                  </div>
                )}
                {access.reason && (
                  <div className="pt-2 mt-1 border-t border-line text-danger-fg font-medium">
                    สาเหตุ: {access.reason}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <Button
                  variant="primary"
                  onClick={handleLogoutAndLogin}
                  className="flex-1"
                >
                  ออกจากระบบเพื่อสลับบัญชี
                </Button>
                <Link href={roleHomePath(account.role)}>
                  <Button variant="secondary" className="w-full sm:w-auto">
                    กลับหน้าหลักของฉัน
                  </Button>
                </Link>
              </div>
            </Card>
          ) : (
            <div className="flex-1 flex flex-col justify-between gap-5">
              <div>{children}</div>
              {footer && (
                <div className="print:hidden sticky bottom-3 z-20 mt-2 rounded-card bg-surface/95 backdrop-blur-md border border-line shadow-float px-4 py-3 flex items-center justify-end">
                  {footer}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
