'use client'; // กำหนดให้คอมโพเนนต์นี้ทำงานในฝั่ง Client (React Client Component)

// นำเข้า React Hooks พื้นฐานสำหรับจัดการ State, Effects และ Callbacks
import React, { useCallback, useEffect, useState } from 'react';
// นำเข้า Link สำหรับการนำทางระหว่างหน้าใน Next.js
import Link from 'next/link';
// นำเข้า useParams และ useRouter hook สำหรับดึงพารามิเตอร์และเปลี่ยนหน้าใน Next.js
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, FileText } from 'lucide-react';
// นำเข้า Type และฟังก์ชันตรวจสอบสิทธิ์ระดับการลงนามจากแพ็กเกจกลาง shared
import {
  Equipment,
  RequestWithTimeline,
  SIGN_LEVEL_TITLE,
  canSignRequest,
  hasPermission,
} from '@japjong/shared';
// นำเข้า Auth Context สำหรับตรวจสอบสิทธิ์และบทบาทของผู้ใช้
import { useAuth } from '@/components/auth-context';
// นำเข้า AppShell และฟังก์ชันหาเส้นทางหน้าแรกตามบทบาท
import { AppShell, roleHomePath } from '@/components/shell';
// นำเข้า UI Components: เอกสารราชการ A4, ป้ายประเภทคำขอ, การ์ดแสดงลายเซ็น, ป้ายสถานะ
import {
  AttachmentViewer,
  OfficialGovFormDocument,
  PaymentStatusCard,
  RequestTypeChip,
  SignaturePreviewCard,
  SigningProgressSpotlight,
  SigningStepStatus,
  StatusChip,
} from '@/components/ui';
// นำเข้า API client และฟังก์ชันจัดรูปแบบวันที่เวลาภาษาไทย
import { api, formatPeriodRange, formatThaiDate, formatThaiDateTime } from '@/lib/api';
import { triggerDocumentPrint } from '@/lib/print';

