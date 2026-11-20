'use client';

/**
 * =====================================================================
 * โครงสร้างหลักของหน้าจอ (AppShell - Core Layout Container)
 * =====================================================================
 * ใช้คอมโพเนนต์จาก `gov-layout` (StaffSidebar, UserHeader, UserSidebar)
 * โดยปรับสีผ่าน CSS Tokens ของระบบจับจอง (.gov-brand-shell)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  ChevronLeft,
  ShieldAlert,
  UserCircle,
} from 'lucide-react';
import {
  StaffSidebar,
  UserHeader,
  UserSidebar,
  type MenuItem as GovMenuItem,
  type NotificationItem as GovNotificationItem,
  type User as GovUser,
} from 'gov-layout';
import {
  PERMISSION_LABEL,
  ROLE_LABEL,
  Role,
  SidebarServiceItem,
  canAccessServiceRoute,
} from '@japjong/shared';
import { useAuth } from './auth-context';
import { getVisibleNav, type NavItem } from './nav';
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

export interface AppShellProps {
  title?: string;
  rightLabel?: string;
  maxWidth?: string;
  footer?: React.ReactNode;
  onBack?: () => void;
  backHref?: string;
  children: React.ReactNode;
  step?: number;
  totalSteps?: number;
  stepSubtitle?: string;
  allowPublic?: boolean;
  noPadding?: boolean;
}

function toGovMenuItems(items: NavItem[], unreadCount: number): GovMenuItem[] {
  const sections: string[] = [];
  const grouped = new Map<string, NavItem[]>();

  for (const item of items) {
    const sec = item.section || 'ทั่วไป';
    if (!grouped.has(sec)) {
      sections.push(sec);
      grouped.set(sec, []);
    }
    grouped.get(sec)!.push(item);
  }

  const result: GovMenuItem[] = [];
  sections.forEach((sec, secIdx) => {
    const group = grouped.get(sec)!;
    const isLastSection = secIdx === sections.length - 1;
    group.forEach((item, idx) => {
      const IconComp = item.icon;
      const isLastInGroup = idx === group.length - 1;
      const title =
        item.href === '/notifications' && unreadCount > 0
          ? `${item.label} (${unreadCount > 99 ? '99+' : unreadCount})`
          : item.label;

      result.push({
        id: item.id || item.href,
        title,
        path: item.href,
        icon: <IconComp className="size-5" />,
        dividerAfter: !isLastSection && isLastInGroup,
      });
    });
  });

  return result;
}

export function AppShell({
  title,
  rightLabel,
  maxWidth,
  footer,
  onBack,
  backHref,
  children,
  step,
  totalSteps,
  stepSubtitle,
  allowPublic = false,
  noPadding = false,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const {
    account,
    loading,
    logout,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useAuth();

  const [userSidebarOpen, setUserSidebarOpen] = useState(false);
  const [staffSidebarOpen, setStaffSidebarOpen] = useState(false);
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

  useEffect(() => {
    setUserSidebarOpen(false);
  }, [pathname]);

  const visibleNav = useMemo(() => {
    return getVisibleNav(account, dbServices.length > 0 ? dbServices : undefined);
  }, [account, dbServices]);

  const access = useMemo(() => {
    return canAccessServiceRoute(account, pathname, dbServices.length > 0 ? dbServices : undefined);
  }, [account, pathname, dbServices]);

  const handleLogoutAndLogin = useCallback(() => {
    logout();
    router.push('/login');
  }, [logout, router]);

  const handleNavigate = useCallback(
    (path: string) => {
      setUserSidebarOpen(false);
      router.push(path);
    },
    [router],
  );

  const isPublicRoute =
    allowPublic ||
    pathname === '/register' ||
    pathname.startsWith('/register/') ||
    pathname === '/auth/callback' ||
    pathname === '/liff' ||
    pathname === '/verify' ||
    pathname.startsWith('/verify/');

  useEffect(() => {
    if (!loading && !account && !isPublicRoute) {
      router.replace('/');
    }
  }, [loading, account, isPublicRoute, router]);

  const isStaffLayout = Boolean(account && account.role !== 'USER');
  const hasBackAction = Boolean(onBack || backHref);
  const hasSubHeader = Boolean(hasBackAction || title || rightLabel || (step && totalSteps));

  const govUser: GovUser | null = useMemo(() => {
    if (!account) return null;
    const parts = (account.name || '').trim().split(/\s+/);
    return {
      id: account.id,
      firstName: parts[0] || account.nickname || account.username,
      lastName: parts.slice(1).join(' '),
      pictureUrl: account.avatar || undefined,
      role: account.role,
    };
  }, [account]);

  const roleLabel = account ? ROLE_LABEL[account.role] : 'ผู้เยี่ยมชม';

  const staffMenuItems = useMemo(() => {
    const mainItems = visibleNav.filter(
      (item) => item.href !== '/account' && item.href !== '/notifications',
    );
    return toGovMenuItems(mainItems, unreadCount);
  }, [visibleNav, unreadCount]);

  const staffBottomMenuItems = useMemo<GovMenuItem[]>(() => {
    const notifTitle =
      unreadCount > 0
        ? `ศูนย์แจ้งเตือน (${unreadCount > 99 ? '99+' : unreadCount})`
        : 'ศูนย์แจ้งเตือน';
    return [
      {
        id: '/notifications',
        title: notifTitle,
        path: '/notifications',
        icon: <Bell className="size-5" />,
      },
      {
        id: '/account',
        title: 'จัดการบัญชีส่วนตัว',
        path: '/account',
        icon: <UserCircle className="size-5" />,
      },
    ];
  }, [unreadCount]);

  const userMenuItems = useMemo(() => {
    return toGovMenuItems(visibleNav, unreadCount);
  }, [visibleNav, unreadCount]);

  const govNotifications = useMemo<GovNotificationItem[]>(() => {
    return notifications.map((n) => ({
      id: n.id,
      title: n.title,
      description: n.body || n.message || '',
      date: n.at || n.createdAt || '',
      type: 'info',
      isRead: Boolean(n.read ?? n.isRead),
      category:
        n.referenceType === 'approval' || n.referenceType === 'borrow'
          ? 'action'
          : 'general',
    }));
  }, [notifications]);

  const handleNotificationClick = useCallback(
    (item: GovNotificationItem) => {
      const id = String(item.id);
      markNotificationRead(id).catch(() => {});
      const matched = notifications.find((n) => n.id === id);
      if (matched?.link) {
        router.push(matched.link);
      } else {
        router.push('/notifications');
      }
    },
    [markNotificationRead, notifications, router],
  );

  if (!loading && !account && !isPublicRoute) {
    return (
      <div className="min-h-dvh bg-bg flex flex-col items-center justify-center gap-3 text-body text-ink-mute">
        <div className="size-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span>กำลังนำคุณไปยังหน้าหลัก...</span>
      </div>
    );
  }

  return (
    <div className="gov-brand-shell min-h-dvh bg-ground text-ink font-sans selection:bg-brand-tint selection:text-brand-ink print:bg-white print:block transition-colors duration-200 flex flex-col">
      {/* ========================================================
          1. Navigation Shell ตามบทบาท (gov-layout)
          ======================================================== */}
      <div className="print:hidden">
        {isStaffLayout ? (
          <div
            onMouseEnter={() => setStaffSidebarOpen(true)}
            onMouseLeave={() => setStaffSidebarOpen(false)}
          >
            <StaffSidebar
              orgLogo="/logo.png"
              orgName="จับจอง"
              orgSubtitle={account?.department || 'ระบบบริการภาครัฐ'}
              menuItems={staffMenuItems}
              bottomMenuItems={staffBottomMenuItems}
              user={govUser}
              roleLabel={roleLabel}
              onNavigate={handleNavigate}
              onLogout={handleLogoutAndLogin}
              onProfile={() => handleNavigate('/account')}
              currentPath={pathname}
              collapsible={true}
              isOpen={staffSidebarOpen}
              onToggle={() => setStaffSidebarOpen((prev) => !prev)}
            />
          </div>
        ) : (
          <>
            <UserHeader
              user={{
                firstName: govUser?.firstName || 'ผู้เยี่ยมชม',
                lastName: govUser?.lastName || '',
                pictureUrl: govUser?.pictureUrl,
                subtitle: account?.position || roleLabel,
              }}
              notifications={account ? govNotifications : []}
              onToggleSidebar={() => setUserSidebarOpen(true)}
              onMarkAllRead={() => {
                markAllNotificationsRead().catch(() => {});
              }}
              onNotificationClick={handleNotificationClick}
              onProfile={() => handleNavigate(account ? '/account' : '/login')}
            />
            <UserSidebar
              isOpen={userSidebarOpen}
              onClose={() => setUserSidebarOpen(false)}
              user={govUser}
              roleLabel={roleLabel}
              menuItems={userMenuItems}
              onNavigate={handleNavigate}
              onLogout={handleLogoutAndLogin}
              onProfile={() => handleNavigate(account ? '/account' : '/login')}
            />
          </>
        )}
      </div>

      {/* ========================================================
          2. Content Wrapper (ชดเชยความกว้าง StaffSidebar บน Desktop)
          ======================================================== */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-300 print:pl-0 ${
          isStaffLayout ? 'md:pl-[64px]' : ''
        }`}
      >
        {isStaffLayout && (
          <div className="hidden md:block print:hidden">
            <UserHeader
              user={{
                firstName: govUser?.firstName || 'เจ้าหน้าที่',
                lastName: govUser?.lastName || '',
                pictureUrl: govUser?.pictureUrl,
                subtitle: account?.position || roleLabel,
              }}
              notifications={account ? govNotifications : []}
              onToggleSidebar={() => setStaffSidebarOpen((prev) => !prev)}
              onMarkAllRead={() => {
                markAllNotificationsRead().catch(() => {});
              }}
              onNotificationClick={handleNotificationClick}
              onProfile={() => handleNavigate('/account')}
            />
          </div>
        )}

        <main
          className={`flex-1 w-full max-w-none min-w-0 print:p-0 print:max-w-none flex flex-col ${
            noPadding
              ? ''
              : `p-3.5 sm:p-5 lg:px-6 lg:py-6 ${
                  footer ? 'pb-24 sm:pb-28 lg:pb-28' : ''
                } pl-[max(0.875rem,env(safe-area-inset-left,0px))] pr-[max(0.875rem,env(safe-area-inset-right,0px))]`
          }`}
        >
          {hasSubHeader && (
            <div
              className={`print:hidden mb-4 w-full ${
                noPadding ? 'px-3.5 pt-3.5 sm:px-5 sm:pt-5 lg:px-6 lg:pt-6' : ''
              } ${maxWidth && maxWidth !== 'max-w-none' ? `${maxWidth} mx-auto` : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {onBack ? (
                    <button
                      type="button"
                      onClick={onBack}
                      aria-label="ย้อนกลับ"
                      className="size-9 rounded-xl bg-surface border border-line flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition cursor-pointer shrink-0"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                  ) : backHref ? (
                    <Link
                      href={backHref}
                      aria-label="ย้อนกลับ"
                      className="size-9 rounded-xl bg-surface border border-line flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition shrink-0"
                    >
                      <ChevronLeft className="size-5" />
                    </Link>
                  ) : null}

                  <div className="min-w-0">
                    {Boolean(step && totalSteps) && (
                      <p className="text-[11px] font-semibold text-brand tracking-wide leading-tight">
                        {stepSubtitle || `ขั้นตอนที่ ${step} จาก ${totalSteps}`}
                      </p>
                    )}
                    {title && (
                      <h1 className="text-[17px] sm:text-[19px] font-bold text-ink truncate leading-tight tracking-tight">
                        {title}
                      </h1>
                    )}
                  </div>
                </div>

                {rightLabel && (
                  <span className="text-[12px] font-semibold text-brand truncate max-w-[140px] px-2.5 py-1 rounded-full bg-brand-mint border border-brand/20 shrink-0">
                    {rightLabel}
                  </span>
                )}
              </div>

              {Boolean(step && totalSteps) && (
                <div
                  className="flex items-center gap-1.5 mt-2.5 w-full"
                  role="progressbar"
                  aria-valuenow={step}
                  aria-valuemin={1}
                  aria-valuemax={totalSteps}
                  aria-label={`ความคืบหน้าขั้นตอนที่ ${step} จาก ${totalSteps}`}
                >
                  {Array.from({ length: totalSteps || 0 }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                        idx + 1 <= (step || 1) ? 'bg-brand' : 'bg-line'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {loading && !isPublicRoute ? (
            <Card className="p-8 max-w-[480px] mx-auto my-8 text-center text-body text-muted flex flex-col items-center justify-center gap-3">
              <div className="size-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span>กำลังตรวจสอบสถานะการเข้าสู่ระบบ...</span>
            </Card>
          ) : account && !access.allowed && !allowPublic ? (
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
            <div
              className={`flex-1 flex flex-col justify-between gap-5 w-full ${
                maxWidth && maxWidth !== 'max-w-none' ? `${maxWidth} mx-auto` : ''
              }`}
            >
              <div className="w-full flex-1 flex flex-col">{children}</div>
            </div>
          )}
        </main>

        {footer && (
          <div className="print:hidden w-full sticky bottom-0 z-30 bg-surface/98 backdrop-blur-md border-t border-line shadow-[0_-4px_16px_rgba(20,35,31,0.06)] px-3.5 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] lg:bg-transparent lg:backdrop-blur-none lg:border-none lg:shadow-none lg:px-6 lg:pb-3 lg:pt-0 lg:pointer-events-none transition-colors">
            <div
              className={`w-full ${
                maxWidth && maxWidth !== 'max-w-none' ? `${maxWidth} mx-auto` : ''
              } lg:pointer-events-auto lg:rounded-card lg:bg-surface/95 lg:backdrop-blur-md lg:border lg:border-line lg:shadow-float lg:px-4 lg:py-3 lg:flex lg:items-center lg:justify-end`}
            >
              {footer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
