'use client';

/**
 * =====================================================================
 * หน้าแดชบอร์ดผู้ดูแลระบบสูงสุด (Super Admin Dashboard Page)
 * =====================================================================
 * ภาพรวมการบริหารจัดการระบบส่วนกลางทั้งหมด:
 * 1. KPI สถิติภาพรวม: คำขอวันนี้, รอดำเนินการ, ใกล้ครบกำหนดคืน, จำนวนผู้ใช้, ทรัพยากร, คำขอเดือนนี้
 * 2. เมนูลัดจัดการระบบ 5 ด้าน:
 *    - บริการ & Sidebar (/admin/services): กำหนดการเปิดปิดเมนูและสิทธิ์
 *    - แม่แบบเอกสาร (/admin/document-templates): ออกแบบฟอร์มราชการและตราครุฑ
 *    - จัดการสิทธิ์ (/admin/permissions): บัญชีผู้ใช้, บทบาท และการมอบหมายสิทธิ์
 *    - ประวัติแจ้งเตือน (/admin/notifications): ตรวจสอบการส่งข้อความ LINE OA และ Outbox
 *    - เอกสาร API (OpenAPI Docs / Swagger UI)
 * 3. รายการบันทึกกิจกรรมล่าสุด (Audit Log / Activity Log Feed)
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ActivityLog } from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Icon, IconName } from '@/components/icons';
import { api, formatThaiDateTime } from '@/lib/api';

export default function AdminHomePage() {
  // State ข้อมูลสรุปภาพรวมแดชบอร์ดแอดมิน
  const [overview, setOverview] = useState<{
    usersCount: number;
    resourcesCount: number;
    monthRequestsCount: number;
    todayRequestsCount?: number;
    pendingCount?: number;
    dueReturnCount?: number;
    activities: ActivityLog[];
  }>({
    usersCount: 248,
    resourcesCount: 32,
    monthRequestsCount: 128,
    todayRequestsCount: 6,
    pendingCount: 3,
    dueReturnCount: 1,
    activities: [],
  });

  // เรียก API โหลดข้อมูลสถิติภาพรวมระบบ
  useEffect(() => {
    api.adminOverview().then(setOverview).catch(() => {});
  }, []);

  // ฟังก์ชันเลือกไอคอนตามประเภทกิจกรรม
  const iconForKind = (kind: ActivityLog['kind']): IconName => {
    switch (kind) {
      case 'user':
        return 'users';
      case 'role':
        return 'shield-check';
      case 'resource':
        return 'building-community';
      default:
        return 'file-text';
    }
  };

  return (
    <AppShell title="หน้าแรกผู้ดูแลระบบ" maxWidth="max-w-[1100px]">
      <div className="flex flex-col gap-5">
        {/* การ์ดสถิติ KPI 6 ด้าน แสดงภาพรวมระบบและคำขอวันนี้ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] text-ink-mute">คำขอวันนี้</span>
            <b className="text-[24px] sm:text-[28px] text-brand leading-tight">
              {overview.todayRequestsCount ?? 6}
            </b>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] text-ink-mute">รอดำเนินการ</span>
            <b className="text-[24px] sm:text-[28px] text-status-crit leading-tight">
              {overview.pendingCount ?? 3}
            </b>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] text-ink-mute">ใกล้ครบกำหนดคืน</span>
            <b className="text-[24px] sm:text-[28px] text-ink leading-tight">
              {overview.dueReturnCount ?? 1}
            </b>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] text-ink-mute">ผู้ใช้ทั้งหมด</span>
            <b className="text-[24px] sm:text-[28px] text-ink leading-tight">{overview.usersCount}</b>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] text-ink-mute">ทรัพยากร</span>
            <b className="text-[24px] sm:text-[28px] text-ink leading-tight">{overview.resourcesCount}</b>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] text-ink-mute">คำขอเดือนนี้</span>
            <b className="text-[24px] sm:text-[28px] text-ink leading-tight">{overview.monthRequestsCount}</b>
          </div>
        </div>

        {/* การ์ดเมนูทางลัดจัดการระบบ */}
        <div>
          <h2 className="text-[16px] sm:text-[18px] font-bold text-ink mb-3">จัดการระบบ</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* เมนูจัดการบริการ & เมนูแถบข้าง */}
            <Link
              href="/admin/services"
              className="jw-card p-4 flex items-center gap-3 hover:ring-1 hover:ring-brand transition"
            >
              <div className="w-11 h-11 rounded-2xl bg-brand-mint text-brand flex items-center justify-center shrink-0">
                <Icon name="list-details" className="w-6 h-6" />
              </div>
              <div>
                <b className="text-[15px] block text-ink">บริการ & Sidebar</b>
                <span className="text-[12px] text-ink-mute">จัดการเมนู & สิทธิ์เข้าถึง</span>
              </div>
            </Link>

            {/* เมนูจัดการแม่แบบเอกสารราชการ */}
            <Link
              href="/admin/document-templates"
              className="jw-card p-4 flex items-center gap-3 hover:ring-1 hover:ring-brand transition"
            >
              <div className="w-11 h-11 rounded-2xl bg-brand-mint text-brand flex items-center justify-center shrink-0">
                <Icon name="file-text" className="w-6 h-6" />
              </div>
              <div>
                <b className="text-[15px] block text-ink">แม่แบบเอกสาร</b>
                <span className="text-[12px] text-ink-mute">ออกแบบ & จัดการแบบฟอร์มราชการ</span>
              </div>
            </Link>

            {/* เมนูจัดการสิทธิ์ผู้ใช้งานและบทบาท */}
            <Link
              href="/admin/permissions"
              className="jw-card p-4 flex items-center gap-3 hover:ring-1 hover:ring-brand transition"
            >
              <div className="w-11 h-11 rounded-2xl bg-brand-mint text-brand flex items-center justify-center shrink-0">
                <Icon name="shield-check" className="w-6 h-6" />
              </div>
              <div>
                <b className="text-[15px] block text-ink">จัดการสิทธิ์</b>
                <span className="text-[12px] text-ink-mute">บัญชีผู้ใช้ & บทบาท</span>
              </div>
            </Link>

            {/* เมนูประวัติและคิวการแจ้งเตือน */}
            <Link
              href="/admin/notifications"
              className="jw-card p-4 flex items-center gap-3 hover:ring-1 hover:ring-brand transition"
            >
              <div className="w-11 h-11 rounded-2xl bg-brand-mint text-brand flex items-center justify-center shrink-0">
                <Icon name="bell" className="w-6 h-6" />
              </div>
              <div>
                <b className="text-[15px] block text-ink">ประวัติแจ้งเตือน</b>
                <span className="text-[12px] text-ink-mute">LINE OA & Outbox</span>
              </div>
            </Link>

            {/* เอกสารทดสอบ API (Interactive Swagger Docs) */}
            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="jw-card p-4 flex items-center gap-3 hover:ring-1 hover:ring-emerald-500 transition group"
            >
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition">
                <Icon name="file-text" className="w-6 h-6" />
              </div>
              <div>
                <b className="text-[15px] block text-ink group-hover:text-emerald-700">OpenAPI Docs ↗</b>
                <span className="text-[12px] text-ink-mute">Interactive Swagger UI</span>
              </div>
            </a>
          </div>
        </div>

        {/* รายการกิจกรรมล่าสุดของระบบ */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <b className="text-[16px] sm:text-[18px]">กิจกรรมล่าสุด</b>
          </div>

          <div className="jw-card px-4 divide-y divide-line">
            {overview.activities.map((act) => (
              <div key={act.id} className="py-3.5 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-soft text-brand flex items-center justify-center shrink-0">
                  <Icon name={iconForKind(act.kind)} className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <b className="block text-[14px] text-ink">{act.title}</b>
                  <span className="text-[12px] text-ink-mute">
                    {act.detail} · {formatThaiDateTime(act.at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
