'use client';

/**
 * =====================================================================
 * คอมโพเนนต์แถบเมนูด้านข้าง (Sidebar & Mobile Drawer Navigation)
 * =====================================================================
 * ทำหน้าที่เป็นเมนูนำทางหลักของระบบจับจอง:
 * 1. Desktop: แถบเมนูลอยแบบย่อ-ขยายได้ (Floating Collapsible Sidebar: 72px -> 260px) เมื่อ Hover
 * 2. Mobile: ลิ้นชักสไลด์ออกด้านข้าง (Slide-over Drawer) รองรับ SafeArea และปุ่มสลับเมนู
 * 3. จัดหมวดหมู่เมนูอัตโนมัติตาม section (ทั่วไป, บริการ, ผู้ดูแล) พร้อมเส้นแบ่ง
 * 4. แจ้งเตือน Badge ตัวเลขอัตโนมัติ (เช่น /notifications unreadCount > 0)
 * 5. ส่วนควบคุมธีม สว่าง/มืด (Theme Toggle) และโปรไฟล์ผู้ใช้พร้อมปุ่มออกจากระบบ
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
// ไอคอนสัญลักษณ์สำหรับเมนู ปุ่มควบคุม และโปรไฟล์
import { LogIn, LogOut, Menu, X } from 'lucide-react';
// Context ข้อมูลผู้ใช้และสถานะการยืนยันตัวตน
import { useAuth } from './auth-context';
import type { NavItem } from './nav';
// ข้อมูล Meta และป้ายชื่อสำหรับบทบาทผู้ใช้งาน
import { ROLE_META } from '@japjong/shared';

export function Sidebar({
  items,
  mobileDrawerOpen,
  onMobileDrawerChange,
  hideDefaultMobileTrigger = false,
}: {
  /** รายการเมนูทั้งหมดที่ส่งเข้ามาแสดงผลตามบทบาท */
  items: NavItem[];
  /** สถานะการเปิด/ปิด Drawer บนมือถือ (กรณีควบคุมจาก Parent Shell) */
  mobileDrawerOpen?: boolean;
  /** ฟังก์ชัน Callback เมื่อสถานะ Drawer บนมือถือเปลี่ยน */
  onMobileDrawerChange?: (open: boolean) => void;
  /** ซ่อนปุ่มลอยเปิดเมนูบนมือถือ (ใช้เมื่อ Parent Shell มีปุ่ม Header ของตนเองแล้ว) */
  hideDefaultMobileTrigger?: boolean;
}) {
  // เส้นทาง Path URL ปัจจุบัน
  const path = usePathname();
  // ข้อมูลบัญชีผู้ใช้ ฟังก์ชันออกจากระบบ และจำนวนแจ้งเตือนที่ยังไม่ได้อ่าน
  const { account, logout, unreadCount } = useAuth();

  // สถานะเมื่อนำเมาส์ไปชี้แถบเมนูบน Desktop เพื่อขยายกว้าง
  const [hovered, setHovered] = useState(false);
  // สถานะเปิด/ปิด Drawer ภายในคอมโพเนนต์ (สำหรับโหมด Uncontrolled)
  const [internalDrawer, setInternalDrawer] = useState(false);

  // ตรวจสอบว่าโหมดการเปิด Drawer ถูกควบคุมจากภายนอกหรือไม่ (Controlled Component)
  const isControlled = typeof mobileDrawerOpen === 'boolean';
  const drawer = isControlled ? mobileDrawerOpen : internalDrawer;

  /**
   * ฟังก์ชันเปลี่ยนสถานะการเปิด/ปิด Drawer
   */
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

  // แถบเมนูจะขยายกว้างเมื่อถูก Hover บน Desktop หรือเมื่อ Drawer เปิดอยู่บนมือถือ
  const open = hovered || drawer;
  const openBtn = useRef<HTMLButtonElement>(null);

  /**
   * ปิด Drawer อัตโนมัติทุกครั้งที่มีการเปลี่ยนหน้า (Route Navigation)
   */
  useEffect(() => {
    setDrawer(false);
  }, [path, setDrawer]);

  /**
   * ปิด Drawer และคืน Focus ไปยังปุ่มเปิดเมนู
   */
  const closeDrawer = useCallback(() => {
    setDrawer(false);
    openBtn.current?.focus();
  }, [setDrawer]);

  /**
   * รองรับการกดปุ่ม Escape เพื่อปิด Mobile Drawer
   */
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawer();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, closeDrawer]);

  /**
   * จัดกลุ่มรายการเมนูตาม Section (เช่น เมนูทั่วไป, เมนูบริการ, เมนูระบบ)
   */
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
      {/* ปุ่มลอยเปิดเมนูบนมือถือ (Floating Hamburger Button) */}
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

      {/* ฉากหลังสีทึบเบลอเมื่อเปิด Mobile Drawer (Backdrop) */}
      {drawer && (
        <div
          onClick={closeDrawer}
          className="fixed inset-0 z-40 bg-ink/45 lg:hidden backdrop-blur-xs transition-opacity print:hidden"
        />
      )}

      {/* โครงสร้างแถบ Sidebar / Drawer */}
      <aside
        aria-label="เมนูหลัก"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={[
          'print:hidden',
          // โหมดมือถือ: เมนูลอยสไลด์จากซ้าย
          'fixed inset-y-0 left-0 z-50 flex w-drawer max-w-[85vw] flex-col justify-between bg-[#FBFCFA] dark:bg-bg p-3 shadow-pop lg:flex-none',
          'transition-[transform,width] duration-300 ease-in-out',
          drawer ? 'translate-x-0' : '-translate-x-full',
          // คำนวณระยะ Safe-Area สำหรับมือถือที่มีรอยบาก
          'pt-[max(env(safe-area-inset-top,0px),0.75rem)]',
          'pb-[max(env(safe-area-inset-bottom,0px),0.75rem)]',
          'pl-[max(env(safe-area-inset-left,0px),0.75rem)]',
          'lg:pt-3 lg:pb-3 lg:pl-3',
          // โหมด Desktop: เมนูลอยมุมซ้าย ติดตรึงตาม Scroll (Sticky)
          'lg:sticky lg:top-3 lg:z-auto lg:m-3 lg:h-[calc(100dvh-24px)] lg:translate-x-0',
          'lg:rounded-float lg:border lg:border-line-soft dark:lg:border-line lg:shadow-float overflow-hidden',
          // สลับขนาดความกว้างตามสถานะการเปิด/ชี้เมาส์ (72px ขณะย่อ / w-sidebar เมื่อขยาย)
          open ? 'lg:w-sidebar' : 'lg:w-[72px]',
        ].join(' ')}
      >
        <div className="relative flex flex-col gap-1 flex-1 min-h-0">
          {/* ส่วนหัว Sidebar แสดงโลโก้และชื่อระบบจับจอง */}
          <div className={`relative flex items-center mb-2 shrink-0 ${open ? 'h-11 justify-between pl-2' : 'h-11 justify-center'}`}>
            <Link
              href={account?.role === 'ADMIN' ? '/admin' : '/'}
              className={`flex items-center gap-2.5 min-w-0 ${open ? '' : 'justify-center'}`}
              title="จับจอง"
            >
              <div className={`w-8 h-8 size-8 rounded-control overflow-hidden shrink-0 flex items-center justify-center bg-surface-muted border border-line-soft ${open ? '' : 'lg:mx-auto'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="โลโก้จับจอง"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className={['text-heading text-ink font-bold tracking-tight', open ? '' : 'lg:sr-only'].join(' ')}>
                จับจอง
              </span>
            </Link>
            {/* ปุ่มปิดเมนูบนหน้าจอมือถือ */}
            <button
              onClick={closeDrawer}
              aria-label="ปิดเมนู"
              className="grid size-10 place-items-center rounded-control hover:bg-hover text-ink-soft lg:hidden cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* รายการลิงก์เมนูนำทาง (Navigation Links) */}
          <nav
            aria-label="เมนูระบบ"
            className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden flex-1 min-h-0 pr-0.5 overscroll-contain [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-line [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
          >
            {navGroups.map((group, groupIndex) => (
              <div key={`group-${groupIndex}`} className={`flex flex-col gap-1 ${groupIndex > 0 ? 'mt-2 border-t border-[#CDD5E0] dark:border-line pt-2' : ''}`}>
                {group.map((i) => {
                  // ตรวจสอบว่ากำลังเปิดหน้านี้อยู่หรือไม่เพื่อเน้นสีแถบเมนู (Active Route)
                  const active = i.exact || i.href === '/' ? path === i.href : path.startsWith(i.href);
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      title={i.label}
                      aria-current={active ? 'page' : undefined}
                      className={`flex h-11 items-center gap-3 rounded-control text-ink-soft hover:bg-hover hover:text-ink transition-colors aria-[current=page]:bg-brand-tint aria-[current=page]:font-semibold aria-[current=page]:text-brand-ink aria-[current=page]:shadow-sm dark:aria-[current=page]:ring-1 dark:aria-[current=page]:ring-brand/40 ${open ? 'px-3' : 'justify-center px-0 lg:mx-auto lg:size-11'}`}
                    >
                      {/* ไอคอนประจำเมนู และจุดแจ้งเตือนสีแดงกรณีเมนูย่อ */}
                      <div className="relative shrink-0">
                        <i.icon className={`size-5 ${open ? '' : 'lg:size-[21px]'}`} />
                        {i.href === '/notifications' && unreadCount > 0 && !open && (
                          <span className="absolute -top-1 -right-1 size-2 rounded-full bg-status-crit" />
                        )}
                      </div>
                      {/* ข้อความชื่อเมนู และ Badge ตัวเลขแจ้งเตือนกรณีเมนูกางออก */}
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

        {/* ส่วนท้ายแถบเมนู (Footer): โปรไฟล์ผู้ใช้ และปุ่มออกจากระบบ */}
        <div className={`border-t border-line-soft dark:border-line pt-2.5 mt-2 flex flex-col gap-1.5 shrink-0 ${open ? '' : 'lg:items-center'}`}>
          {/* กล่องแสดงโปรไฟล์ผู้ใช้ หรือปุ่มเข้าสู่ระบบหากยังไม่ล็อกอิน */}
          {account ? (
            <>
              <div className={`flex items-center justify-between gap-2 p-1.5 rounded-control bg-surface-muted ${open ? 'w-full' : 'lg:w-11 lg:justify-center lg:bg-transparent'}`}>
                {/* ลิงก์ไปยังหน้าตั้งค่าบัญชีของฉัน */}
                <Link
                  href="/account"
                  title="จัดการบัญชีของฉัน"
                  className="flex items-center gap-2.5 min-w-0 flex-1 rounded-lg hover:opacity-85 transition-opacity"
                >
                  {/* รูปย่อหรือตัวอักษรแรกของชื่อ */}
                  <div className="w-8 h-8 size-8 rounded-full bg-brand-tint text-brand-ink font-bold flex items-center justify-center text-caption shrink-0 overflow-hidden">
                    {account.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={account.avatar} alt={account.name} className="size-full object-cover" />
                    ) : (
                      account.initial || account.name.charAt(0) || 'ผ'
                    )}
                  </div>
                  <div className={['min-w-0 flex-1 leading-tight', open ? '' : 'lg:sr-only'].join(' ')}>
                    <div className="text-caption font-semibold text-ink truncate">{account.name}</div>
                    <div className="text-[11px] text-muted truncate">
                      {ROLE_META[account.role]?.shortLabel || 'ผู้ใช้'}
                    </div>
                  </div>
                </Link>
              </div>
              {/* ปุ่มออกจากระบบ (แสดงชัดเจนด้วยโทนสีออกจากระบบตามภาพตัวอย่าง) */}
              <button
                type="button"
                onClick={logout}
                title="ออกจากระบบ"
                aria-label="ออกจากระบบ"
                className={`flex h-10 items-center gap-3 rounded-control text-danger-fg hover:bg-danger-bg/60 transition-colors font-semibold text-body cursor-pointer ${open ? 'w-full px-3' : 'justify-center px-0 lg:size-11'}`}
              >
                <LogOut className="size-5 shrink-0" />
                <span className={open ? 'truncate' : 'lg:sr-only'}>ออกจากระบบ</span>
              </button>
            </>
          ) : (
            // ปุ่มลิงก์เข้าสู่ระบบกรณีผู้ใช้ทั่วไปยังไม่ได้ยืนยันตัวตน
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