function formatSignedAt(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatThaiDate(iso, true)} เวลา ${hh}:${mm} น.`;
}

/**
 * หน้ารายละเอียดคำขอ (/requests/[id])
 * แสดงความคืบหน้าการลงนาม 5 ขั้นตอน, เอกสารราชการ A4 พร้อมพิมพ์, รูปภาพ/เอกสารแนบ,
 * และสรุปคำขอพร้อมปุ่มดำเนินการ
 */
export default function RequestDetailPage() {
  // ดึงรหัส ID ของคำขอจาก URL Parameters (/requests/:id)
  const params = useParams<{ id: string }>();
  const router = useRouter();
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

  // เส้นทางย้อนกลับตามบทบาทของผู้ใช้งาน (fallback เมื่อไม่มี history)
  const backHref = roleHomePath(account?.role);
  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(backHref);
    }
  };

  // คำนวณเส้นทางหน้าลงนาม/จัดการงานทันที หากเจ้าหน้าที่หรือผู้บริหารเปิดดูคำขอที่ถึงคิวตนเอง
  const directActionHref = (() => {
    if (!req || !account) return null;
    if (req.type !== 'repair') {
      const signCheck = canSignRequest(account, req);
      if (signCheck.allowed) {
        if (signCheck.expectedLevel === 'staff') return `/staff/review?id=${req.id}`;
        if (signCheck.expectedLevel === 'l2' || signCheck.expectedLevel === 'l1') {
          return `/approver/sign/${req.id}`;
        }
      }
      return null;
    }
    if (
      account.role === 'STAFF' &&
      hasPermission(account, 'review') &&
      (req.status === 'repair_submitted' || req.status === 'repair_in_progress') &&
      req.requesterId !== account.id
    ) {
      return `/staff/repairs?id=${req.id}`;
    }
    if (req.requesterId === account.id) {
      return `/repair?mode=track&id=${req.id}`;
    }
    return null;
  })();

  // เปลี่ยนหน้าไปยังหน้าตรวจและลงนามทันทีโดยไม่ต้องกดปุ่มซ้ำ
  useEffect(() => {
    if (directActionHref) {
      router.replace(directActionHref);
    }
  }, [directActionHref, router]);

  // แสดงหน้าจอระหว่างกำลังโหลดข้อมูลคำขอ หรือกำลังเด้งไปหน้าลงนาม
  if (!req || directActionHref) {
    return (
      <AppShell title="รายละเอียดคำขอ" backHref={backHref}>
        <div className="jw-card p-8 text-center text-[14px] text-ink-mute">
          {directActionHref ? 'กำลังนำไปยังหน้าตรวจสอบและลงนามคำขอ...' : 'กำลังโหลดข้อมูลคำขอ...'}
        </div>
      </AppShell>
    );
  }

  // คำนวณเงื่อนไขสถานะการอนุมัติสมบูรณ์
  const isFullyApproved = req.status === 'approved' || req.status === 'borrowing' || req.status === 'returned';

  // ดึงข้อมูลลายมือชื่อของแต่ละระดับ (สำหรับคำขอสถานที่และอุปกรณ์)
  const sigStaff = req.type !== 'repair' ? req.signatures.find((s) => s.level === 'staff') : undefined;
  const sigL2 = req.type !== 'repair' ? req.signatures.find((s) => s.level === 'l2') : undefined;
  const sigL1 = req.type !== 'repair' ? req.signatures.find((s) => s.level === 'l1') : undefined;

  const isTerminalNegative = req.status === 'cancelled' || req.status === 'rejected';

  const resolveStepStatus = (
    sig: typeof sigStaff,
    targetPendingStatus: 'pending_staff' | 'pending_l2' | 'pending_l1',
  ): SigningStepStatus => {
    if (sig) return sig.decision === 'approve' ? 'signed' : 'rejected';
    if (req.status === 'cancelled') return 'cancelled';
    if (req.status === 'rejected') return 'upcoming';
    if (req.status === targetPendingStatus) return 'current';
    return 'upcoming';
  };

  const signedCount =
    1 +
    (sigStaff?.decision === 'approve' ? 1 : 0) +
    (sigL2?.decision === 'approve' ? 1 : 0) +
    (sigL1?.decision === 'approve' ? 1 : 0);

  const waitingStageText =
    req.status === 'pending_staff'
      ? 'ขณะนี้รอเจ้าหน้าที่'
      : req.status === 'pending_l2'
        ? `ขณะนี้รอ${SIGN_LEVEL_TITLE.l2}`
        : req.status === 'pending_l1'
          ? `ขณะนี้รอ${SIGN_LEVEL_TITLE.l1}`
          : req.status === 'cancelled'
            ? 'คำขอถูกยกเลิกแล้ว'
            : req.status === 'rejected'
              ? 'คำขอไม่ได้รับการอนุมัติ'
              : 'ลงนามครบถ้วนแล้ว';

  return (
    <AppShell maxWidth="max-w-[1280px]">
      <div className="flex flex-col gap-5 min-w-0">
        {/* ส่วนหัวหน้า: ปุ่มลูกศรกลับ + รหัสคำขอ + ชิปประเภท + ชิปสถานะ อยู่ในแถวเดียวกัน */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={handleGoBack}
              aria-label="ย้อนกลับ"
              className="min-w-[44px] min-h-[44px] rounded-control bg-surface border border-line flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition cursor-pointer shrink-0"
            >
              <ChevronLeft className="size-5" />
            </button>
            <h1 className="text-[18px] sm:text-[20px] font-bold text-ink leading-tight tracking-tight">
              คำขอ {req.code}
            </h1>
            <RequestTypeChip type={req.type} />
            <StatusChip status={req.status} />
          </div>
        </div>

        {/* 1) การ์ด "ความคืบหน้าการลงนาม" ไว้บนสุด */}
        <section className="jw-card p-4 sm:p-5 flex flex-col gap-4 print:hidden">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-[16px] font-bold text-ink">
                {req.type === 'repair' ? 'ความคืบหน้าการดำเนินงาน (3 ขั้นตอน)' : 'ความคืบหน้าการลงนาม'}
              </h2>
              <p className="text-[12.5px] text-ink-soft mt-0.5">
                {req.type === 'repair'
                  ? 'งานแจ้งซ่อมบำรุงดำเนินการตามลำดับขั้นตอน (ไม่ต้องลงนามลายเซ็น)'
                  : 'คลิกแต่ละลำดับด้านขวาเพื่อดูหลักฐานลายมือชื่อ หรือดูขั้นตอนที่กำลังรอดำเนินการ'}
              </p>
            </div>
            {req.type !== 'repair' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12.5px] font-medium bg-surface-muted text-ink-soft border border-line">
                <b className="font-bold text-brand">ลงนามแล้ว {signedCount} จาก 4 ฝ่าย</b>
                <span className="text-ink-mute">·</span>
                <span>{waitingStageText}</span>
              </span>
            )}
          </div>

          {req.type === 'repair' ? (
            // ไทม์ไลน์ 3 ขั้นตอนสำหรับงานแจ้งซ่อม
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-card bg-surface-muted border border-line flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-ink-soft">1. ผู้แจ้งส่งเรื่อง</span>
                <span className="text-[13.5px] font-bold text-ink">{req.requesterName}</span>
                <span className="text-[12px] text-ink-mute">{formatThaiDateTime(req.createdAt)}</span>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ok-fg mt-1">
                  ✓ ส่งเรื่องแล้ว
                </span>
              </div>
              <div className="p-3.5 rounded-card bg-surface-muted border border-line flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-ink-soft">2. เจ้าหน้าที่รับเรื่อง & ซ่อม</span>
                <span className="text-[13.5px] font-bold text-ink">{req.staffSignerName || 'ฝ่ายช่างซ่อมบำรุง'}</span>
                <span className="text-[12px] text-ink-mute">
                  {req.finishedAt
                    ? `เสร็จ: ${formatThaiDateTime(req.finishedAt)}`
                    : req.acceptedAt
                      ? `รับเรื่อง: ${formatThaiDateTime(req.acceptedAt)}`
                      : 'รอดำเนินการ'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[12px] font-semibold mt-1 ${
                    req.finishedAt ? 'text-ok-fg' : req.acceptedAt ? 'text-warn-fg' : 'text-ink-soft'
                  }`}
                >
                  {req.finishedAt ? '✓ ซ่อมเสร็จแล้ว' : req.acceptedAt ? '● กำลังดำเนินการ' : 'รอดำเนินการ'}
                </span>
              </div>
              <div className="p-3.5 rounded-card bg-surface-muted border border-line flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-ink-soft">3. ผู้แจ้งตรวจรับงาน</span>
                <span className="text-[13.5px] font-bold text-ink">{req.requesterName}</span>
                <span className="text-[12px] text-ink-mute">
                  {req.acceptedByRequesterAt ? formatThaiDateTime(req.acceptedByRequesterAt) : '-'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[12px] font-semibold mt-1 ${
                    req.status === 'repair_done'
                      ? 'text-ok-fg'
                      : req.status === 'repair_awaiting_acceptance'
                        ? 'text-warn-fg'
                        : 'text-ink-soft'
                  }`}
                >
                  {req.status === 'repair_done'
                    ? '✓ ตรวจรับเรียบร้อย'
                    : req.status === 'repair_awaiting_acceptance'
                      ? '● รอคุณตรวจรับ'
                      : 'รอดำเนินการ'}
                </span>
              </div>
            </div>
          ) : (
            // ดีไซน์แบบที่ 3: Active Spotlight + Interactive Queue (5 ลำดับ)
            <SigningProgressSpotlight
              requestKey={req.id}
              steps={[
                {
                  stepNumber: 1,
                  roleTitle: 'ผู้ยื่นคำขอ',
                  shortRoleTitle: 'ผู้ยื่นคำขอ',
                  status: 'signed',
                  signerName: req.requesterName,
                  signature: req.requesterSignature,
                  signedAtText: formatSignedAt(req.createdAt),
                },
                {
                  stepNumber: 2,
                  roleTitle: sigStaff?.title || SIGN_LEVEL_TITLE.staff,
                  shortRoleTitle: 'เจ้าหน้าที่',
                  status: resolveStepStatus(sigStaff, 'pending_staff'),
                  signerName: sigStaff?.signerName,
                  signature: sigStaff?.signature,
                  signedAtText: formatSignedAt(sigStaff?.at),
                  hint: 'ตรวจสอบความถูกต้องของข้อมูลคำขอและคิวว่าง',
                  note: sigStaff?.note,
                },
                {
                  stepNumber: 3,
                  roleTitle: sigL2?.title || SIGN_LEVEL_TITLE.l2,
                  shortRoleTitle: 'ปลัด อบต.',
                  status: resolveStepStatus(sigL2, 'pending_l2'),
                  signerName: sigL2?.signerName,
                  signature: sigL2?.signature,
                  signedAtText: formatSignedAt(sigL2?.at),
                  hint: 'กลั่นกรองและเสนอความเห็นชอบตามระเบียบราชการ',
                  note: sigL2?.note,
                },
                {
                  stepNumber: 4,
                  roleTitle: sigL1?.title || SIGN_LEVEL_TITLE.l1,
                  shortRoleTitle: 'นายก อบต.',
                  status: resolveStepStatus(sigL1, 'pending_l1'),
                  signerName: sigL1?.signerName,
                  signature: sigL1?.signature,
                  signedAtText: formatSignedAt(sigL1?.at),
                  hint: 'พิจารณาอนุมัติคำขอขั้นสุดท้าย',
                  note: sigL1?.note,
                },
                {
                  stepNumber: 5,
                  roleTitle: 'ออกเอกสาร PDF และแจ้งผล',
                  shortRoleTitle: 'ออกใบอนุญาต PDF',
                  status: isFullyApproved ? 'system_ready' : 'system_pending',
                  systemNote: 'ออกโดยระบบเมื่อลงนามครบทั้ง 4 ฝ่าย',
                  actionHref: isFullyApproved ? `/approver/permit/${req.id}` : undefined,
                  actionLabel: isFullyApproved ? 'เปิดดูใบอนุญาต (PDF)' : undefined,
                },
              ]}
            />
          )}

          {/* ลายเซ็นเพิ่มเติมกรณีเจ้าหน้าที่กรอกแทนที่เคาน์เตอร์ */}
          {(req.createdByStaffId || req.createdByStaffSignature) && (
            <div className="pt-3 border-t border-line">
              <span className="text-[12px] font-semibold text-ink-soft block mb-1.5">
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
        </section>

        {/* 2) เนื้อหาหลัก 2 คอลัมน์ (มือถือ: ขวาขึ้นก่อนซ้าย) */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start min-w-0">
          {/* คอลัมน์ซ้าย: เอกสารราชการ + รูปภาพ/เอกสารแนบ */}
          <div className="order-2 lg:order-1 min-w-0 flex flex-col gap-5">
            {req.type !== 'repair' && (
              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 print:hidden">
                  <h2 className="text-[16px] font-bold text-ink">
                    {req.type === 'booking'
                      ? 'เอกสารราชการ: แบบขอใช้สถานที่ราชการ'
                      : 'เอกสารราชการ: แบบคำขอใช้อุปกรณ์ราชการ'}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {showOfficialForm && (
                      <button
                        type="button"
                        onClick={() => triggerDocumentPrint()}
                        className="jw-btn-sec min-h-[44px] px-3.5 text-[13px]"
                      >
                        พิมพ์แบบฟอร์ม / PDF
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowOfficialForm((v) => !v)}
                      className="jw-btn-ter min-h-[44px] px-3 text-[13px] text-brand"
                    >
                      {showOfficialForm ? 'ซ่อนแบบฟอร์มราชการ' : 'แสดงแบบฟอร์มราชการเต็มใบ'}
                    </button>
                  </div>
                </div>

                {showOfficialForm && (
                  <div className="w-full text-[17px] leading-[1.7]">
                    <OfficialGovFormDocument req={req} />
                  </div>
                )}
              </section>
            )}

            {/* รูปภาพและเอกสารแนบประกอบคำขอ */}
            {'attachments' in req && Array.isArray(req.attachments) && req.attachments.length > 0 && (
              <section className="jw-card p-4 sm:p-5 flex flex-col gap-2.5 print:hidden">
                <AttachmentViewer
                  attachments={req.attachments}
                  emptyText=""
                  title="รูปภาพ / เอกสารแนบประกอบคำขอ"
                />
              </section>
            )}
          </div>

          {/* คอลัมน์ขวา (กว้างสุด 400px): สรุปคำขอ + ชำระเงิน + ปุ่มดำเนินการ */}
          <div className="order-1 lg:order-2 min-w-0 flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto print:hidden">
            <PaymentStatusCard req={req} account={account} onUpdated={load} summaryOnly />

            {/* การ์ดสรุปคำขอ */}
            <section className="jw-card p-3.5 sm:p-4 flex flex-col gap-2.5">
              <h2 className="text-[15px] font-bold text-ink">สรุปคำขอ</h2>

              <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-y-1.5 gap-x-2.5 text-[13px] items-baseline">
                <dt className="font-semibold text-ink-soft">เลขคำขอ</dt>
                <dd className="font-semibold text-ink break-words">{req.code}</dd>

                <dt className="font-semibold text-ink-soft">ประเภท</dt>
                <dd>
                  <RequestTypeChip type={req.type} />
                </dd>

                <dt className="font-semibold text-ink-soft">รายการ</dt>
                <dd className="font-semibold text-ink break-words">{req.title}</dd>

                {req.type === 'booking' && (
                  <>
                    <dt className="font-semibold text-ink-soft">วันเวลา</dt>
                    <dd className="flex flex-col gap-0.5 text-ink">
                      {req.periods.map((p, i) => (
                        <span key={i}>{formatPeriodRange(p)}</span>
                      ))}
                    </dd>
                  </>
                )}

                {req.type === 'booking' && req.extraItems && req.extraItems.length > 0 && (
                  <>
                    <dt className="font-semibold text-ink-soft">อุปกรณ์เสริม</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {req.extraItems.map((it, i) => {
                        const eq = equipmentList.find((e) => e.id === it.equipmentId);
                        return (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 bg-surface-muted px-2.5 py-0.5 rounded-full text-[13px] font-medium text-ink"
                          >
                            {eq?.name || it.equipmentId} <b className="text-brand font-bold">x{it.qty}</b>
                          </span>
                        );
                      })}
                    </dd>
                  </>
                )}

                {req.type === 'borrow' && (
                  <>
                    <dt className="font-semibold text-ink-soft">ช่วงขอใช้</dt>
                    <dd className="text-ink">
                      {formatThaiDate(req.pickupDate, false)}–{formatThaiDate(req.returnDate, true)}
                    </dd>
                    {req.receivedAt && (
                      <>
                        <dt className="font-semibold text-ink-soft">วันที่รับมอบ</dt>
                        <dd className="font-semibold text-brand">
                          {formatThaiDate(req.receivedAt, true)} ({formatThaiDateTime(req.receivedAt)})
                        </dd>
                      </>
                    )}
                  </>
                )}

                <dt className="font-semibold text-ink-soft">ผู้ขอ</dt>
                <dd className="text-ink break-words">{req.requesterName}</dd>

                <dt className="font-semibold text-ink-soft">หน่วยงาน</dt>
                <dd className="text-ink break-words">{req.organization || '-'}</dd>

                {req.requesterPhone && (
                  <>
                    <dt className="font-semibold text-ink-soft">โทรศัพท์</dt>
                    <dd>
                      <a
                        href={`tel:${req.requesterPhone}`}
                        className="inline-flex items-center text-brand font-semibold hover:underline"
                      >
                        {req.requesterPhone}
                      </a>
                    </dd>
                  </>
                )}
              </dl>

              {/* กล่องเน้นข้อความถึงเจ้าหน้าที่ */}
              {req.type !== 'repair' && req.purpose ? (
                <div className="flex flex-col gap-0.5 bg-warn-bg/60 border border-warn-border rounded-control p-2.5 text-[12.5px] text-warn-fg">
                  <b className="font-semibold">ข้อความถึง จนท.</b>
                  <span className="whitespace-pre-wrap leading-snug">{req.purpose}</span>
                </div>
              ) : null}

              {/* แถวไฟล์ PDF */}
              <div className="flex items-start gap-2 pt-2 border-t border-line text-[12.5px]">
                <FileText className="size-4 text-ink-soft shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-semibold text-ink break-all">คำขอ_{req.code}.pdf</span>
                  {isFullyApproved ? (
                    <Link
                      href={`/approver/permit/${req.id}`}
                      className="inline-flex items-center underline text-brand font-semibold"
                    >
                      เปิดดูใบอนุญาต (PDF)
                    </Link>
                  ) : (
                    <span className="text-ink-soft text-[12px]">(ออกใบอนุญาตเมื่อลงนามครบทั้ง 4 ฝ่าย)</span>
                  )}
                </div>
              </div>

              {/* กรณีคำขอถูกปฏิเสธ แสดงเหตุผลการปฏิเสธ */}
              {req.rejectReason && (
                <div className="rounded-control bg-danger-bg border border-danger-border px-3 py-2 text-[12.5px] text-danger-fg">
                  <b>หมายเหตุ:</b> {req.rejectReason}
                </div>
              )}
            </section>

            {/* การ์ดปุ่มดำเนินการ เรียงตามความสำคัญ */}
            <section className="jw-card p-3.5 flex flex-col gap-2">
              {/* 1. ปุ่มหลัก: กลับ */}
              <button
                type="button"
                onClick={handleGoBack}
                className="jw-btn w-full min-h-[38px] py-2 text-[13px]"
              >
                กลับ
              </button>

              {!isTerminalNegative && (
                <>
                  {/* ทางลัดไปหน้ารับมอบ/ส่งคืนอุปกรณ์สำหรับงานขอยืม */}
                  {req.type === 'borrow' &&
                    (req.status === 'approved' || req.status === 'borrowing' || req.status === 'return_inspect') && (
                      <Link href="/borrow/my" className="jw-btn-sec w-full min-h-[38px] py-2 text-[13px]">
                        {req.status === 'approved'
                          ? 'ไปหน้ายืนยันรับมอบอุปกรณ์'
                          : req.status === 'borrowing'
                            ? 'ไปหน้าแจ้งคืนอุปกรณ์'
                            : 'ไปหน้าตรวจสอบการคืน'}
                      </Link>
                    )}

                  {/* ปุ่มเปิดดูใบอนุญาตราชการ PDF เมื่อลงนามอนุมัติครบสมบูรณ์ */}
                  {isFullyApproved && (
                    <Link href={`/approver/permit/${req.id}`} className="jw-btn-sec w-full min-h-[38px] py-2 text-[13px]">
                      ดูใบอนุญาต (PDF)
                    </Link>
                  )}

                  {/* 2. ปุ่มรอง: ขอเลื่อนวัน / แก้ไข */}
                  {(req.type === 'booking' || req.type === 'borrow') &&
                    ['pending_staff', 'pending_l2'].includes(req.status) && (
                      <Link
                        href={`/requests/${req.id}/reschedule?mode=reschedule`}
                        className="jw-btn-sec w-full min-h-[38px] py-2 text-[13px]"
                      >
                        ขอเลื่อนวัน / แก้ไข
                      </Link>
                    )}

                  {/* 3. สำคัญน้อยสุด: ยกเลิกคำขอ (ข้อความสีแดง ไม่มีกรอบ ไม่เด่น) */}
                  {(req.type === 'booking' || req.type === 'borrow') &&
                    ['pending_staff', 'pending_l2', 'pending_l1', 'approved'].includes(req.status) && (
                      <Link
                        href={`/requests/${req.id}/reschedule?mode=cancel`}
                        className="jw-btn-ter w-full min-h-[34px] py-1.5 text-[13px] text-danger-fg hover:bg-danger-bg/60"
                      >
                        ยกเลิกคำขอ
                      </Link>
                    )}
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
