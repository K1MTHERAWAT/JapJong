'use client';

/**
 * =====================================================================
 * หน้าแดชบอร์ดผู้มีอำนาจลงนามอนุมัติ (Approver Dashboard Page)
 * =====================================================================
 * สำหรับ ปลัด อบต. (APPROVER_L2 - ลงนามที่ 2) และ นายก อบต. (APPROVER_L1 - ลงนามที่ 3 อนุมัติ):
 * 1. ตรวจสอบคิวเอกสารรอลงนามตามลำดับขั้นของบทบาท (Queue: 'l2' หรือ 'l1')
 * 2. คำนวณสถิติประจำวันแบบ Real-time (จำนวนเอกสารที่ลงนามวันนี้ และจำนวนที่สั่งไม่เห็นชอบ)
 * 3. แบนเนอร์แจ้งเตือนเอกสารค้างด่วน พร้อมคำนวณจำนวนวันที่รอนานที่สุด
 * 4. รายการเอกสารรอลงนาม พร้อมลิงก์ตรงไปยังหน้าลงนามดิจิทัล (/approver/sign/[id])
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
// โมเดลข้อมูลคำขอพร้อมเส้นเวลาอนุมัติ
import { RequestWithTimeline } from '@japjong/shared';
// Context ระบบยืนยันตัวตน
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip } from '@/components/ui';
// API SDK และฟังก์ชันจัดรูปแบบวันที่ภาษาไทย
import { api, formatPeriodRange, formatThaiDate } from '@/lib/api';

export default function ApproverHomePage() {
  const router = useRouter();
  // ดึงข้อมูลบัญชีผู้ใช้ปัจจุบันเพื่อแยกบทบาท (APPROVER_L2 หรือ APPROVER_L1)
  const { account } = useAuth();
  // รายการเอกสารที่รอผู้ใช้รายนี้ลงนาม
  const [pending, setPending] = useState<RequestWithTimeline[]>([]);
  // จำนวนเอกสารที่ลงนามไปแล้วในวันนี้
  const [signedTodayCount, setSignedTodayCount] = useState<number>(0);
  // จำนวนเอกสารที่ไม่อนุมัติ/สั่งยกเลิกในวันนี้
  const [rejectedTodayCount, setRejectedTodayCount] = useState<number>(0);
  // สถานะการโหลดข้อมูลจากเซิร์ฟเวอร์
  const [loading, setLoading] = useState(true);

  /**
   * ดึงรายการเอกสารในคิวของผู้ลงนามและคำนวณ KPI ประจำวัน
   */
  useEffect(() => {
    // กำหนดคิวตามบทบาท: L1 (นายก อบต.) หรือ L2 (ปลัด อบต.)
    const queue = account?.role === 'APPROVER_L1' ? 'l1' : 'l2';
    setLoading(true);

    Promise.all([
      api.listRequests({ queue }),
      api.listRequests(),
    ])
      .then(([queueList, allList]) => {
        setPending(queueList);

        // คำนวณสถิติจริงวันนี้จากประวัติเส้นเวลาคำขอ (Timeline History)
        const todayStr = new Date().toISOString().slice(0, 10);
        let signedToday = 0;
        let rejectedToday = 0;

        allList.forEach((r) => {
          const l2Sign = r.timeline?.find((t) => t.key.includes('l2') && t.state === 'done');
          const l1Sign = r.timeline?.find((t) => t.key.includes('l1') && t.state === 'done');
          const currentSign = account?.role === 'APPROVER_L1' ? l1Sign : l2Sign;

          // ตรวจสอบว่าตนเองได้ลงนามในวันนี้หรือไม่
          if (currentSign?.at && currentSign.at.slice(0, 10) === todayStr) {
            signedToday += 1;
          }

          // ตรวจสอบว่ามีคำขอที่ถูกปฏิเสธในวันนี้หรือไม่
          if (r.status === 'rejected' && r.updatedAt && r.updatedAt.slice(0, 10) === todayStr) {
            rejectedToday += 1;
          }
        });

        setSignedTodayCount(signedToday);
        setRejectedTodayCount(rejectedToday);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [account?.role]);

  // ป้ายกำกับขั้นตอนการลงนาม
  const stepLabel = account?.role === 'APPROVER_L1' ? 'ลงนามที่ 3 (อนุมัติ)' : 'ลงนามที่ 2';

  // คำนวณระยะเวลารอนานที่สุดจากคำขอที่เก่าที่สุดในคิว (คำนวณเป็นวัน)
  const oldestPendingDays = pending.length > 0
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(pending[0].createdAt).getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  return (
    <AppShell title="หน้าหลักผู้มีอำนาจ" maxWidth="max-w-[1000px]">
      <div className="flex flex-col gap-4">
        {/* แบนเนอร์สรุปเอกสารที่รอคุณลงนาม */}
        <div className="jw-card p-5 bg-brand-mint flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <b className="text-[19px] sm:text-[22px] text-ink">
              รอคุณลงนาม {pending.length} ฉบับ
            </b>
            <span className="text-[13px] text-ink-mute">
              {pending.length > 0
                ? oldestPendingDays > 0
                  ? `เก่าสุดรอมาแล้ว ${oldestPendingDays} วัน`
                  : 'ได้รับคำขอใหม่วันนี้'
                : 'ไม่มีเอกสารค้างรอการลงนาม'}
            </span>
            {/* ปุ่มด่วนสำหรับลงนามเอกสารฉบับแรกในคิว */}
            {pending.length > 0 && (
              <div className="pt-1">
                <Link href={`/approver/sign/${pending[0].id}`} className="jw-btn jw-btn-sm">
                  ลงนามเอกสาร
                </Link>
              </div>
            )}
          </div>
          {/* ไอคอนเอกสารราชการ */}
          <div className="w-12 h-12 rounded-full bg-white text-brand flex items-center justify-center shrink-0">
            <Icon name="file-text" className="w-6 h-6" />
          </div>
        </div>

        {/* แผงแสดงตัวชี้วัด KPI ประจำวัน (2 คอลัมน์) */}
        <div className="grid grid-cols-2 gap-3.5">
          {/* ตัวนับเอกสารที่ลงนามวันนี้ */}
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[13px] text-ink-mute">ลงนามวันนี้</span>
            <b className="text-[28px] text-ink leading-tight">{signedTodayCount}</b>
          </div>
          {/* ตัวนับเอกสารที่ไม่เห็นชอบวันนี้ */}
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[13px] text-ink-mute">ไม่เห็นชอบ</span>
            <b className="text-[28px] text-ink leading-tight">{rejectedTodayCount}</b>
          </div>
        </div>

        {/* หัวข้อรายการเอกสารรอลงนาม */}
        <div className="flex items-center justify-between">
          <b className="text-[16px] sm:text-[18px]">เอกสารรอลงนาม</b>
          <Link
            href="/history"
            className="text-[13px] text-ink font-semibold inline-flex items-center gap-1 hover:underline"
          >
            ดูทั้งหมด <Icon name="chevron-right" className="w-4 h-4" />
          </Link>
        </div>

        {/* แสดงผลรายการเอกสารหรือสถานะว่าง */}
        {loading ? (
          <div className="jw-card p-8 text-center text-ink-mute text-[14px]">
            กำลังโหลดรายการเอกสาร...
          </div>
        ) : pending.length === 0 ? (
          <div className="jw-card p-8 text-center flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-full bg-brand-mint text-brand flex items-center justify-center">
              <Icon name="check" className="w-6 h-6" />
            </div>
            <b className="text-[15px] text-ink">ไม่มีเอกสารรอลงนามในขณะนี้</b>
            <span className="text-[13px] text-ink-mute">เมื่อมีคำขอส่งมาถึงขั้นตอนของคุณ รายการจะแสดงที่นี่</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {pending.map((r) => {
              // จัดรูปแบบคำอธิบายสถานที่/อุปกรณ์และช่วงเวลา
              const sub =
                r.type === 'booking'
                  ? `${r.title} ${r.subtitle ? `· ${r.subtitle}` : ''} · ${formatPeriodRange(r.periods[0])}`
                  : r.type === 'borrow'
                  ? `${r.title} · ${formatThaiDate(r.pickupDate, false)}–${formatThaiDate(r.returnDate, true)}`
                  : r.title;
              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/approver/sign/${r.id}`)}
                  className="jw-card p-4 flex items-center justify-between gap-3 cursor-pointer hover:ring-1 hover:ring-brand transition"
                >
                  <div className="min-w-0">
                    <b className="block text-[15px] text-ink">{r.code}</b>
                    <span className="text-[13px] text-ink-mute truncate block">{sub}</span>
                  </div>
                  {/* ชิประบุขั้นตอนการลงนาม */}
                  <Chip tone="amber">{r.status === 'pending_l1' ? 'ลงนามที่ 3' : stepLabel}</Chip>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

