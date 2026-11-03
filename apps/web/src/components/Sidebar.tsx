'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogIn, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from './auth-context';
import type { NavItem } from './nav';
import { ROLE_META } from '@japjong/shared';

export function Sidebar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const { account, logout, unreadCount } = useAuth();
  const [hovered, setHovered] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const open = hovered || drawer;
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

  const navGroups = [
    items.filter((item) => ['/', '/booking', '/borrow', '/repair', '/borrow/my', '/history', '/notifications', '/account'].includes(item.href)),
    items.filter((item) => ['/staff/review', '/staff/handover', '/staff/walk-in', '/staff/verify'].includes(item.href)),
    items.filter((item) => ['/approver'].includes(item.href)),
    items.filter((item) => ['/admin', '/admin/notifications', '/admin/resources', '/admin/permissions'].includes(item.href)),
  ].filter((group) => group.length > 0);

  return (
    <>
      <button
        ref={openBtn}
        onClick={() => setDrawer(true)}
        aria-label="เปิดเมนู"
        className="fixed left-3 top-3 z-30 grid size-11 place-items-center rounded-control bg-surface border border-line text-ink-soft hover:bg-hover lg:hidden shadow-xs print:hidden"
      >
        <Menu className="size-5" />
      </button>

      {drawer && (
        <div
          onClick={closeDrawer}
          className="fixed inset-0 z-40 bg-ink/45 lg:hidden backdrop-blur-xs transition-opacity print:hidden"
        />
      )}

      <aside
        aria-label="เมนูหลัก"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={[
          'print:hidden',
          'fixed inset-y-0 left-0 z-50 flex w-drawer flex-col justify-between bg-[#FBFCFA] p-3 shadow-pop lg:flex-none',
          'transition-[width] duration-300 ease-in-out',
          drawer ? 'translate-x-0' : '-translate-x-full',
          'lg:sticky lg:top-3 lg:z-auto lg:m-3 lg:h-[calc(100dvh-24px)] lg:translate-x-0',
          'lg:rounded-float lg:border lg:border-line-soft lg:shadow-float',
          open ? 'lg:w-sidebar' : 'lg:w-[72px]',
        ].join(' ')}
      >
        <div className="relative flex flex-col gap-1 overflow-visible flex-1">
          {/* Header */}
          <div className={`relative flex items-center mb-2 ${open ? 'h-11 justify-between pl-2' : 'h-11 justify-center'}`}>
            <Link href="/" className={`flex items-center gap-2.5 min-w-0 ${open ? '' : 'justify-center'}`} title="จับจอง">
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
              className="grid size-11 place-items-center rounded-control hover:bg-hover text-ink-soft lg:hidden"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav aria-label="เมนูระบบ" className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
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

        {/* Footer / User Profile */}
        <div className={`border-t border-line-soft pt-3 mt-2 flex flex-col gap-1 ${open ? '' : 'lg:items-center'}`}>
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
                    className="size-8 grid place-items-center rounded-control hover:bg-hover text-ink-soft hover:text-danger-fg shrink-0"
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
                  className="hidden lg:grid size-11 place-items-center rounded-control text-danger-fg hover:bg-[#FDE7E7]"
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
