'use client'; // กำหนดให้คอมโพเนนต์นี้ทำงานในฝั่ง Client (React Client Component)

// นำเข้า React Hooks พื้นฐานสำหรับจัดการ State, Effects และ Callbacks
import React, { useCallback, useEffect, useState } from 'react';
// นำเข้า Link สำหรับการนำทางระหว่างหน้าใน Next.js
import Link from 'next/link';
// นำเข้า useParams hook สำหรับดึง Dynamic Route Parameter (id ของคำขอ)
import { useParams } from 'next/navigation';
// นำเข้า Type และค่าคงที่ระดับการลงนามจากแพ็กเกจกลาง shared
import { Equipment, RequestWithTimeline, SIGN_LEVEL_TITLE } from '@japjong/shared';
// นำเข้า Auth Context สำหรับตรวจสอบสิทธิ์และบทบาทของผู้ใช้
import { useAuth } from '@/components/auth-context';
// นำเข้า AppShell และฟังก์ชันหาเส้นทางหน้าแรกตามบทบาท
import { AppShell, roleHomePath } from '@/components/shell';
// นำเข้า UI Components: เอกสารราชการ A4, ป้ายประเภทคำขอ, การ์ดแสดงลายเซ็น, ป้ายสถานะ, แถบไทม์ไลน์
import { OfficialGovFormDocument, RequestTypeChip, SignaturePreviewCard, StatusChip, Timeline } from '@/components/ui';
// นำเข้า API client และฟังก์ชันจัดรูปแบบวันที่เวลาภาษาไทย
import { api, formatPeriodRange, formatThaiDate, formatThaiDateTime } from '@/lib/api';

/**
 * หน้ารายละเอียดคำขอ (/requests/[id])
 * แสดงข้อมูลสรุปคำขอ, เอกสารราชการ A4 พร้อมพิมพ์, ไทม์ไลน์ 4 ระดับ,
 * และการ์ดแสดงลายมือชื่อดิจิทัล 4 ฝ่าย (ผู้ขอ, จนท., ปลัด, นายก)
 */
