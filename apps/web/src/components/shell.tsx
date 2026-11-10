'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  ChevronLeft,
  Lock,
  Menu,
  Moon,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import {
  PERMISSION_LABEL,
  ROLE_LABEL,
  ROLE_META,
  Role,
  SidebarServiceItem,
  canAccessRoute,
  canAccessServiceRoute,
} from '@japjong/shared';
import { useAuth } from './auth-context';
import { useTheme } from './theme-provider';
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
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    account,
    loading,
    logout,
    unreadCount,
  } = useAuth();
  const { actualTheme, toggleTheme } = useTheme();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
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

  const handleLogoutAndLogin = () => {
    logout();
    router.push('/login');
  };

  const hasBackAction = Boolean(onBack || backHref);

  return (
    <div className="flex min-h-dvh bg-ground text-ink font-sans selection:bg-brand-tint selection:text-brand-ink print:bg-white print:block transition-colors duration-200">
      {/* Responsive Sidebar (Desktop floating sidebar & Mobile off-canvas drawer) */}
      <Sidebar
        items={visibleNav}
        mobileDrawerOpen={mobileDrawerOpen}
        onMobileDrawerChange={setMobileDrawerOpen}
        hideDefaultMobileTrigger={true}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ========================================================
            UNIFIED MOBILE HEADER (< lg)
            - Fixed/Sticky at top, compact height
            - Native Notch / Camera Punch-hole support (pt-safe)
            - Back or Menu trigger, Title & Step Subtitle, Theme Toggle & Notifications
            - Integrated Progress Bar strip at bottom when step & totalSteps provided
            ======================================================== */}
        <header className="lg:hidden sticky top-0 z-30 w-full bg-surface/95 backdrop-blur-md border-b border-line shadow-xs pt-[env(safe-area-inset-top,0px)] print:hidden transition-colors">
          <div className="h-12 px-2.5 flex items-center justify-between gap-2">
            
            {/* Left Controls */}
            <div className="flex items-center gap-1 shrink-0 w-[76px]">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="ย้อนกลับ"
                  className="size-9 rounded-xl flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition cursor-pointer"
                >
                  <ChevronLeft className="size-5" />
                </button>
              ) : backHref ? (
                <Link
                  href={backHref}
                  aria-label="ย้อนกลับ"
                  className="size-9 rounded-xl flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition"
                >
                  <ChevronLeft className="size-5" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(true)}
                  aria-label="เปิดเมนูหลัก"
                  className="size-9 rounded-xl flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition cursor-pointer"
                >
                  <Menu className="size-5" />
                </button>
              )}
            </div>

            {/* Center: Title / Logo / Step info */}
            <div className="min-w-0 flex-1 flex flex-col items-center justify-center text-center px-1 overflow-hidden">
              {step && totalSteps ? (
                <>
                  <span className="text-[11px] font-semibold text-brand tracking-wide leading-tight">
                    {stepSubtitle || `ขั้นตอนที่ ${step} จาก ${totalSteps}`}
                  </span>
                  <h1 className="text-[14.5px] font-bold text-ink truncate leading-tight tracking-tight max-w-full">
                    {title}
                  </h1>
                </>
              ) : title ? (
                <h1 className="text-[15px] font-bold text-ink truncate leading-tight tracking-tight max-w-full">
                  {title}
                </h1>
              ) : (
                <Link href="/" className="inline-flex items-center justify-center gap-2 max-w-full">
                  <div className="size-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-surface-muted border border-line-soft p-0.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="จับจอง" className="size-full object-contain" />
                  </div>
                  <span className="text-[15px] font-bold text-ink tracking-tight truncate">จับจอง</span>
                </Link>
              )}
            </div>

            {/* Right Controls */}
            <div className="flex items-center justify-end gap-1 shrink-0 w-[76px]">
              {/* Sun / Moon Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={actualTheme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
                title={actualTheme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
                className="size-9 rounded-xl flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition cursor-pointer"
              >
                {actualTheme === 'dark' ? (
                  <Sun className="size-4.5 text-amber-400" />
                ) : (
                  <Moon className="size-4.5 text-ink-mute" />
                )}
              </button>

              {hasBackAction ? (
                /* When on a subpage with back button, show hamburger menu on the right */
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(true)}
                  aria-label="เปิดเมนูหลัก"
                  className="size-9 rounded-xl flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition cursor-pointer"
                >
                  <Menu className="size-5" />
                </button>
              ) : rightLabel ? (
                <span className="text-[12px] font-semibold text-brand truncate max-w-[100px] px-2 py-0.5 rounded-full bg-brand-mint border border-brand/20">
                  {rightLabel}
                </span>
              ) : (
                <Link
                  href="/notifications"
                  aria-label="การแจ้งเตือน"
                  className="relative size-9 rounded-xl flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition"
                >
                  <Bell className="size-4.5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-status-crit ring-2 ring-surface" />
                  )}
                </Link>
              )}
            </div>
          </div>

          {/* Integrated Multi-Segment Progress Bar Strip */}
          {Boolean(step && totalSteps) && (
            <div
              className="flex items-center gap-1 px-3 pb-2 pt-0.5 w-full"
              role="progressbar"
              aria-valuenow={step}
              aria-valuemin={1}
              aria-valuemax={totalSteps}
              aria-label={`ความคืบหน้าขั้นตอนที่ ${step} จาก ${totalSteps}`}
            >
              {Array.from({ length: totalSteps || 0 }).map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                    idx + 1 <= (step || 1) ? 'bg-brand' : 'bg-line'
                  }`}
                />
              ))}
            </div>
          )}
        </header>

        {/* ========================================================
            MAIN CONTENT AREA
            - Clean padding across screen sizes
            - Edge-to-edge notch/landscape support
            ======================================================== */}
        <main
          className={`flex-1 w-full max-w-none p-3.5 sm:p-5 lg:px-6 lg:py-6 ${footer ? 'pb-24 sm:pb-28 lg:pb-28' : ''} min-w-0 print:p-0 print:max-w-none flex flex-col pl-[max(0.875rem,env(safe-area-inset-left,0px))] pr-[max(0.875rem,env(safe-area-inset-right,0px))]`}
        >
          {loading ? (
            <Card className="p-8 max-w-[480px] mx-auto my-8 text-center text-body text-muted flex flex-col items-center justify-center gap-3">
              <div className="size-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span>กำลังตรวจสอบสถานะการเข้าสู่ระบบ...</span>
            </Card>
          ) : !account ? (
            <Card className="p-6 sm:p-8 max-w-[500px] w-full mx-auto my-6 sm:my-8 flex flex-col items-center text-center gap-4">
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
            <div className={`flex-1 flex flex-col justify-between gap-5 w-full ${maxWidth && maxWidth !== 'max-w-none' ? `${maxWidth} mx-auto` : ''}`}>
              <div className="w-full">{children}</div>
            </div>
          )}
        </main>

        {/* ========================================================
            UNIFIED FIXED / DOCKED FOOTER (ตรึงแถบล่างไว้เสมอ)
            - Mobile (< lg): Docked cleanly at bottom, minimal height
              with safe-area-inset-bottom support for home bar
            - Desktop (>= lg): Pinned floating card above bottom edge
            ======================================================== */}
        {footer && (
          <div className="print:hidden w-full sticky bottom-0 z-30 bg-surface/98 backdrop-blur-md border-t border-line shadow-[0_-4px_16px_rgba(20,35,31,0.06)] px-3.5 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] lg:bg-transparent lg:backdrop-blur-none lg:border-none lg:shadow-none lg:px-6 lg:pb-3 lg:pt-0 lg:pointer-events-none transition-colors">
            <div className={`w-full ${maxWidth && maxWidth !== 'max-w-none' ? `${maxWidth} mx-auto` : ''} lg:pointer-events-auto lg:rounded-card lg:bg-surface/95 lg:backdrop-blur-md lg:border lg:border-line lg:shadow-float lg:px-4 lg:py-3 lg:flex lg:items-center lg:justify-end`}>
              {footer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
