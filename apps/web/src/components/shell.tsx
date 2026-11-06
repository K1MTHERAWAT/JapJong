'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Lock,
  ShieldAlert,
} from 'lucide-react';
import {
  PERMISSION_LABEL,
  ROLE_LABEL,
  Role,
  SidebarServiceItem,
  canAccessRoute,
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
  maxWidth = 'max-w-[1200px]',
  footer,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    account,
    loading,
    logout,
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

  const handleLogoutAndLogin = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="flex min-h-dvh bg-ground text-ink font-sans selection:bg-brand-tint selection:text-brand-ink print:bg-white print:block">
      {/* Responsive Floating Sidebar (Desktop lg+) & Drawer (Mobile <lg) */}
      <Sidebar items={visibleNav} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Main Content Area */}
        <main
          className={`flex-1 w-full ${maxWidth} mx-auto p-4 pt-16 md:p-6 md:pt-16 lg:p-8 min-w-0 print:p-0 print:max-w-none flex flex-col`}
        >
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
            <div className="flex-1 flex flex-col justify-between gap-6">
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
