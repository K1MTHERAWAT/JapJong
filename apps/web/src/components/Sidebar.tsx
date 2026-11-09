'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from './auth-context';
import type { NavItem } from './nav';
import { ROLE_META } from '@japjong/shared';
import { useSidebarPreference } from './sidebar-preference';

export function Sidebar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const { account, logout, unreadCount } = useAuth();
  const pref = useSidebarPreference();
  const [drawer, setDrawer] = useState(false);
  const open = pref.open || drawer;
  const openBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDrawer(false);
  }, [path]);

  const closeDrawer = useCallback(() => {
    setDrawer(false);
    openBtn.current?.focus();
  }, []);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawer();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, closeDrawer]);

  const navGroups = useMemo(() => {
    const sections: string[] = [];
    const map = new Map<string, NavItem[]>();
    for (const item of items) {
      const sec = item.section || 'ทั่วไป';
      if (!map.has(sec)) {
        sections.push(sec);
        map.set(sec, []);
      }
      map.get(sec)!.push(item);
    }
    return sections
      .map((sec) => ({ title: sec, list: map.get(sec)! }))
      .filter((group) => group.list.length > 0);
  }, [items]);

  return (
    <>
      {/* Mobile Hamburger Trigger */}
      <button
        ref={openBtn}
        type="button"
        onClick={() => setDrawer(true)}
        aria-label="เปิดเมนู"
        className="fixed left-3 top-2.5 z-30 grid size-10 place-items-center rounded-lg bg-surface border border-line text-ink-soft hover:bg-hover lg:hidden shadow-xs print:hidden"
      >
        <Menu className="size-5" />
      </button>

      {/* Mobile Backdrop */}
      {drawer && (
        <div
          onClick={closeDrawer}
          className="fixed inset-0 z-40 bg-ink/45 lg:hidden backdrop-blur-xs transition-opacity print:hidden"
        />
      )}

      <aside
        aria-label="เมนูหลัก"
        className={[
          'print:hidden',
          'fixed inset-y-0 left-0 z-50 flex w-drawer flex-col justify-between bg-surface border-r border-line p-3 shadow-pop lg:shadow-none lg:flex-none',
          'transition-[width,transform] duration-200 ease-out',
          drawer ? 'translate-x-0' : '-translate-x-full',
          'lg:sticky lg:top-0 lg:z-30 lg:h-dvh lg:translate-x-0',
          open ? 'lg:w-[244px]' : 'lg:w-[72px]',
        ].join(' ')}
      >
        <div className="relative flex flex-col gap-1 overflow-hidden flex-1">
          {/* Brand Header & Collapse Button */}
          <div
            className={`relative flex items-center pb-2.5 mb-1 border-b border-line-soft ${
              open ? 'h-12 justify-between pl-1.5' : 'h-12 justify-center'
            }`}
          >
            <Link
              href={account?.role === 'ADMIN' ? '/admin' : '/'}
              className={`flex items-center gap-2.5 min-w-0 ${open ? '' : 'justify-center'}`}
              title="จับจอง — ระบบบริหารจัดการสถานที่และครุภัณฑ์"
            >
              <div
                className={`size-8 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-brand-tint border border-brand/20 ${
                  open ? '' : 'lg:mx-auto'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="โลโก้จับจอง"
                  className="size-full object-contain"
                />
              </div>
              <div className={open ? 'min-w-0' : 'lg:sr-only'}>
                <span className="text-[15px] text-ink font-bold tracking-tight block leading-tight truncate">
                  จับจอง (JapJong)
                </span>
                <span className="text-[11px] text-ink-mute block leading-tight truncate">
                  ระบบบริการและครุภัณฑ์รัฐ
                </span>
              </div>
            </Link>

            {/* Desktop Collapse / Expand Button */}
            {open && (
              <button
                type="button"
                onClick={pref.toggle}
                aria-label="ยุบแถบเมนู"
                title="ยุบแถบเมนู"
                className="hidden lg:grid size-7 place-items-center rounded-md border border-line text-ink-mute hover:bg-hover hover:text-ink transition-colors shrink-0"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}

            {/* Mobile Close Drawer Button */}
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="ปิดเมนู"
              className="grid size-9 place-items-center rounded-lg hover:bg-hover text-ink-soft lg:hidden"
            >
              <X className="size-5" />
            </button>
          </div>

          {!open && (
            <button
              type="button"
              onClick={pref.toggle}
              aria-label="ขยายแถบเมนู"
              title="ขยายแถบเมนู"
              className="hidden lg:flex mx-auto mb-1 size-8 items-center justify-center rounded-md border border-line text-ink-mute hover:bg-hover hover:text-ink transition-colors"
            >
              <ChevronRight className="size-4" />
            </button>
          )}

          {/* Navigation Links Grouped by Section */}
          <nav
            aria-label="เมนูระบบ"
            className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden pr-0.5 flex-1"
          >
            {navGroups.map((group, groupIndex) => (
              <div
                key={`group-${group.title}`}
                className={`flex flex-col gap-0.5 ${
                  groupIndex > 0 ? 'mt-2 border-t border-line-soft pt-2' : ''
                }`}
              >
                {open && (
                  <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
                    {group.title}
                  </div>
                )}
                {group.list.map((i) => {
                  const active =
                    i.exact || i.href === '/'
                      ? path === i.href
                      : path === i.href || path.startsWith(`${i.href}/`);
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      title={i.label}
                      aria-current={active ? 'page' : undefined}
                      className={`flex h-10 items-center gap-2.5 rounded-lg text-[13.5px] text-ink-soft hover:bg-hover transition-colors aria-[current=page]:bg-brand-tint aria-[current=page]:font-semibold aria-[current=page]:text-brand-ink ${
                        open ? 'px-2.5' : 'justify-center px-0 lg:mx-auto lg:size-10'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <i.icon className="size-[18px]" />
                        {i.href === '/notifications' && unreadCount > 0 && !open && (
                          <span className="absolute -top-1 -right-1 size-2 rounded-full bg-status-crit" />
                        )}
                      </div>
                      <span
                        className={[
                          'truncate flex-1 flex items-center justify-between',
                          open ? '' : 'lg:sr-only',
                        ].join(' ')}
                      >
                        <span className="truncate">{i.label}</span>
                        {i.href === '/notifications' && unreadCount > 0 && open && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-status-crit text-white text-[10.5px] font-bold leading-none">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Footer / User Profile */}
        <div
          className={`border-t border-line-soft pt-2.5 mt-2 flex flex-col gap-1 ${
            open ? '' : 'lg:items-center'
          }`}
        >
          {account ? (
            <>
              <div
                className={`flex items-center justify-between gap-2 p-1.5 rounded-lg bg-surface-muted border border-line-soft ${
                  open ? 'w-full' : 'lg:w-10 lg:justify-center lg:bg-transparent lg:border-0'
                }`}
              >
                <Link
                  href="/account"
                  title="จัดการบัญชีของฉัน"
                  className="flex items-center gap-2 min-w-0 flex-1 rounded-md hover:opacity-85 transition-opacity"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-tint text-brand-ink font-bold flex items-center justify-center text-caption shrink-0 border border-brand/20">
                    {account.initial || account.name.charAt(0) || 'ผ'}
                  </div>
                  <div
                    className={['min-w-0 flex-1 leading-tight', open ? '' : 'lg:sr-only'].join(' ')}
                  >
                    <div className="text-[12.5px] font-semibold text-ink truncate">
                      {account.name}
                    </div>
                    <div className="text-[11px] text-ink-mute truncate">
                      {ROLE_META[account.role]?.shortLabel || 'ผู้ใช้งาน'}
                      {account.department ? ` · ${account.department}` : ''}
                    </div>
                  </div>
                </Link>
                {open && (
                  <button
                    type="button"
                    onClick={logout}
                    title="ออกจากระบบ"
                    aria-label="ออกจากระบบ"
                    className="size-7 grid place-items-center rounded-md hover:bg-hover text-ink-soft hover:text-danger-fg shrink-0"
                  >
                    <LogOut className="size-4" />
                  </button>
                )}
              </div>
              {!open && (
                <button
                  type="button"
                  onClick={logout}
                  title="ออกจากระบบ"
                  aria-label="ออกจากระบบ"
                  className="hidden lg:grid size-9 place-items-center rounded-lg text-danger-fg hover:bg-danger-bg"
                >
                  <LogOut className="size-4" />
                </button>
              )}
            </>
          ) : (
            <Link
              href="/login"
              title="เข้าสู่ระบบ"
              className={`flex h-10 items-center gap-2.5 rounded-lg text-ink-soft hover:bg-hover transition-colors font-medium text-[13.5px] ${
                open ? 'px-2.5' : 'justify-center px-0 lg:size-10'
              }`}
            >
              <LogIn className="size-[18px] shrink-0" />
              <span className={open ? '' : 'lg:sr-only'}>เข้าสู่ระบบ</span>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
