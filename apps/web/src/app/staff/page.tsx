'use client';

/**
 * =====================================================================
 * หน้าแดชบอร์ดศูนย์ปฏิบัติการเจ้าหน้าที่ (Staff Operation Center Page)
 * =====================================================================
 * รวมศูนย์คิวงานที่เจ้าหน้าที่ต้องดำเนินการ:
 * 1. ตรวจสอบคำขอใช้สถานที่/ยืมอุปกรณ์ (Review Queue)
 * 2. รับงานและจัดการงานแจ้งซ่อมบำรุง (Repair Queue)
 * 3. ตรวจสอบสภาพและตรวจรับคืนอุปกรณ์ (Inspect/Return Queue)
 * 4. ทางลัดจัดการทรัพยากร สแกน QR ตรวจสอบ และยื่นคำขอแทนประชาชน
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  FileText,
  History,
  Package,
  PackageCheck,
  Plus,
  QrCode,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { Equipment, RequestWithTimeline, Venue, hasPermission } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { RequestTypeChip, StatusChip } from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate, formatThaiDateTime } from '@/lib/api';

// ชนิดแท็บกรองสถานะคิวงานของเจ้าหน้าที่
type QueueTab = 'all' | 'review' | 'repair' | 'inspect';

export default function StaffHomePage() {
  const router = useRouter();
  // ดึงข้อมูลบัญชีผู้ใช้ปัจจุบันเพื่อตรวจสิทธิ์และการแสดงผลสังกัด/หน่วยงาน
  const { account } = useAuth();

  // State เก็บรายการคำขอในคิวงานเจ้าหน้าที่
  const [queue, setQueue] = useState<RequestWithTimeline[]>([]);
  // State เก็บรายการคำขอยืมอุปกรณ์ที่อยู่ในสถานะรอตรวจสอบสภาพรับคืน
  const [inspectQueue, setInspectQueue] = useState<RequestWithTimeline[]>([]);
  // State เก็บรายการสถานที่ทั้งหมด
  const [venues, setVenues] = useState<Venue[]>([]);
  // State เก็บรายการอุปกรณ์ทั้งหมด
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  // State สถานะกำลังโหลดข้อมูล
  const [loading, setLoading] = useState(true);

  // State แท็บคิวงานที่กำลังเลือกดู
  const [activeTab, setActiveTab] = useState<QueueTab>('all');
  // State คำค้นหา (เลขคำขอ, ชื่องาน, ชื่อผู้ยื่น)
  const [searchQuery, setSearchQuery] = useState('');

  // โหลดข้อมูลคิวงานและข้อมูลทรัพยากรเมื่อ mount หรือบัญชีผู้ใช้เปลี่ยน
  useEffect(() => {
    setLoading(true);
    Promise.all([
      // คิวงานตรวจสอบคำขอของเจ้าหน้าที่
      api.listRequests({ queue: 'staff' }).catch(() => [] as RequestWithTimeline[]),
      // คิวงานรับมอบ-รับคืนอุปกรณ์
      api.listRequests({ type: 'borrow', queue: 'handover' }).catch(() => [] as RequestWithTimeline[]),
      // รายการสถานที่ทั้งหมด
      api.venues().catch(() => [] as Venue[]),
      // รายการอุปกรณ์ทั้งหมด
      api.equipment().catch(() => [] as Equipment[]),
    ])
      .then(([staffList, handoverList, venueList, eqList]) => {
        setQueue(staffList);
        // คัดกรองเฉพาะคำขอยืมที่ผู้ยื่นนำของมาคืนแล้ว รอเจ้าหน้าที่ตรวจสภาพ
        setInspectQueue(handoverList.filter((r) => r.status === 'return_inspect'));
        setVenues(venueList);
        setEquipment(eqList);
      })
      .finally(() => setLoading(false));
  }, [account?.id]);

  // คำขอด้านสถานที่และอุปกรณ์ที่รอเจ้าหน้าที่ตรวจสอบ (ไม่รวมงานซ่อม)
  const reviewItems = useMemo(() => queue.filter((r) => r.type !== 'repair'), [queue]);
  // รายการแจ้งซ่อมที่รอเจ้าหน้าที่จัดการ/ประสานงาน
  const repairItems = useMemo(() => queue.filter((r) => r.type === 'repair'), [queue]);

  // รวมรายการคิวงานทั้งหมดเข้าด้วยกัน โดยขจัดรายการที่รหัสซ้ำซ้อน
  const combinedQueue = useMemo(() => {
    const map = new Map<string, RequestWithTimeline>();
    for (const item of queue) map.set(item.id, item);
    for (const item of inspectQueue) {
      if (!map.has(item.id)) map.set(item.id, item);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [queue, inspectQueue]);

  // กรองรายการคิวงานตามแท็บที่เลือก และคำค้นหา
  const filteredItems = useMemo(() => {
    return combinedQueue.filter((r) => {
      // แท็บตรวจคำขอสถานที่/อุปกรณ์: กรองงานซ่อมและงานตรวจรับคืนออก
      if (activeTab === 'review' && (r.type === 'repair' || r.status === 'return_inspect')) {
        return false;
      }
      // แท็บแจ้งซ่อม: กรองคำขออื่นออก
      if (activeTab === 'repair' && r.type !== 'repair') {
        return false;
      }
      // แท็บตรวจรับคืน: กรองสถานะอื่นออก
      if (activeTab === 'inspect' && r.status !== 'return_inspect') {
        return false;
      }
      // ค้นหาตามข้อความ (Case-insensitive)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.code.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.requesterName.toLowerCase().includes(q) ||
          (r.organization || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [combinedQueue, activeTab, searchQuery]);

  // จำนวนสถานที่และอุปกรณ์ที่เปิดใช้งานอยู่
  const enabledVenuesCount = venues.filter((v) => v.enabled).length;
  const enabledEquipmentCount = equipment.filter((e) => e.enabled).length;

  // ฟังก์ชันนำทางไปยังหน้ารายละเอียดตามประเภทคำขอและสถานะ
  const handleRowNavigate = (r: RequestWithTimeline) => {
    if (r.type === 'repair') {
      router.push(`/staff/repairs?id=${r.id}`);
    } else if (r.status === 'return_inspect') {
      router.push(`/borrow/my?tab=inspect&id=${r.id}`);
    } else {
      router.push(`/staff/review?id=${r.id}`);
    }
  };

  return (
    <AppShell title="หน้าหลักเจ้าหน้าที่" maxWidth="max-w-none">
      <div className="flex flex-col gap-6">
        {/* 1. ส่วนหัวต้อนรับเจ้าหน้าที่และปุ่มลัด (Header Banner) */}
        <div className="jw-card p-5 sm:p-6 bg-gradient-to-r from-surface via-surface to-brand-tint/40 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-brand-tint text-brand text-[12px] font-semibold mb-2">
              <span className="size-2 rounded-full bg-brand animate-pulse" />
              <span>ศูนย์ปฏิบัติการเจ้าหน้าที่ · {account?.department || 'สำนักปลัด'}</span>
            </div>
            <h1 className="text-[20px] sm:text-[24px] font-bold text-ink tracking-tight">
              สวัสดี, {account?.name || 'เจ้าหน้าที่ธุรการ'}
            </h1>
            <p className="text-[13.5px] text-ink-mute mt-0.5">
              ตรวจสอบคำขอใช้สถานที่และครุภัณฑ์ ติดตามงานซ่อมบำรุง และบริหารจัดการทรัพยากรส่วนกลาง
            </p>
          </div>

          {/* ทางลัดสแกน QR, จัดการทรัพยากร, และเพิ่มทรัพยากรใหม่ */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/staff/verify"
              className="px-3.5 py-2.5 rounded-xl border border-line bg-surface text-ink text-[13px] font-semibold hover:border-brand hover:text-brand transition inline-flex items-center gap-2"
            >
              <QrCode className="size-4 text-brand" />
              <span>สแกนตรวจ QR</span>
            </Link>
            <Link
              href="/staff/resources"
              className="px-3.5 py-2.5 rounded-xl border border-line bg-surface text-ink text-[13px] font-semibold hover:border-brand hover:text-brand transition inline-flex items-center gap-2"
            >
              <Building2 className="size-4 text-brand" />
              <span>จัดการสถานที่/อุปกรณ์</span>
            </Link>
            <Link
              href="/staff/resources/new"
              className="jw-btn !h-10 !px-4 !text-[13px] !rounded-xl shadow-xs inline-flex items-center gap-1.5"
            >
              <Plus className="size-4" />
              <span>เพิ่มทรัพยากรใหม่</span>
            </Link>
          </div>
        </div>

        {/* 2. การ์ดสถิติสรุปงานหลัก 4 ด้าน (KPI Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* การ์ด 1: รอตรวจคำขอสถานที่/อุปกรณ์ */}
          <Link
            href="/staff/review"
            className={`jw-card p-5 flex flex-col justify-between gap-4 border-l-4 border-l-brand hover:border-brand hover:shadow-md transition group ${
              !hasPermission(account, 'review') ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[12.5px] font-semibold text-ink-mute block">
                  รอตรวจคำขอ (สถานที่/อุปกรณ์)
                </span>
                <b className="text-[32px] font-bold text-ink leading-tight mt-1 block tabular-nums">
                  {reviewItems.length}
                </b>
              </div>
              <div className="size-11 rounded-2xl bg-brand-tint text-brand flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition">
                <ClipboardCheck className="size-5" />
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-line text-[12.5px]">
              <span className={reviewItems.length > 0 ? 'text-status-crit font-semibold' : 'text-ink-mute'}>
                {reviewItems.length > 0 ? `รอดำเนินการ ${reviewItems.length} รายการ` : 'ไม่มีงานค้าง'}
              </span>
              <span className="font-semibold text-brand inline-flex items-center gap-1 group-hover:translate-x-0.5 transition">
                ไปหน้าตรวจคำขอ <ArrowRight className="size-3.5" />
              </span>
            </div>
          </Link>

          {/* การ์ด 2: งานแจ้งซ่อมรอจัดการ */}
          <Link
            href="/staff/repairs"
            className={`jw-card p-5 flex flex-col justify-between gap-4 border-l-4 border-l-amber-500 hover:border-amber-500 hover:shadow-md transition group ${
              !hasPermission(account, 'review') ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[12.5px] font-semibold text-ink-mute block">
                  งานแจ้งซ่อมรอจัดการ
                </span>
                <b className="text-[32px] font-bold text-ink leading-tight mt-1 block tabular-nums">
                  {repairItems.length}
                </b>
              </div>
              <div className="size-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-white transition">
                <Wrench className="size-5" />
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-line text-[12.5px]">
              <span className={repairItems.length > 0 ? 'text-amber-700 font-semibold' : 'text-ink-mute'}>
                {repairItems.length > 0 ? `รอรับงาน/ซ่อม ${repairItems.length} รายการ` : 'ไม่มีรายการแจ้งซ่อมค้าง'}
              </span>
              <span className="font-semibold text-amber-700 inline-flex items-center gap-1 group-hover:translate-x-0.5 transition">
                จัดการงานซ่อม <ArrowRight className="size-3.5" />
              </span>
            </div>
          </Link>

          {/* การ์ด 3: รอตรวจรับคืนอุปกรณ์ */}
          <Link
            href="/borrow/my?tab=inspect"
            className="jw-card p-5 flex flex-col justify-between gap-4 border-l-4 border-l-blue-600 hover:border-blue-600 hover:shadow-md transition group"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[12.5px] font-semibold text-ink-mute block">
                  รอตรวจสภาพรับคืนอุปกรณ์
                </span>
                <b className="text-[32px] font-bold text-ink leading-tight mt-1 block tabular-nums">
                  {inspectQueue.length}
                </b>
              </div>
              <div className="size-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition">
                <PackageCheck className="size-5" />
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-line text-[12.5px]">
              <span className={inspectQueue.length > 0 ? 'text-blue-700 font-semibold' : 'text-ink-mute'}>
                {inspectQueue.length > 0 ? `รอตรวจรับคืน ${inspectQueue.length} รายการ` : 'ตรวจรับคืนครบแล้ว'}
              </span>
              <span className="font-semibold text-blue-700 inline-flex items-center gap-1 group-hover:translate-x-0.5 transition">
                ตรวจรับคืน <ArrowRight className="size-3.5" />
              </span>
            </div>
          </Link>

          {/* การ์ด 4: จัดการทรัพยากรสถานที่ & อุปกรณ์ */}
          <Link
            href="/staff/resources"
            className={`jw-card p-5 flex flex-col justify-between gap-4 border-l-4 border-l-emerald-600 hover:border-brand hover:shadow-md transition group ${
              !hasPermission(account, 'manageResources') ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[12.5px] font-semibold text-ink-mute block">
                  สถานที่ & อุปกรณ์ในระบบ
                </span>
                <b className="text-[32px] font-bold text-ink leading-tight mt-1 block tabular-nums">
                  {venues.length + equipment.length}
                </b>
              </div>
              <div className="size-11 rounded-2xl bg-brand-tint text-brand flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition">
                <Building2 className="size-5" />
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-line text-[12.5px]">
              <span className="text-ink-mute">
                สถานที่ {enabledVenuesCount} แห่ง · อุปกรณ์ {enabledEquipmentCount} รายการ
              </span>
              <span className="font-semibold text-brand inline-flex items-center gap-1 group-hover:translate-x-0.5 transition">
                ตั้งค่าทรัพยากร <ArrowRight className="size-3.5" />
              </span>
            </div>
          </Link>
        </div>

        {/* 3. ผังสองคอลัมน์: ซ้าย = ตารางคิวงาน (8 คอลัมน์), ขวา = เมนูบริการด่วน (4 คอลัมน์) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* คอลัมน์ซ้าย: รายการตารางคิวงาน */}
          <div className="xl:col-span-8 flex flex-col gap-4 min-w-0">
            <div className="jw-card overflow-hidden">
              {/* แถบหัวเรื่องและตัวกรองคิวงาน */}
              <div className="p-4 sm:p-5 border-b border-line flex flex-col gap-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-[17px] font-bold text-ink">
                      คิวงานรอดำเนินการ (Work Queue)
                    </h2>
                    <p className="text-[12.5px] text-ink-mute">
                      คลิกที่รายการเพื่อตรวจสอบเอกสาร ลงนามความเห็นชอบ หรือรับงานแจ้งซ่อม
                    </p>
                  </div>
                  <Link
                    href="/history"
                    className="text-[12.5px] font-semibold text-brand hover:underline inline-flex items-center gap-1"
                  >
                    <span>ดูประวัติคำขอทั้งหมด</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* ปุ่มแท็บเลือกหมวดหมู่งาน */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(
                      [
                        { id: 'all', label: `ทั้งหมด (${combinedQueue.length})` },
                        { id: 'review', label: `สถานที่/อุปกรณ์ (${reviewItems.length})` },
                        { id: 'repair', label: `แจ้งซ่อม (${repairItems.length})` },
                        { id: 'inspect', label: `รอตรวจรับคืน (${inspectQueue.length})` },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTab(t.id)}
                        className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition border ${
                          activeTab === t.id
                            ? 'bg-ink text-white border-ink'
                            : 'bg-surface text-ink-mute border-line hover:text-ink hover:bg-surface-muted'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* ช่องค้นหารายการคำขอ */}
                  <div className="relative w-full sm:w-64">
                    <Search className="size-4 text-ink-mute absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ค้นหาเลขที่คำขอ, ชื่อผู้ยื่น..."
                      className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-8 text-[13px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ส่วนเนื้อหาตารางคิวงาน */}
              {loading ? (
                <div className="p-10 text-center text-[13.5px] text-ink-mute">
                  กำลังโหลดรายการคิวงาน...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-10 text-center flex flex-col items-center gap-2">
                  <div className="size-11 rounded-full bg-brand-tint text-brand flex items-center justify-center">
                    <ClipboardCheck className="size-5" />
                  </div>
                  <b className="text-[14.5px] text-ink">ไม่มีรายการคิวงานที่รอดำเนินการในหมวดนี้</b>
                  <span className="text-[12.5px] text-ink-mute">
                    คำขอใหม่ที่ยื่นเข้ามาจะแสดงในตารางนี้โดยอัตโนมัติ
                  </span>
                </div>
              ) : (
                <>
                  {/* แสดงผลแบบตารางบนจอ Desktop */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-muted/70 border-b border-line text-[12px] font-semibold text-ink-mute">
                          <th className="py-3 px-4">เลขที่คำขอ</th>
                          <th className="py-3 px-4">ประเภท</th>
                          <th className="py-3 px-4">รายการ / เรื่อง</th>
                          <th className="py-3 px-4">ผู้ยื่นคำขอ</th>
                          <th className="py-3 px-4">กำหนดการใช้ / วันที่</th>
                          <th className="py-3 px-4">สถานะ</th>
                          <th className="py-3 px-4 text-right">การดำเนินการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line text-[13.5px]">
                        {filteredItems.map((r) => {
                          // จัดรูปแบบวันเวลาตามประเภทคำขอ
                          const scheduleText =
                            r.type === 'booking'
                              ? formatPeriodRange(r.periods?.[0])
                              : r.type === 'borrow'
                                ? `${formatThaiDate(r.pickupDate, false)} – ${formatThaiDate(r.returnDate, true)}`
                                : formatThaiDateTime(r.createdAt);

                          return (
                            <tr
                              key={r.id}
                              onClick={() => handleRowNavigate(r)}
                              className="hover:bg-brand-tint/20 cursor-pointer transition"
                            >
                              <td className="py-3.5 px-4 font-bold text-brand whitespace-nowrap">
                                {r.code}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <RequestTypeChip type={r.type} />
                              </td>
                              <td className="py-3.5 px-4 max-w-[240px]">
                                <b className="text-ink font-semibold block truncate">{r.title}</b>
                                {r.subtitle && (
                                  <span className="text-[12px] text-ink-mute block truncate">
                                    {r.subtitle}
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span className="font-medium text-ink block">{r.requesterName}</span>
                                <span className="text-[11.5px] text-ink-mute block">
                                  {r.organization || 'ประชาชน/หน่วยงาน'}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-[12.5px] text-ink-mute whitespace-nowrap">
                                {scheduleText}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <StatusChip status={r.status} />
                              </td>
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRowNavigate(r);
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-brand text-white text-[12px] font-semibold hover:bg-brand-ink transition inline-flex items-center gap-1"
                                >
                                  <span>
                                    {r.type === 'repair'
                                      ? 'จัดการงานซ่อม'
                                      : r.status === 'return_inspect'
                                        ? 'ตรวจรับคืน'
                                        : 'ตรวจคำขอ'}
                                  </span>
                                  <ArrowRight className="size-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* แสดงผลแบบการ์ดรายการบนจอมือถือ Mobile */}
                  <div className="md:hidden divide-y divide-line">
                    {filteredItems.map((r) => {
                      const sub =
                        r.type === 'booking'
                          ? `${r.title} · ${formatPeriodRange(r.periods?.[0])} · ${r.requesterName}`
                          : r.type === 'borrow'
                            ? `${r.title} · ${formatThaiDate(r.pickupDate, false)}–${formatThaiDate(r.returnDate, true)}`
                            : `${r.title} · ${r.requesterName}`;
                      return (
                        <div
                          key={r.id}
                          onClick={() => handleRowNavigate(r)}
                          className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-brand-tint/20 transition"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <b className="text-[14.5px] text-brand">{r.code}</b>
                              <RequestTypeChip type={r.type} />
                            </div>
                            <span className="text-[13px] text-ink font-medium truncate block">
                              {sub}
                            </span>
                          </div>
                          <StatusChip status={r.status} />
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* คอลัมน์ขวา: ทางลัดเมนูปฏิบัติงานและบริการด่วน */}
          <div className="xl:col-span-4 flex flex-col gap-4">
            <div className="jw-card p-5 flex flex-col gap-3.5">
              <div>
                <h2 className="text-[16px] font-bold text-ink">เมนูปฏิบัติงานและบริการด่วน</h2>
                <p className="text-[12px] text-ink-mute">
                  ทางลัดสำหรับทำรายการแทนผู้มาติดต่อและจัดการข้อมูลระบบ
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2.5">
                {/* ลิงก์จัดการสถานที่และอุปกรณ์ */}
                <Link
                  href="/staff/resources"
                  className="p-3 rounded-xl border border-line hover:border-emerald-500 hover:bg-emerald-50/50 transition flex items-center gap-3 group"
                >
                  <div className="size-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition">
                    <Building2 className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="text-[13.5px] text-ink block truncate group-hover:text-emerald-800 transition">
                      จัดการสถานที่และอุปกรณ์
                    </b>
                    <span className="text-[11.5px] text-ink-mute block truncate">
                      เพิ่ม/แก้ไข/เปิด-ปิดทรัพยากรและแบบฟอร์ม
                    </span>
                  </div>
                  <ArrowRight className="size-4 text-ink-mute group-hover:text-emerald-700 shrink-0 transition" />
                </Link>

                {/* ลิงก์ตั้งค่าแม่แบบฟอร์มราชการ */}
                <Link
                  href="/staff/resources?tab=forms"
                  className="p-3 rounded-xl border border-line hover:border-indigo-500 hover:bg-indigo-50/50 transition flex items-center gap-3 group"
                >
                  <div className="size-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition">
                    <FileText className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="text-[13.5px] text-ink block truncate group-hover:text-indigo-800 transition">
                      ตั้งค่าแม่แบบฟอร์มราชการ
                    </b>
                    <span className="text-[11.5px] text-ink-mute block truncate">
                      ปรับแต่งหัวกระดาษและช่องลงนาม
                    </span>
                  </div>
                  <ArrowRight className="size-4 text-ink-mute group-hover:text-indigo-700 shrink-0 transition" />
                </Link>

                {/* ลิงก์ยื่นคำขอใช้สถานที่แทนประชาชน */}
                <Link
                  href="/booking"
                  className="p-3 rounded-xl border border-line hover:border-teal-500 hover:bg-teal-50/50 transition flex items-center gap-3 group"
                >
                  <div className="size-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 group-hover:bg-teal-600 group-hover:text-white transition">
                    <Building2 className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="text-[13.5px] text-ink block truncate group-hover:text-teal-800 transition">
                      ยื่นคำขอใช้สถานที่
                    </b>
                    <span className="text-[11.5px] text-ink-mute block truncate">
                      จองห้องประชุม ศาลา สนามกีฬา
                    </span>
                  </div>
                  <ArrowRight className="size-4 text-ink-mute group-hover:text-teal-700 shrink-0 transition" />
                </Link>

                {/* ลิงก์ยื่นคำขอยืม–คืนอุปกรณ์แทนประชาชน */}
                <Link
                  href="/borrow"
                  className="p-3 rounded-xl border border-line hover:border-amber-500 hover:bg-amber-50/50 transition flex items-center gap-3 group"
                >
                  <div className="size-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition">
                    <Package className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="text-[13.5px] text-ink block truncate group-hover:text-amber-800 transition">
                      ยื่นคำขอยืม–คืนอุปกรณ์
                    </b>
                    <span className="text-[11.5px] text-ink-mute block truncate">
                      เบิกยืมเครื่องเสียง เต็นท์ โต๊ะ เก้าอี้
                    </span>
                  </div>
                  <ArrowRight className="size-4 text-ink-mute group-hover:text-amber-700 shrink-0 transition" />
                </Link>

                {/* ลิงก์ดูประวัติคำขอทั้งหมดในระบบ */}
                <Link
                  href="/history"
                  className="p-3 rounded-xl border border-line hover:border-blue-500 hover:bg-blue-50/50 transition flex items-center gap-3 group"
                >
                  <div className="size-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition">
                    <History className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="text-[13.5px] text-ink block truncate group-hover:text-blue-800 transition">
                      ประวัติคำขอทั้งหมดในระบบ
                    </b>
                    <span className="text-[11.5px] text-ink-mute block truncate">
                      ค้นหาและดูเอกสารใบอนุญาตย้อนหลัง
                    </span>
                  </div>
                  <ArrowRight className="size-4 text-ink-mute group-hover:text-blue-700 shrink-0 transition" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