export default function RequestDetailPage() {
  // ดึงรหัส ID ของคำขอจาก URL Parameters (/requests/:id)
  const params = useParams<{ id: string }>();
  // ดึงข้อมูลบัญชีผู้ใช้ปัจจุบันที่ล็อกอินอยู่
  const { account } = useAuth();
  // State เก็บข้อมูลคำขอพร้อมไทม์ไลน์สถานะ
  const [req, setReq] = useState<RequestWithTimeline | null>(null);
  // State ข้อมูลอุปกรณ์สำหรับอ้างอิงชื่ออุปกรณ์ในคำขอ
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  // State ควบคุมการแสดง/ซ่อนแบบฟอร์มเอกสารราชการ A4 แบบเต็มใบ
  const [showOfficialForm, setShowOfficialForm] = useState(true);

  /**
   * ฟังก์ชันดึงข้อมูลรายละเอียดคำขอจาก Backend API ตาม ID
   */
  const load = useCallback(() => {
    if (!params.id) return;
    api
      .getRequest(params.id)
      .then(setReq)
      .catch(() => {});
  }, [params.id]);

  // โหลดข้อมูลคำขอและรายการอุปกรณ์เมื่อเปิดหน้าจอ
  useEffect(() => {
    load();
    api.equipment().then(setEquipmentList).catch(() => {});
  }, [load]);

  // เส้นทางย้อนกลับตามบทบาทของผู้ใช้งาน
  const backHref = roleHomePath(account?.role);

  // แสดงหน้าจอระหว่างกำลังโหลดข้อมูลคำขอ
  if (!req) {
    return (
      <AppShell title="รายละเอียดคำขอ" backHref={backHref}>
        <div className="jw-card p-8 text-center text-[14px] text-ink-mute">กำลังโหลดข้อมูลคำขอ...</div>
      </AppShell>
    );
  }

  // คำนวณเงื่อนไขสถานะการอนุมัติสมบูรณ์
  const isFullyApproved = req.status === 'approved' || req.status === 'borrowing' || req.status === 'returned';

  // ตรวจสอบสิทธิ์ว่าเจ้าหน้าที่สามารถกดไปหน้าตรวจรับคำขอนี้ได้หรือไม่
  const canStaffReview =
    account?.role === 'STAFF' &&
    (req.status === 'pending_staff' ||
      (req.type === 'repair' && (req.status === 'repair_submitted' || req.status === 'repair_in_progress')));

  // ตรวจสอบสิทธิ์ว่าผู้บริหาร (ปลัด หรือ นายก) สามารถกดไปหน้าลงนามได้หรือไม่
  const canApproverSign =
    (account?.role === 'APPROVER_L2' && req.status === 'pending_l2') ||
    (account?.role === 'APPROVER_L1' && req.status === 'pending_l1');

  // ดึงข้อมูลลายมือชื่อของแต่ละระดับ (สำหรับคำขอสถานที่และอุปกรณ์)
  const sigStaff = req.type !== 'repair' ? req.signatures.find((s) => s.level === 'staff') : undefined;
  const sigL2 = req.type !== 'repair' ? req.signatures.find((s) => s.level === 'l2') : undefined;
  const sigL1 = req.type !== 'repair' ? req.signatures.find((s) => s.level === 'l1') : undefined;

  return (
    // โครงเลย์เอาต์หลัก พร้อมกำหนดแถบปุ่ม Action Footer ตามสถานะและสิทธิ์ของผู้ใช้
    <AppShell
      title={`คำขอ ${req.code}`}
      backHref={backHref}
      maxWidth="max-w-[1080px]"
      footer={
        canStaffReview ? (
          // ปุ่มสำหรับเจ้าหน้าที่ตรวจรับคำขอ
          <Link
            href={req.type === 'repair' ? `/staff/repairs?id=${req.id}` : `/staff/review?id=${req.id}`}
            className="jw-btn w-full sm:w-64"
          >
            {req.type === 'repair' ? 'ไปหน้าจัดการงานซ่อมนี้ →' : 'ไปหน้าตรวจและลงนามคำขอนี้ →'}
          </Link>
        ) : canApproverSign ? (
          // ปุ่มสำหรับผู้บริหารลงนาม 2 ระดับ
          <Link href={`/approver/sign/${req.id}`} className="jw-btn w-full sm:w-64">
            ไปหน้าลงนามเอกสาร 3 ระดับ →
          </Link>
        ) : req.status !== 'cancelled' && req.status !== 'rejected' ? (
          // ปุ่มสำหรับผู้ยื่นคำขอ: ขอยกเลิกคำขอ หรือ ขอเลื่อนวันเวลา
          <div className="flex w-full sm:w-auto gap-2.5">
            {/* ยกเลิกคำขอ: สามารถยกเลิกได้ตลอดทุกสถานะก่อนการใช้งานเสร็จสิ้น */}
            {(req.type === 'booking' || req.type === 'borrow') &&
              ['pending_staff', 'pending_l2', 'pending_l1', 'approved'].includes(req.status) && (
                <Link
                  href={`/requests/${req.id}/reschedule?mode=cancel`}
                  className="jw-btn-red flex-1 sm:w-40"
                >
                  ยกเลิกคำขอ
                </Link>
              )}

            {/* ขอเลื่อนวัน / แก้ไข: แสดงเฉพาะก่อนปลัดหรือนายกลงนาม (pending_staff หรือ pending_l2 เท่านั้น)
                ถ้าปลัด (L2) หรือ นายก (L1) ลงนามแล้ว ปุ่มนี้จะหายไปเพื่อป้องกันการแก้ไขเอกสารที่ลงนามแล้ว */}
            {(req.type === 'booking' || req.type === 'borrow') &&
              ['pending_staff', 'pending_l2'].includes(req.status) && (
                <Link
                  href={`/requests/${req.id}/reschedule?mode=reschedule`}
                  className="jw-btn flex-[1.4] sm:w-48"
                >
                  ขอเลื่อนวัน / แก้ไข
                </Link>
              )}
            {/* ทางลัดไปหน้ารับมอบ/ส่งคืนอุปกรณ์สำหรับงานขอยืม */}
            {req.type === 'borrow' &&
              (req.status === 'approved' || req.status === 'borrowing' || req.status === 'return_inspect') && (
                <Link href="/borrow/my" className="jw-btn flex-1 sm:w-56">
                  {req.status === 'approved'
                    ? 'ไปหน้ายืนยันรับมอบอุปกรณ์'
                    : req.status === 'borrowing'
                    ? 'ไปหน้าแจ้งคืนอุปกรณ์'
                    : 'ไปหน้าตรวจสอบการคืน'}
                </Link>
              )}
            {/* ปุ่มเปิดดูใบอนุญาตราชการ PDF เมื่อลงนามอนุมัติครบสมบูรณ์ */}
            {isFullyApproved && (
              <Link href={`/approver/permit/${req.id}`} className="jw-btn-sec flex-1 sm:w-48">
                ดูใบอนุญาต (PDF)
              </Link>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {/* แถบหัวข้อสถานะคำขอ */}
        <div className="flex items-center justify-between">
          <b className="text-[17px] text-ink">สถานะคำขอ</b>
          <StatusChip status={req.status} />
        </div>

        {/* การ์ดสรุปข้อมูลสำคัญของคำขอ */}
        <div className="jw-card p-5 flex flex-col gap-2 text-[14px]">
          {/* เลขคำขอ */}
          <div className="flex gap-2">
            <b className="w-24 shrink-0 text-ink-mute">เลขคำขอ</b>
            <span className="font-semibold">{req.code}</span>
          </div>
          {/* ประเภทคำขอ */}
          <div className="flex gap-2">
            <b className="w-24 shrink-0 text-ink-mute">ประเภท</b>
            <RequestTypeChip type={req.type} />
          </div>
          {/* ชื่อสถานที่ หรือรายการที่ขอ */}
          <div className="flex gap-2">
            <b className="w-24 shrink-0 text-ink-mute">รายการ</b>
            <span className="font-semibold">{req.title}</span>
          </div>

          {/* ช่วงวันเวลา (สำหรับจองสถานที่) */}
          {req.type === 'booking' && (
            <div className="flex gap-2">
              <b className="w-24 shrink-0 text-ink-mute">วันเวลา</b>
              <div className="flex flex-col">
                {req.periods.map((p, i) => (
                  <span key={i}>{formatPeriodRange(p)}</span>
                ))}
              </div>
            </div>
          )}

          {/* อุปกรณ์เสริมที่ขอใช้ร่วมด้วย */}
          {req.type === 'booking' && req.extraItems && req.extraItems.length > 0 && (
            <div className="flex gap-2 items-start">
              <b className="w-24 shrink-0 text-ink-mute">อุปกรณ์เสริม</b>
              <div className="flex flex-wrap gap-1.5">
                {req.extraItems.map((it, i) => {
                  const eq = equipmentList.find((e) => e.id === it.equipmentId);
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 bg-soft px-2.5 py-0.5 rounded-full text-[13px] font-medium"
                    >
                      {eq?.name || it.equipmentId} <b className="text-brand font-bold">x{it.qty}</b>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ช่วงวันที่ขอใช้ (สำหรับขอยืมอุปกรณ์) */}
          {req.type === 'borrow' && (
            <>
              <div className="flex gap-2">
                <b className="w-24 shrink-0 text-ink-mute">ช่วงขอใช้</b>
                <span>
                  {formatThaiDate(req.pickupDate, false)}–{formatThaiDate(req.returnDate, true)}
                </span>
              </div>
              {req.receivedAt && (
                <div className="flex gap-2">
                  <b className="w-24 shrink-0 text-ink-mute">วันที่รับมอบ</b>
                  <span className="font-semibold text-brand">
                    {formatThaiDate(req.receivedAt, true)} ({formatThaiDateTime(req.receivedAt)})
                  </span>
                </div>
              )}
            </>
          )}

          {/* ข้อมูลผู้ยื่นคำขอ */}
          <div className="flex gap-2">
            <b className="w-24 shrink-0 text-ink-mute">ผู้ขอ</b>
            <span>
              {req.requesterName} · {req.organization}
              {req.requesterPhone ? ` · โทร. ${req.requesterPhone}` : ''}
            </span>
          </div>

          {/* ข้อความวัตถุประสงค์ถึงเจ้าหน้าที่ */}
          {req.type !== 'repair' && req.purpose ? (
            <div className="flex gap-2 items-start bg-amber-50/80 border border-amber-200/80 rounded-xl p-2.5 text-[13px] text-amber-950">
              <b className="w-24 shrink-0 text-amber-900 font-semibold">ข้อความถึง จนท.</b>
              <span className="whitespace-pre-wrap">{req.purpose}</span>
            </div>
          ) : null}

          {/* ลิงก์ดาวน์โหลดเอกสารใบอนุญาต */}
          <div className="flex gap-2">
            <b className="w-24 shrink-0 text-ink-mute">เอกสาร</b>
            <span>
              คำขอ_{req.code}.pdf{' '}
              {isFullyApproved ? (
                <Link href={`/approver/permit/${req.id}`} className="underline text-brand font-semibold ml-1">
                  เปิดดูใบอนุญาต (PDF)
                </Link>
              ) : (
                <span className="text-ink-mute text-[12px] ml-1">(ออกใบอนุญาตเมื่อลงนามครบทั้ง 4 ฝ่าย)</span>
              )}
            </span>
          </div>

          {/* กรณีคำขอถูกปฏิเสธ แสดงเหตุผลการปฏิเสธ */}
          {req.rejectReason && (
            <div className="mt-2 rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-3.5 py-2 text-[13px] text-[#7a1010]">
              <b>หมายเหตุ:</b> {req.rejectReason}
            </div>
          )}
        </div>

        {/* แบบฟอร์มเอกสารราชการจริงขนาด A4: แบบขอใช้สถานที่ หรือแบบขอยืมครุภัณฑ์ */}
        {req.type !== 'repair' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <b className="text-[16px] text-ink">
                {req.type === 'booking'
                  ? 'เอกสารราชการ: แบบขอใช้สถานที่ราชการ'
                  : 'เอกสารราชการ: แบบคำขอใช้อุปกรณ์ราชการ'}
              </b>
              <button
                type="button"
                onClick={() => setShowOfficialForm((v) => !v)}
                className="text-[12.5px] font-semibold text-brand hover:underline"
              >
                {showOfficialForm ? 'ซ่อนแบบฟอร์มราชการ' : 'แสดงแบบฟอร์มราชการเต็มใบ'}
              </button>
            </div>
            {/* คอมโพเนนต์แสดงแบบฟอร์ม A4 ตามระเบียบงานสารบรรณ พร้อมพิมพ์ */}
            {showOfficialForm && <OfficialGovFormDocument req={req} />}
          </div>
        )}

        {/* ส่วนแสดงลายมือชื่อดิจิทัลของผู้เกี่ยวข้องทุกฝ่าย */}
        <div className="jw-card p-5 flex flex-col gap-3">
          <div>
            <b className="text-[16px] text-ink block">
              {req.type === 'repair' ? 'ความคืบหน้าการดำเนินงาน (3 ขั้นตอน)' : 'ลายมือชื่อผู้เกี่ยวข้องทุกฝ่าย (4 ฝ่าย)'}
            </b>
            <span className="text-[12.5px] text-ink-mute">
              {req.type === 'repair'
                ? 'งานแจ้งซ่อมบำรุงดำเนินการตามลำดับขั้นตอน (ไม่ต้องลงนามลายเซ็น)'
                : 'ทุกฝ่ายต้องเขียนลายมือชื่อจริงบนหน้าจอเพื่อยืนยันความรับผิดชอบในแต่ละขั้นตอน'}
            </span>
          </div>

          {req.type === 'repair' ? (
            // ไทม์ไลน์ 3 ขั้นตอนสำหรับงานแจ้งซ่อม
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3.5 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-ink-mute">1. ผู้แจ้งส่งเรื่อง</span>
                <span className="text-[13.5px] font-bold text-ink">{req.requesterName}</span>
                <span className="text-[12px] text-ink-mute">{formatThaiDateTime(req.createdAt)}</span>
                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-brand mt-1">✓ ส่งเรื่องแล้ว</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-ink-mute">2. เจ้าหน้าที่รับเรื่อง & ซ่อม</span>
                <span className="text-[13.5px] font-bold text-ink">{req.staffSignerName || 'ฝ่ายช่างซ่อมบำรุง'}</span>
                <span className="text-[12px] text-ink-mute">
                  {req.finishedAt
                    ? `เสร็จ: ${formatThaiDateTime(req.finishedAt)}`
                    : req.acceptedAt
                    ? `รับเรื่อง: ${formatThaiDateTime(req.acceptedAt)}`
                    : 'รอดำเนินการ'}
                </span>
                <span className={`inline-flex items-center gap-1 text-[12px] font-medium mt-1 ${
                  req.finishedAt ? 'text-brand' : req.acceptedAt ? 'text-amber-600' : 'text-ink-mute'
                }`}>
                  {req.finishedAt ? '✓ ซ่อมเสร็จแล้ว' : req.acceptedAt ? '⟳ กำลังดำเนินการ' : '○ รอช่างรับเรื่อง'}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-canvas border border-line flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-ink-mute">3. ผู้แจ้งตรวจรับงาน</span>
                <span className="text-[13.5px] font-bold text-ink">{req.requesterName}</span>
                <span className="text-[12px] text-ink-mute">
                  {req.acceptedByRequesterAt ? formatThaiDateTime(req.acceptedByRequesterAt) : '-'}
                </span>
                <span className={`inline-flex items-center gap-1 text-[12px] font-medium mt-1 ${
                  req.status === 'repair_done' ? 'text-brand' : req.status === 'repair_awaiting_acceptance' ? 'text-amber-600' : 'text-ink-mute'
                }`}>
                  {req.status === 'repair_done' ? '✓ ตรวจรับเรียบร้อย' : req.status === 'repair_awaiting_acceptance' ? '⟳ รอคุณตรวจรับ' : '○ รอซ่อมเสร็จ'}
                </span>
              </div>
            </div>
          ) : (
            // การ์ดแสดงลายเซ็น 4 ระดับ (ผู้ขอ -> เจ้าหน้าที่ -> ปลัด อบต. -> นายก อบต.)
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              <SignaturePreviewCard
                roleLabel="1. ผู้ยื่นคำขอ"
                signerName={req.requesterName}
                signature={req.requesterSignature}
                signedAt={formatThaiDateTime(req.createdAt)}
                status="signed"
              />
              <SignaturePreviewCard
                roleLabel={`2. ${sigStaff?.title || SIGN_LEVEL_TITLE.staff}`}
                signerName={sigStaff?.signerName}
                signature={sigStaff?.signature}
                signedAt={sigStaff ? formatThaiDateTime(sigStaff.at) : undefined}
                status={sigStaff ? (sigStaff.decision === 'approve' ? 'signed' : 'rejected') : 'pending'}
              />
              <SignaturePreviewCard
                roleLabel={`3. ${sigL2?.title || SIGN_LEVEL_TITLE.l2}`}
                signerName={sigL2?.signerName}
                signature={sigL2?.signature}
                signedAt={sigL2 ? formatThaiDateTime(sigL2.at) : undefined}
                status={sigL2 ? (sigL2.decision === 'approve' ? 'signed' : 'rejected') : 'pending'}
              />
              <SignaturePreviewCard
                roleLabel={`4. ${sigL1?.title || SIGN_LEVEL_TITLE.l1}`}
                signerName={sigL1?.signerName}
                signature={sigL1?.signature}
                signedAt={sigL1 ? formatThaiDateTime(sigL1.at) : undefined}
                status={sigL1 ? (sigL1.decision === 'approve' ? 'signed' : 'rejected') : 'pending'}
              />
            </div>
          )}

          {/* ลายเซ็นเพิ่มเติมกรณีเจ้าหน้าที่กรอกแทนที่เคาน์เตอร์ */}
          {(req.createdByStaffId || req.createdByStaffSignature) && (
            <div className="pt-2 border-t border-line">
              <span className="text-[12px] font-semibold text-ink-mute block mb-1.5">
                การลงนามเพิ่มเติม (กรอกแทนที่เคาน์เตอร์)
              </span>
              <div className="max-w-[260px]">
                <SignaturePreviewCard
                  roleLabel="เจ้าหน้าที่ผู้รับเรื่องหน้าเคาน์เตอร์"
                  signerName="นางสาวสุดา รอบคอบ"
                  signature={req.createdByStaffSignature}
                  signedAt={formatThaiDateTime(req.createdAt)}
                  status={req.createdByStaffSignature ? 'signed' : 'pending'}
                />
              </div>
            </div>
          )}
        </div>

        {/* แถบแสดงประวัติไทม์ไลน์การเปลี่ยนแปลงสถานะ */}
        <div className="jw-card p-5 flex flex-col gap-3">
          <b className="text-[16px]">ความคืบหน้า</b>
          <Timeline steps={req.timeline} />
        </div>
      </div>
    </AppShell>
  );
}
