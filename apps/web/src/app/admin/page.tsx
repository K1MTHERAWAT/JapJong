'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ActivityLog } from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Icon, IconName } from '@/components/icons';
import { FilterToolbar, PageHeader, SearchInput } from '@/components/ui';
import { api, formatThaiDateTime } from '@/lib/api';

const KIND_LABELS: Record<ActivityLog['kind'], { label: string; badgeClass: string }> = {
  request: {
    label: 'คำขอ/อนุมัติ',
    badgeClass: 'bg-brand-tint text-brand border-brand/20',
  },
  user: {
    label: 'บัญชีผู้ใช้',
    badgeClass: 'bg-info-soft text-info border-info/20',
  },
  role: {
    label: 'สิทธิ์/บทบาท',
    badgeClass: 'bg-warn-soft text-warn border-warn/20',
  },
  resource: {
    label: 'ทรัพยากร',
    badgeClass: 'bg-surface-muted text-ink-2 border-line',
  },
};

export default function AdminHomePage() {
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

  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'ALL' | ActivityLog['kind']>('ALL');

  useEffect(() => {
    api.adminOverview().then(setOverview).catch(() => {});
  }, []);

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

  const filteredActivities = useMemo(() => {
    return overview.activities.filter((act) => {
      if (kindFilter !== 'ALL' && act.kind !== kindFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          act.title.toLowerCase().includes(q) ||
          act.detail.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [overview.activities, kindFilter, searchQuery]);

  const kindCounts = useMemo(() => {
    const counts = { request: 0, user: 0, role: 0, resource: 0 };
    for (const act of overview.activities) {
      if (counts[act.kind] !== undefined) counts[act.kind] += 1;
    }
    return counts;
  }, [overview.activities]);

  return (
    <AppShell title="แดชบอร์ดผู้ดูแลระบบ" maxWidth="max-w-none">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="ศูนย์ควบคุมและผู้ดูแลระบบ (System Administration)"
          subtitle="กำกับดูแลข้อมูลทรัพยากร บทบาทผู้ใช้งาน การตั้งค่าบริการ เมนูระบบ และตรวจสอบบันทึกกิจกรรม (Audit Logs)"
          actions={
            <>
              <Link
                href="/admin/services"
                className="px-3.5 py-2 rounded-xl border border-line bg-surface text-ink text-[13px] font-semibold hover:border-brand hover:text-brand transition inline-flex items-center gap-1.5"
              >
                <Icon name="list-details" className="w-4 h-4 text-brand" />
                <span>ตั้งค่าบริการ & เมนู</span>
              </Link>
              <Link
                href="/admin/permissions"
                className="px-3.5 py-2 rounded-xl border border-line bg-surface text-ink text-[13px] font-semibold hover:border-brand hover:text-brand transition inline-flex items-center gap-1.5"
              >
                <Icon name="shield-check" className="w-4 h-4 text-brand" />
                <span>จัดการบทบาทผู้ใช้</span>
              </Link>
              <Link
                href="/admin/resources/new"
                className="jw-btn !h-9 !px-4 !text-[13px] !rounded-xl shadow-xs"
              >
                <Icon name="plus" className="w-4 h-4" />
                <span>เพิ่มทรัพยากรใหม่</span>
              </Link>
            </>
          }
        />

        {/* KPI ภาพรวมระบบ (6 Cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="jw-card p-4 flex flex-col gap-1 border-l-4 border-l-brand">
            <span className="text-[12px] font-medium text-ink-mute">คำขอวันนี้</span>
            <b className="text-[24px] sm:text-[26px] text-brand leading-tight tabular-nums">
              {overview.todayRequestsCount ?? 6}
            </b>
            <span className="text-[11px] text-ink-3">รายการยื่นใหม่วันนี้</span>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1 border-l-4 border-l-status-crit">
            <span className="text-[12px] font-medium text-ink-mute">งานรอดำเนินการ</span>
            <b className="text-[24px] sm:text-[26px] text-status-crit leading-tight tabular-nums">
              {overview.pendingCount ?? 3}
            </b>
            <span className="text-[11px] text-ink-3">รอตรวจ / รอลงนาม</span>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1 border-l-4 border-l-warn">
            <span className="text-[12px] font-medium text-ink-mute">ใกล้ครบกำหนดคืน</span>
            <b className="text-[24px] sm:text-[26px] text-warn leading-tight tabular-nums">
              {overview.dueReturnCount ?? 1}
            </b>
            <span className="text-[11px] text-ink-3">ติดตามการคืนครุภัณฑ์</span>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-mute">ผู้ใช้งานทั้งหมด</span>
            <b className="text-[24px] sm:text-[26px] text-ink leading-tight tabular-nums">
              {overview.usersCount}
            </b>
            <span className="text-[11px] text-ink-3">บัญชีในระบบ</span>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-mute">ทรัพยากรในระบบ</span>
            <b className="text-[24px] sm:text-[26px] text-ink leading-tight tabular-nums">
              {overview.resourcesCount}
            </b>
            <span className="text-[11px] text-ink-3">สถานที่และอุปกรณ์</span>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-mute">คำขอเดือนนี้</span>
            <b className="text-[24px] sm:text-[26px] text-ink leading-tight tabular-nums">
              {overview.monthRequestsCount}
            </b>
            <span className="text-[11px] text-ink-3">สะสมประจำเดือน</span>
          </div>
        </div>

        {/* โมดูลจัดการระบบ (System Management Modules) */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-ink">โมดูลการตั้งค่าและบริหารจัดการระบบ</h2>
            <span className="text-[12px] text-ink-3">เลือกเมนูเพื่อตั้งค่าเชิงลึก</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            <Link
              href="/admin/services"
              className="jw-card p-4 flex items-center gap-3 hover:border-brand hover:shadow-xs transition group"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-tint text-brand flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition">
                <Icon name="list-details" className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <b className="text-[14px] block text-ink truncate group-hover:text-brand transition">
                  บริการ & Sidebar
                </b>
                <span className="text-[11.5px] text-ink-3 block truncate">จัดการเมนู & สิทธิ์เข้าถึง</span>
              </div>
            </Link>

            <Link
              href="/admin/resources"
              className="jw-card p-4 flex items-center gap-3 hover:border-brand hover:shadow-xs transition group"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-tint text-brand flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition">
                <Icon name="building-community" className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <b className="text-[14px] block text-ink truncate group-hover:text-brand transition">
                  ทรัพยากร
                </b>
                <span className="text-[11.5px] text-ink-3 block truncate">สถานที่ & ครุภัณฑ์อุปกรณ์</span>
              </div>
            </Link>

            <Link
              href="/admin/document-templates"
              className="jw-card p-4 flex items-center gap-3 hover:border-brand hover:shadow-xs transition group"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-tint text-brand flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition">
                <Icon name="file-text" className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <b className="text-[14px] block text-ink truncate group-hover:text-brand transition">
                  แม่แบบเอกสาร
                </b>
                <span className="text-[11.5px] text-ink-3 block truncate">ออกแบบฟอร์มราชการ</span>
              </div>
            </Link>

            <Link
              href="/admin/permissions"
              className="jw-card p-4 flex items-center gap-3 hover:border-brand hover:shadow-xs transition group"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-tint text-brand flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition">
                <Icon name="shield-check" className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <b className="text-[14px] block text-ink truncate group-hover:text-brand transition">
                  จัดการบทบาท (RBAC)
                </b>
                <span className="text-[11.5px] text-ink-3 block truncate">บัญชีผู้ใช้ & บทบาท</span>
              </div>
            </Link>

            <Link
              href="/admin/notifications"
              className="jw-card p-4 flex items-center gap-3 hover:border-brand hover:shadow-xs transition group"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-tint text-brand flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition">
                <Icon name="bell" className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <b className="text-[14px] block text-ink truncate group-hover:text-brand transition">
                  ประวัติแจ้งเตือน
                </b>
                <span className="text-[11.5px] text-ink-3 block truncate">LINE OA & Outbox</span>
              </div>
            </Link>

            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="jw-card p-4 flex items-center gap-3 hover:border-brand hover:shadow-xs transition group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition">
                <Icon name="file-text" className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <b className="text-[14px] block text-ink truncate group-hover:text-emerald-700 transition">
                  OpenAPI Docs
                </b>
                <span className="text-[11.5px] text-ink-3 block truncate">Swagger API Reference</span>
              </div>
            </a>
          </div>
        </section>

        {/* ตารางบันทึกกิจกรรมล่าสุดในระบบ (System Audit Logs Data Table) */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[16px] font-bold text-ink">บันทึกกิจกรรมระบบ (System Audit Logs)</h2>
              <p className="text-[12.5px] text-ink-3">
                ตรวจสอบประวัติการทำรายการ การอนุมัติ และการเปลี่ยนแปลงการตั้งค่าในระบบล่าสุด ({filteredActivities.length} รายการ)
              </p>
            </div>
          </div>

          <FilterToolbar>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="ค้นหาชื่อรายการ, รายละเอียดกิจกรรม..."
              className="w-full sm:w-80"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { key: 'ALL', label: `ทั้งหมด (${overview.activities.length})` },
                  { key: 'request', label: `คำขอ (${kindCounts.request})` },
                  { key: 'resource', label: `ทรัพยากร (${kindCounts.resource})` },
                  { key: 'role', label: `บทบาท (${kindCounts.role})` },
                  { key: 'user', label: `ผู้ใช้ (${kindCounts.user})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setKindFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition border ${
                    kindFilter === tab.key
                      ? 'bg-ink text-white border-ink'
                      : 'bg-surface text-ink-2 border-line hover:bg-surface-muted'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </FilterToolbar>

          <div className="jw-card overflow-hidden">
            {filteredActivities.length === 0 ? (
              <div className="p-8 text-center text-[13.5px] text-ink-mute">
                ไม่พบบันทึกกิจกรรมที่ตรงกับเงื่อนไขการค้นหา
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-muted/70 border-b border-line text-[12px] font-semibold text-ink-3 uppercase tracking-wider">
                      <th className="py-3 px-4 w-44">วัน-เวลา</th>
                      <th className="py-3 px-4 w-36">หมวดหมู่</th>
                      <th className="py-3 px-4">รายการกิจกรรม</th>
                      <th className="py-3 px-4">รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-[13.5px]">
                    {filteredActivities.map((act) => {
                      const meta = KIND_LABELS[act.kind] || KIND_LABELS.request;
                      return (
                        <tr key={act.id} className="hover:bg-brand-tint/20 transition">
                          <td className="py-3 px-4 text-[12.5px] text-ink-3 whitespace-nowrap tabular-nums">
                            {formatThaiDateTime(act.at)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold border ${meta.badgeClass}`}
                            >
                              <Icon name={iconForKind(act.kind)} className="w-3.5 h-3.5" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-ink">{act.title}</td>
                          <td className="py-3 px-4 text-ink-2">{act.detail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
