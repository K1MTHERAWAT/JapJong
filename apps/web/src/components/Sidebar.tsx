'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogIn, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useTheme } from './theme-provider';
import { useAuth } from './auth-context';
import type { NavItem } from './nav';
import { ROLE_META } from '@japjong/shared';

export function Sidebar({
  items,
  mobileDrawerOpen,
  onMobileDrawerChange,
  hideDefaultMobileTrigger = false,
}: {
  items: NavItem[];
  mobileDrawerOpen?: boolean;
  onMobileDrawerChange?: (open: boolean) => void;
  hideDefaultMobileTrigger?: boolean;
}) {
  const path = usePathname();
  const { account, logout, unreadCount } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [internalDrawer, setInternalDrawer] = useState(false);

  const isControlled = typeof mobileDrawerOpen === 'boolean';
  const drawer = isControlled ? mobileDrawerOpen : internalDrawer;
  const setDrawer = useCallback(
    (next: boolean) => {
      if (isControlled) {
        onMobileDrawerChange?.(next);
      } else {
        setInternalDrawer(next);
      }
    },
    [isControlled, onMobileDrawerChange],
  );

  const open = hovered || drawer;
  const openBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDrawer(false);
  }, [path, setDrawer]);

  const closeDrawer = useCallback(() => {
    setDrawer(false);
    openBtn.current?.focus();
  }, [setDrawer]);

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
    return sections.map((sec) => map.get(sec)!).filter((group) => group.length > 0);
  }, [items]);

  return (
    <>
      {/* Floating button only if not controlled or not hidden by parent shell */}
      {!hideDefaultMobileTrigger && (
        <button
          ref={openBtn}
          onClick={() => setDrawer(true)}
          aria-label="เปิดเมนู"
          className="fixed left-3 top-[max(0.75rem,env(safe-area-inset-top,0px))] z-30 grid size-11 place-items-center rounded-control bg-surface border border-line text-ink-soft hover:bg-hover lg:hidden shadow-xs print:hidden cursor-pointer"
        >
          <Menu className="size-5" />
        </button>
      )}

      {/* Backdrop for Mobile Drawer */}
      {drawer && (
        <div
          onClick={closeDrawer}
          className="fixed inset-0 z-40 bg-ink/45 lg:hidden backdrop-blur-xs transition-opacity print:hidden"
        />
      )}

      {/* Sidebar / Drawer */}
      <aside
        aria-label="เมนูหลัก"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={[
          'print:hidden',
          'fixed inset-y-0 left-0 z-50 flex w-drawer max-w-[85vw] flex-col justify-between bg-[#FBFCFA] p-3 shadow-pop lg:flex-none',
          'transition-[transform,width] duration-300 ease-in-out',
          drawer ? 'translate-x-0' : '-translate-x-full',
          'pt-[max(env(safe-area-inset-top,0px),0.75rem)]',
          'pb-[max(env(safe-area-inset-bottom,0px),0.75rem)]',
          'pl-[max(env(safe-area-inset-left,0px),0.75rem)]',
          'lg:pt-3 lg:pb-3 lg:pl-3',
          'lg:sticky lg:top-3 lg:z-auto lg:m-3 lg:h-[calc(100dvh-24px)] lg:translate-x-0',
          'lg:rounded-float lg:border lg:border-line-soft lg:shadow-float overflow-hidden',
          open ? 'lg:w-sidebar' : 'lg:w-[72px]',
        ].join(' ')}
      >
        <div className="relative flex flex-col gap-1 flex-1 min-h-0">
          {/* Header */}
          <div className={`relative flex items-center mb-2 shrink-0 ${open ? 'h-11 justify-between pl-2' : 'h-11 justify-center'}`}>
            <Link
              href={account?.role === 'ADMIN' ? '/admin' : '/'}
              className={`flex items-center gap-2.5 min-w-0 ${open ? '' : 'justify-center'}`}
              title="จับจอง"
            >
              <div className={`size-8 rounded-control overflow-hidden shrink-0 flex items-center justify-center bg-surface-muted border border-line-soft ${open ? '' : 'lg:mx-auto'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="โลโก้จับจอง"
                  className="size-full object-contain"
                />
              </div>
              <span className={['text-heading text-ink font-bold tracking-tight', open ? '' : 'lg:sr-only'].join(' ')}>
                จับจอง
              </span>
            </Link>
            <button
              onClick={closeDrawer}
              aria-label="ปิดเมนู"
              className="grid size-10 place-items-center rounded-control hover:bg-hover text-ink-soft lg:hidden cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav
            aria-label="เมนูระบบ"
            className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden flex-1 min-h-0 pr-0.5 overscroll-contain [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-line [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
          >
            {navGroups.map((group, groupIndex) => (
              <div key={`group-${groupIndex}`} className={`flex flex-col gap-1 ${groupIndex > 0 ? 'mt-2 border-t border-[#CDD5E0] pt-2' : ''}`}>
                {group.map((i) => {
                  const active = i.exact || i.href === '/' ? path === i.href : path.startsWith(i.href);
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      title={i.label}
                      aria-current={active ? 'page' : undefined}
                      className={`flex h-11 items-center gap-3 rounded-control text-ink-soft hover:bg-hover transition-colors aria-[current=page]:bg-brand-tint aria-[current=page]:font-semibold aria-[current=page]:text-brand-ink aria-[current=page]:shadow-sm ${open ? 'px-3' : 'justify-center px-0 lg:mx-auto lg:size-11'}`}
                    >
                      <div className="relative shrink-0">
                        <i.icon className={`size-5 ${open ? '' : 'lg:size-[21px]'}`} />
                        {i.href === '/notifications' && unreadCount > 0 && !open && (
                          <span className="absolute -top-1 -right-1 size-2 rounded-full bg-status-crit" />
                        )}
                      </div>
                      <span className={['text-body truncate flex-1 flex items-center justify-between', open ? '' : 'lg:sr-only'].join(' ')}>
                        <span>{i.label}</span>
                        {i.href === '/notifications' && unreadCount > 0 && open && (
                          <span className="ml-2 px-1.5 py-0.2 rounded-full bg-status-crit text-white text-[11px] font-bold">
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

        {/* Footer / Theme toggle & User Profile */}
        <div className={`border-t border-line-soft pt-2.5 mt-2 flex flex-col gap-1.5 shrink-0 ${open ? '' : 'lg:items-center'}`}>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            aria-label={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            className={`flex h-10 items-center gap-2.5 rounded-control text-ink-soft hover:bg-hover transition-colors font-medium text-caption cursor-pointer ${open ? 'w-full px-2.5 justify-between' : 'justify-center px-0 lg:size-11'}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {theme === 'dark' ? (
                <Sun className="size-4 shrink-0 text-amber-400" />
              ) : (
                <Moon className="size-4 shrink-0 text-brand" />
              )}
              <span className={open ? 'text-ink font-medium' : 'lg:sr-only'}>
                {theme === 'dark' ? 'โหมดมืด (Dark)' : 'โหมดสว่าง (Light)'}
              </span>
            </div>
            {open && (
              <span className="text-[11px] text-muted px-2 py-0.5 rounded-md bg-surface-muted border border-line-soft">
                สลับโหมด
              </span>
            )}
          </button>

          {account ? (
            <>
              <div className={`flex items-center justify-between gap-2 p-1.5 rounded-control bg-surface-muted ${open ? 'w-full' : 'lg:w-11 lg:justify-center lg:bg-transparent'}`}>
                <Link
                  href="/account"
                  title="จัดการบัญชีของฉัน"
                  className="flex items-center gap-2.5 min-w-0 flex-1 rounded-lg hover:opacity-85 transition-opacity"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-tint text-brand-ink font-bold flex items-center justify-center text-caption shrink-0">
                    {account.initial || account.name.charAt(0) || 'ผ'}
                  </div>
                  <div className={['min-w-0 flex-1 leading-tight', open ? '' : 'lg:sr-only'].join(' ')}>
                    <div className="text-caption font-semibold text-ink truncate">{account.name}</div>
                    <div className="text-[11px] text-muted truncate">
                      {ROLE_META[account.role]?.shortLabel || 'ผู้ใช้'}
                    </div>
                  </div>
                </Link>
                {open && (
                  <button
                    type="button"
                    onClick={logout}
                    title="ออกจากระบบ"
                    aria-label="ออกจากระบบ"
                    className="size-8 grid place-items-center rounded-control hover:bg-hover text-ink-soft hover:text-danger-fg shrink-0 cursor-pointer"
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
                  className="hidden lg:grid size-11 place-items-center rounded-control text-danger-fg hover:bg-[#FDE7E7] cursor-pointer"
                >
                  <LogOut className="size-5" />
                </button>
              )}
            </>
          ) : (
            <Link
              href="/login"
              title="เข้าสู่ระบบ"
              className={`flex h-11 items-center gap-3 rounded-control text-ink-soft hover:bg-hover transition-colors font-medium text-body ${open ? 'px-3' : 'justify-center px-0 lg:size-11'}`}
            >
              <LogIn className="size-5 shrink-0" />
              <span className={open ? '' : 'lg:sr-only'}>เข้าสู่ระบบ</span>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
