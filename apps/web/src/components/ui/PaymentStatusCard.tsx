'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Banknote,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Pencil,
  QrCode,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Upload,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PaymentSettings,
  PublicAccount,
  RequestWithTimeline,
  formatBaht,
  hasPermission,
} from '@japjong/shared';
import { api, formatThaiDateTime, readAndCompressImages } from '@/lib/api';
import { SearchableCombobox } from './SearchableCombobox';

const REFUND_BANK_OPTIONS = [
  { value: 'พร้อมเพย์ (PromptPay)', label: 'พร้อมเพย์ (PromptPay)' },
  { value: 'ธนาคารกรุงไทย', label: 'ธนาคารกรุงไทย (KTB)' },
  { value: 'ธนาคารกสิกรไทย', label: 'ธนาคารกสิกรไทย (KBANK)' },
  { value: 'ธนาคารไทยพาณิชย์', label: 'ธนาคารไทยพาณิชย์ (SCB)' },
  { value: 'ธนาคารกรุงเทพ', label: 'ธนาคารกรุงเทพ (BBL)' },
  { value: 'ธนาคารกรุงศรีอยุธยา', label: 'ธนาคารกรุงศรีอยุธยา (BAY)' },
  { value: 'ธนาคารออมสิน', label: 'ธนาคารออมสิน (GSB)' },
  { value: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)', label: 'ธ.ก.ส. (BAAC)' },
  { value: 'ธนาคารทหารไทยธนชาต (ttb)', label: 'ธนาคารทหารไทยธนชาต (ttb)' },
  { value: 'ธนาคารอื่นๆ', label: 'ธนาคารอื่นๆ' },
];

export interface PaymentStatusCardProps {
  req: RequestWithTimeline;
  account: PublicAccount | null | undefined;
  onUpdated: () => void;
  paymentSettings?: PaymentSettings | null;
  summaryOnly?: boolean;
}

export function PaymentStatusCard({
  req,
  account,
  onUpdated,
  paymentSettings: propSettings,
  summaryOnly = false,
}: PaymentStatusCardProps) {
  const totalAmount = Number(req.totalAmount || 0);
  const feeAmount = Number(req.feeAmount || 0);
  const depositAmount = Number(req.depositAmount || 0);
  const feeWaived = Boolean(req.feeWaived);

  const [fetchedSettings, setFetchedSettings] = useState<PaymentSettings | null>(null);
  const settings = propSettings ?? fetchedSettings;

  useEffect(() => {
    if (summaryOnly || propSettings !== undefined || (totalAmount <= 0 && !feeWaived)) return;
    api
      .getPaymentSettings()
      .then(setFetchedSettings)
      .catch(() => {});
  }, [summaryOnly, propSettings, totalAmount, feeWaived]);

  const receiptPrefix = settings?.receiptPrefix || 'RC';
  const [slipDataUrl, setSlipDataUrl] = useState('');
  const [note, setNote] = useState('');
  const [receiptNo, setReceiptNo] = useState(req.receiptNo || `${receiptPrefix}-${req.code}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [previewSlip, setPreviewSlip] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refundSlipRef = useRef<HTMLInputElement>(null);

  // ช่องทางรับคืนเงินมัดจำของประชาชน
  const [refundMethod, setRefundMethod] = useState<'transfer' | 'cash'>(req.refundMethod || 'transfer');
  const [refundBankName, setRefundBankName] = useState(req.refundBankName || 'พร้อมเพย์ (PromptPay)');
  const [refundAccountNumber, setRefundAccountNumber] = useState(req.refundAccountNumber || '');
  const [refundAccountName, setRefundAccountName] = useState(req.refundAccountName || req.requesterName || '');
  const [editingRefundAccount, setEditingRefundAccount] = useState(false);

  // ฟอร์มคืนเงินมัดจำฝั่งเจ้าหน้าที่
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [staffRefundMethod, setStaffRefundMethod] = useState<'transfer' | 'cash'>(req.refundMethod || 'transfer');
  const [staffRefundAmount, setStaffRefundAmount] = useState<string>(String(depositAmount));
  const [staffRefundReceiptNo, setStaffRefundReceiptNo] = useState(req.refundReceiptNo || `RF-${req.code}`);
  const [staffRefundNote, setStaffRefundNote] = useState('');
  const [staffRefundSlip, setStaffRefundSlip] = useState('');
  const [copiedAcc, setCopiedAcc] = useState(false);

  useEffect(() => {
    setRefundMethod(req.refundMethod || 'transfer');
    setRefundBankName(req.refundBankName || 'พร้อมเพย์ (PromptPay)');
    setRefundAccountNumber(req.refundAccountNumber || '');
    setRefundAccountName(req.refundAccountName || req.requesterName || '');
    setStaffRefundMethod(req.refundMethod || 'transfer');
    setStaffRefundAmount(String(depositAmount));
    setStaffRefundReceiptNo(req.refundReceiptNo || `RF-${req.code}`);
    setEditingRefundAccount(false);
    setShowRefundForm(false);
    setStaffRefundSlip('');
    setStaffRefundNote('');
  }, [req.id, req.code, req.refundMethod, req.refundBankName, req.refundAccountNumber, req.refundAccountName, req.requesterName, req.refundReceiptNo, depositAmount]);

  useEffect(() => {
    if (!req.receiptNo) {
      setReceiptNo(`${receiptPrefix}-${req.code}`);
    }
  }, [receiptPrefix, req.code, req.receiptNo]);

  const enabledAccounts = (settings?.accounts || []).filter((a) => a.enabled);
  const defaultAccount = enabledAccounts.find((a) => a.isDefault) || enabledAccounts[0] || null;

  if (totalAmount <= 0 && !feeWaived) return null;

  const isStaff =
    account?.role === 'STAFF' ||
    account?.role === 'ADMIN' ||
    hasPermission(account, 'review') ||
    hasPermission(account, 'handover');
  const isOwner = Boolean(account && account.id === req.requesterId);
  const paymentStatus = req.paymentStatus || 'not_required';
  const isPendingApproval = ['pending_staff', 'pending_l2', 'pending_l1'].includes(req.status);

  const handleSelectSlip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setErr('');
    try {
      const imgs = await readAndCompressImages(e.target.files, 1);
      if (imgs[0]) setSlipDataUrl(imgs[0]);
    } catch (error) {
      setErr((error as Error).message || 'ไม่สามารถอ่านไฟล์สลิปได้');
    } finally {
      e.target.value = '';
    }
  };

  const handleSelectRefundSlip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setErr('');
    try {
      const imgs = await readAndCompressImages(e.target.files, 1);
      if (imgs[0]) setStaffRefundSlip(imgs[0]);
    } catch (error) {
      setErr((error as Error).message || 'ไม่สามารถอ่านไฟล์สลิปโอนคืนได้');
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmitSlip = async () => {
    if (!slipDataUrl) {
      setErr('กรุณาเลือกรูปภาพสลิปการโอนเงิน');
      return;
    }
    if (depositAmount > 0 && refundMethod === 'transfer') {
      if (!refundBankName.trim() || !refundAccountNumber.trim() || !refundAccountName.trim()) {
        setErr('กรุณากรอกข้อมูลบัญชี/พร้อมเพย์สำหรับรับคืนเงินมัดจำให้ครบ หรือเลือก "รับเงินสด ณ สำนักงาน"');
        return;
      }
    }
    setBusy(true);
    setErr('');
    try {
      await api.submitPaymentSlip(req.id, {
        slipUrl: slipDataUrl,
        note: note.trim() || undefined,
        ...(depositAmount > 0
          ? {
              refundMethod,
              refundBankName: refundMethod === 'transfer' ? refundBankName.trim() : undefined,
              refundAccountNumber: refundMethod === 'transfer' ? refundAccountNumber.trim() : undefined,
              refundAccountName: refundMethod === 'transfer' ? refundAccountName.trim() : undefined,
            }
          : {}),
      });
      setSlipDataUrl('');
      setNote('');
      onUpdated();
    } catch (error) {
      setErr((error as Error).message || 'ส่งสลิปไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRefundAccount = async () => {
    if (refundMethod === 'transfer') {
      if (!refundBankName.trim() || !refundAccountNumber.trim() || !refundAccountName.trim()) {
        setErr('กรุณากรอกธนาคาร เลขบัญชี/พร้อมเพย์ และชื่อบัญชีให้ครบถ้วน');
        return;
      }
    }
    setBusy(true);
    setErr('');
    try {
      await api.updateRefundAccount(req.id, {
        refundMethod,
        refundBankName: refundMethod === 'transfer' ? refundBankName.trim() : undefined,
        refundAccountNumber: refundMethod === 'transfer' ? refundAccountNumber.trim() : undefined,
        refundAccountName: refundMethod === 'transfer' ? refundAccountName.trim() : undefined,
      });
      setEditingRefundAccount(false);
      onUpdated();
    } catch (error) {
      setErr((error as Error).message || 'บันทึกช่องทางรับเงินคืนไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRefund = async () => {
    const parsedAmt = Number(staffRefundAmount);
    if (!Number.isFinite(parsedAmt) || parsedAmt < 0 || parsedAmt > depositAmount) {
      setErr(`จำนวนเงินที่คืนต้องอยู่ระหว่าง 0 ถึง ${formatBaht(depositAmount)}`);
      return;
    }
    if (staffRefundMethod === 'transfer' && parsedAmt > 0 && !staffRefundSlip) {
      setErr('กรุณาอัปโหลดรูปสลิปการโอนเงินคืนให้ประชาชนเป็นหลักฐาน');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await api.verifyPayment(req.id, {
        action: 'refund',
        method: staffRefundMethod,
        refundAmount: parsedAmt,
        refundSlipUrl: staffRefundMethod === 'transfer' ? staffRefundSlip || undefined : undefined,
        receiptNo: staffRefundReceiptNo.trim() || `RF-${req.code}`,
        note: staffRefundNote.trim() || undefined,
      });
      setShowRefundForm(false);
      setStaffRefundSlip('');
      setStaffRefundNote('');
      onUpdated();
    } catch (error) {
      setErr((error as Error).message || 'บันทึกคืนเงินมัดจำไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyAccount = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
      setCopiedAcc(true);
      setTimeout(() => setCopiedAcc(false), 1800);
    }
  };

  const handleVerify = async (action: 'approve' | 'reject' | 'waive' | 'refund', method?: 'transfer' | 'cash') => {
    setBusy(true);
    setErr('');
    try {
      await api.verifyPayment(req.id, {
        action,
        method,
        receiptNo: action === 'approve' ? receiptNo.trim() || `RC-${req.code}` : undefined,
        note: note.trim() || undefined,
      });
      setNote('');
      onUpdated();
    } catch (error) {
      setErr((error as Error).message || 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const statusTone =
    feeWaived || paymentStatus === 'paid' || paymentStatus === 'refunded'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
      : paymentStatus === 'verifying'
        ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
        : paymentStatus === 'awaiting_payment'
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
          : 'bg-surface-muted text-ink-soft border-line';

  return (
    <section
      className={`jw-card flex flex-col ${
        summaryOnly ? 'p-3.5 gap-2.5' : 'p-4 sm:p-5 gap-3.5'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Banknote className={`${summaryOnly ? 'size-4' : 'size-5'} text-brand shrink-0`} />
          <h2 className={`${summaryOnly ? 'text-[14.5px]' : 'text-[16px]'} font-bold text-ink m-0`}>
            ค่าธรรมเนียมและการชำระเงิน
          </h2>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusTone}`}>
          {feeWaived
            ? 'ยกเว้นค่าธรรมเนียม'
            : isPendingApproval
              ? 'ชำระหลังอนุมัติ'
              : PAYMENT_STATUS_LABEL[paymentStatus]}
        </span>
      </div>

      {/* Cost Breakdown */}
      <div
        className={`rounded-xl bg-surface-muted/50 border border-line ${
          summaryOnly ? 'p-2.5 space-y-1.5 text-[12.5px]' : 'p-3.5 space-y-2 text-[13.5px]'
        }`}
      >
        {feeAmount > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-soft">ค่าบริการ / ค่าบำรุง</span>
            <span className="font-semibold text-ink">{formatBaht(feeAmount)}</span>
          </div>
        )}
        {depositAmount > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-soft">ค่ามัดจำความเสียหาย (คืนเมื่อส่งคืนครบ)</span>
            <span className="font-semibold text-ink">{formatBaht(depositAmount)}</span>
          </div>
        )}
        <div className={`${summaryOnly ? 'pt-1.5' : 'pt-2'} border-t border-line flex items-center justify-between gap-2`}>
          <span className="font-bold text-ink">ยอดรวมสุทธิ</span>
          <span
            className={`${summaryOnly ? 'text-[15px]' : 'text-[16px]'} font-extrabold ${
              feeWaived ? 'line-through text-ink-mute' : 'text-brand'
            }`}
          >
            {formatBaht(totalAmount)}
          </span>
        </div>
        {feeWaived && (
          <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            ได้รับการยกเว้นค่าธรรมเนียม{req.feeWaiverReason ? `: ${req.feeWaiverReason}` : ''}
          </div>
        )}
      </div>

      {!summaryOnly && (
        <>
          {err && (
        <div className="rounded-xl bg-danger-bg border border-danger-border px-3 py-2 text-xs text-danger-fg font-medium">
          {err}
        </div>
      )}

      {/* Pending approval notice */}
      {isPendingApproval && !feeWaived && (
        <div className="flex items-start gap-2.5 text-xs text-ink-soft bg-surface-muted/40 border border-line rounded-xl p-3">
          <Clock className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <span>ระบบเป็นแบบ <b>อนุมัติก่อนค่อยชำระเงิน</b> เมื่อคำขอได้รับการอนุมัติแล้ว จึงจะเปิดให้แนบสลิปชำระเงินครับ</span>
        </div>
      )}

      {/* Uploaded Slip Preview (if any) */}
      {req.paymentSlipUrl && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-ink-soft">หลักฐานสลิปที่แนบไว้</div>
          <button
            type="button"
            onClick={() => setPreviewSlip(req.paymentSlipUrl || null)}
            className="block rounded-xl overflow-hidden border border-line hover:border-brand transition cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={req.paymentSlipUrl}
              alt="สลิปการชำระเงิน"
              className="w-full max-h-48 object-cover bg-surface-muted"
            />
          </button>
          {req.paymentSubmittedAt && (
            <div className="text-[11px] text-ink-mute">
              ส่งสลิปเมื่อ {formatThaiDateTime(req.paymentSubmittedAt)}
            </div>
          )}
        </div>
      )}

      {/* Paid / Refunded details */}
      {(paymentStatus === 'paid' || paymentStatus === 'refunded') && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-3 space-y-1 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{paymentStatus === 'refunded' ? 'ชำระเงินและคืนเงินมัดจำเรียบร้อยแล้ว' : 'ยืนยันการรับชำระเงินเรียบร้อยแล้ว'}</span>
          </div>
          {req.receiptNo && (
            <div className="text-ink-soft flex items-center gap-1.5">
              <Receipt className="size-3.5 shrink-0" />
              <span>เลขที่ใบเสร็จ: <b className="text-ink font-mono">{req.receiptNo}</b></span>
            </div>
          )}
          {req.paymentMethod && (
            <div className="text-ink-soft">ช่องทางชำระ: {PAYMENT_METHOD_LABEL[req.paymentMethod]}</div>
          )}
          {req.paidAt && <div className="text-ink-mute">วันที่ยืนยัน: {formatThaiDateTime(req.paidAt)}</div>}
          {req.paymentVerifiedByName && <div className="text-ink-mute">ผู้ตรวจสอบ: {req.paymentVerifiedByName}</div>}
          {req.paymentNote && <div className="text-ink-soft">หมายเหตุ: {req.paymentNote}</div>}
        </div>
      )}

      {/* Refund completed evidence card (citizen + staff) */}
      {paymentStatus === 'refunded' && depositAmount > 0 && (
        <div className="rounded-xl bg-teal-500/10 border border-teal-500/30 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 font-bold text-teal-800 dark:text-teal-300">
              <RotateCcw className="size-4 shrink-0" />
              <span>หลักฐานการคืนเงินมัดจำ</span>
            </div>
            <span className="font-extrabold text-teal-700 dark:text-teal-300 text-sm">
              คืนแล้ว {formatBaht(req.refundAmount ?? depositAmount)}
            </span>
          </div>
          <div className="space-y-1 text-ink-soft">
            <div>
              วิธีคืนเงิน:{' '}
              <b className="text-ink">
                {req.refundMethod === 'cash' ? 'คืนเป็นเงินสด ณ สำนักงาน' : 'โอนเงินคืนเข้าบัญชี / พร้อมเพย์'}
              </b>
            </div>
            {req.refundMethod !== 'cash' && req.refundAccountNumber && (
              <div>
                โอนเข้า: <b className="text-ink">{req.refundBankName}</b> ·{' '}
                <span className="font-mono text-ink">{req.refundAccountNumber}</span>
                {req.refundAccountName ? ` (${req.refundAccountName})` : ''}
              </div>
            )}
            {req.refundReceiptNo && (
              <div>
                เลขที่อ้างอิง/ใบสำคัญจ่าย: <b className="font-mono text-ink">{req.refundReceiptNo}</b>
              </div>
            )}
            {req.refundedAt && (
              <div className="text-ink-mute">วันที่คืนเงิน: {formatThaiDateTime(req.refundedAt)}</div>
            )}
            {req.refundedByName && (
              <div className="text-ink-mute">ผู้ดำเนินการ: {req.refundedByName}</div>
            )}
            {req.refundNote && <div className="text-ink-soft">หมายเหตุ: {req.refundNote}</div>}
          </div>
          {req.refundSlipUrl && (
            <div className="pt-1.5 space-y-1">
              <div className="text-[11px] font-semibold text-teal-800 dark:text-teal-300">สลิปโอนคืนเงินมัดจำ</div>
              <button
                type="button"
                onClick={() => setPreviewSlip(req.refundSlipUrl || null)}
                className="block rounded-xl overflow-hidden border border-teal-500/30 hover:border-teal-600 transition cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={req.refundSlipUrl}
                  alt="สลิปโอนคืนเงินมัดจำ"
                  className="w-full max-h-44 object-cover bg-white"
                />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Citizen/Staff view of saved refund receiving channel (while verifying or paid, before refund) */}
      {depositAmount > 0 && !feeWaived && (paymentStatus === 'verifying' || paymentStatus === 'paid') && (isOwner || isStaff) && (
        <div className="rounded-xl border border-line bg-surface-muted/40 p-3.5 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-bold text-ink">
              <Wallet className="size-4 text-brand shrink-0" />
              <span>ช่องทางรับคืนเงินมัดจำ ({formatBaht(depositAmount)})</span>
            </div>
            {!editingRefundAccount && (
              <button
                type="button"
                onClick={() => setEditingRefundAccount(true)}
                className="text-[11.5px] font-semibold text-brand hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Pencil className="size-3" />
                <span>{req.refundMethod ? 'แก้ไข' : 'ระบุช่องทางรับคืน'}</span>
              </button>
            )}
          </div>

          {!editingRefundAccount ? (
            req.refundMethod === 'cash' ? (
              <div className="text-ink-soft">
                ผู้ขอเลือกรับคืนเป็น <b className="text-ink">เงินสด ณ สำนักงาน</b> (เมื่อส่งคืนอุปกรณ์/ใช้งานเสร็จ)
              </div>
            ) : req.refundAccountNumber ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-surface rounded-lg border border-line p-2.5">
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-ink">{req.refundBankName}</div>
                  <div className="font-mono text-[13px] font-bold text-brand select-all">
                    {req.refundAccountNumber}
                  </div>
                  {req.refundAccountName && (
                    <div className="text-ink-soft">ชื่อบัญชี: {req.refundAccountName}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyAccount(req.refundAccountNumber || '')}
                  className="self-start sm:self-center px-2.5 py-1.5 rounded-lg border border-line hover:bg-hover text-ink text-[11.5px] font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copiedAcc ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                  <span>{copiedAcc ? 'คัดลอกแล้ว' : 'คัดลอกเลขบัญชี'}</span>
                </button>
              </div>
            ) : (
              <div className="text-amber-700 dark:text-amber-300">
                ยังไม่ได้ระบุบัญชีรับเงินคืน — กรุณากด “ระบุช่องทางรับคืน” เพื่อให้เจ้าหน้าที่โอนคืนมัดจำได้สะดวก
              </div>
            )
          ) : (
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRefundMethod('transfer')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    refundMethod === 'transfer'
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-line bg-surface text-ink-soft hover:bg-hover'
                  }`}
                >
                  โอนเข้าบัญชี / พร้อมเพย์
                </button>
                <button
                  type="button"
                  onClick={() => setRefundMethod('cash')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    refundMethod === 'cash'
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-line bg-surface text-ink-soft hover:bg-hover'
                  }`}
                >
                  รับเงินสด ณ สำนักงาน
                </button>
              </div>
              {refundMethod === 'transfer' && (
                <div className="space-y-2">
                  <SearchableCombobox
                    size="compact"
                    value={refundBankName}
                    onChange={setRefundBankName}
                    options={REFUND_BANK_OPTIONS}
                    placeholder="เลือกธนาคาร หรือ พร้อมเพย์"
                  />
                  <input
                    type="text"
                    value={refundAccountNumber}
                    onChange={(e) => setRefundAccountNumber(e.target.value)}
                    placeholder="เลขที่บัญชี หรือ เบอร์พร้อมเพย์ (เช่น 081-234-5678)"
                    className="jw-in text-xs"
                  />
                  <input
                    type="text"
                    value={refundAccountName}
                    onChange={(e) => setRefundAccountName(e.target.value)}
                    placeholder="ชื่อบัญชีผู้รับคืน"
                    className="jw-in text-xs"
                  />
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingRefundAccount(false)}
                  className="jw-btn-sec h-8 px-3 text-xs"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSaveRefundAccount}
                  className="jw-btn h-8 px-3.5 text-xs"
                >
                  {busy ? 'กำลังบันทึก...' : 'บันทึกช่องทางรับคืน'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Citizen upload slip UI (when awaiting_payment) */}
      {!feeWaived && paymentStatus === 'awaiting_payment' && (isOwner || isStaff) && (
        <div className="space-y-3 pt-1 border-t border-line">
          {/* Receiving Bank / PromptPay Box from PaymentSettings */}
          {defaultAccount && (
            <div className="rounded-xl border border-line bg-surface-muted/40 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-brand flex items-center gap-1.5">
                  <Building2 className="size-3.5" />
                  <span>ช่องทางโอนเงินเข้าบัญชีหน่วยงาน</span>
                </span>
                {settings?.paymentDeadlineHours ? (
                  <span className="text-[11px] text-ink-mute">ชำระภายใน {settings.paymentDeadlineHours} ชม.</span>
                ) : null}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3.5">
                {defaultAccount.qrImageUrl ? (
                  <button
                    type="button"
                    onClick={() => setPreviewSlip(defaultAccount.qrImageUrl || null)}
                    className="w-28 h-28 rounded-xl bg-white p-1.5 border border-line shrink-0 overflow-hidden cursor-pointer hover:border-brand transition"
                    title="คลิกดู QR ขนาดใหญ่"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={defaultAccount.qrImageUrl} alt="QR Code รับชำระเงิน" className="w-full h-full object-contain" />
                  </button>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
                    <QrCode className="size-8" />
                  </div>
                )}

                <div className="text-xs space-y-1 flex-1 min-w-0 w-full">
                  <div className="font-bold text-ink text-[13px]">{defaultAccount.accountName}</div>
                  <div className="text-ink-soft">{defaultAccount.bankName}</div>
                  {defaultAccount.accountNo && (
                    <div className="text-ink-soft">
                      เลขที่บัญชี: <b className="font-mono text-ink select-all">{defaultAccount.accountNo}</b>
                    </div>
                  )}
                  {defaultAccount.promptpayId && (
                    <div className="text-ink-soft">
                      PromptPay: <b className="font-mono text-brand select-all">{defaultAccount.promptpayId}</b>
                    </div>
                  )}
                </div>
              </div>

              {settings?.cashEnabled && settings.cashCounterLocation && (
                <div className="pt-2 border-t border-line text-[11.5px] text-ink-mute">
                  หรือชำระเงินสดที่: <span className="text-ink-soft font-medium">{settings.cashCounterLocation}</span>
                </div>
              )}
            </div>
          )}

          {req.paymentNote && (
            <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">
              หมายเหตุจากเจ้าหน้าที่: {req.paymentNote}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleSelectSlip}
            className="hidden"
          />
          {slipDataUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slipDataUrl} alt="ตัวอย่างสลิป" className="w-full max-h-44 object-cover" />
              <button
                type="button"
                onClick={() => setSlipDataUrl('')}
                className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/75 text-white text-xs cursor-pointer"
              >
                เปลี่ยนรูป
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full py-3 px-4 rounded-xl border border-dashed border-brand/60 bg-brand/5 hover:bg-brand/10 text-brand text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Upload className="size-4" />
              <span>อัปโหลดรูปสลิปโอนเงิน ({formatBaht(totalAmount)})</span>
            </button>
          )}
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุการโอน (ถ้ามี เช่น เวลาโอน / ชื่อผู้โอน)"
            className="jw-in text-xs"
          />

          {/* Citizen refund destination input (shown when request has deposit) */}
          {depositAmount > 0 && (
            <div className="rounded-xl border border-line bg-surface-muted/40 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                <Wallet className="size-3.5 text-brand shrink-0" />
                <span>ช่องทางรับคืนเงินมัดจำ ({formatBaht(depositAmount)}) เมื่อใช้งาน/คืนของเรียบร้อย</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRefundMethod('transfer')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    refundMethod === 'transfer'
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-line bg-surface text-ink-soft hover:bg-hover'
                  }`}
                >
                  โอนคืนเข้าบัญชี / พร้อมเพย์
                </button>
                <button
                  type="button"
                  onClick={() => setRefundMethod('cash')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    refundMethod === 'cash'
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-line bg-surface text-ink-soft hover:bg-hover'
                  }`}
                >
                  รับเงินสด ณ สำนักงาน
                </button>
              </div>
              {refundMethod === 'transfer' ? (
                <div className="space-y-2">
                  <SearchableCombobox
                    size="compact"
                    value={refundBankName}
                    onChange={setRefundBankName}
                    options={REFUND_BANK_OPTIONS}
                    placeholder="เลือกธนาคาร หรือ พร้อมเพย์"
                  />
                  <input
                    type="text"
                    value={refundAccountNumber}
                    onChange={(e) => setRefundAccountNumber(e.target.value)}
                    placeholder="เลขที่บัญชี หรือ เบอร์พร้อมเพย์ (เช่น 081-234-5678)"
                    className="jw-in text-xs"
                  />
                  <input
                    type="text"
                    value={refundAccountName}
                    onChange={(e) => setRefundAccountName(e.target.value)}
                    placeholder="ชื่อบัญชีผู้รับคืน"
                    className="jw-in text-xs"
                  />
                </div>
              ) : (
                <div className="text-[11.5px] text-ink-mute">
                  เจ้าหน้าที่จะจ่ายเงินมัดจำคืนเป็นเงินสด ณ สำนักงาน เมื่อตรวจรับการส่งคืนเรียบร้อยแล้ว
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={busy || !slipDataUrl}
            onClick={handleSubmitSlip}
            className="jw-btn w-full min-h-[42px] text-sm disabled:opacity-50"
          >
            {busy ? 'กำลังส่งหลักฐาน...' : 'ส่งสลิปเพื่อรอเจ้าหน้าที่ตรวจสอบ'}
          </button>
        </div>
      )}

      {/* Staff controls: verify slip, record cash payment, waive fee, or refund deposit */}
      {isStaff && !feeWaived && (paymentStatus === 'awaiting_payment' || paymentStatus === 'verifying') && (
        <div className="space-y-2.5 pt-2 border-t border-line">
          <div className="text-xs font-bold text-ink flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-brand" />
            <span>สำหรับเจ้าหน้าที่การเงิน / ธุรการ</span>
          </div>
          <input
            type="text"
            value={receiptNo}
            onChange={(e) => setReceiptNo(e.target.value)}
            placeholder="เลขที่ใบเสร็จรับเงิน (เช่น RC-2569-0001)"
            className="jw-in text-xs"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {paymentStatus === 'verifying' ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleVerify('approve', 'transfer')}
                  className="jw-btn min-h-[40px] text-xs flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="size-4" />
                  <span>ยืนยันสลิปถูกต้อง</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleVerify('reject')}
                  className="jw-btn-sec min-h-[40px] text-xs text-rose-600 border-rose-500/40 flex items-center justify-center gap-1.5"
                >
                  <XCircle className="size-4" />
                  <span>แจ้งสลิปไม่ถูกต้อง</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleVerify('approve', 'cash')}
                  className="jw-btn min-h-[40px] text-xs flex items-center justify-center gap-1.5"
                >
                  <Banknote className="size-4" />
                  <span>รับชำระเงินสดแล้ว</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleVerify('waive')}
                  className="jw-btn-sec min-h-[40px] text-xs flex items-center justify-center gap-1.5"
                >
                  <span>อนุมัติยกเว้นค่าธรรมเนียม</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Staff deposit refund workflow */}
      {isStaff && paymentStatus === 'paid' && depositAmount > 0 && (
        <div className="pt-2 border-t border-line space-y-2.5">
          {!showRefundForm ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowRefundForm(true)}
              className="jw-btn-sec w-full min-h-[42px] text-xs font-semibold flex items-center justify-center gap-1.5 border-teal-500/40 text-teal-700 dark:text-teal-300 hover:bg-teal-500/10"
            >
              <RotateCcw className="size-3.5" />
              <span>ดำเนินการคืนเงินมัดจำ ({formatBaht(depositAmount)})</span>
            </button>
          ) : (
            <div className="rounded-xl border border-teal-500/35 bg-teal-500/5 p-3.5 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                  <RotateCcw className="size-4" />
                  <span>บันทึกการคืนเงินมัดจำให้ประชาชน</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRefundForm(false)}
                  className="text-ink-mute hover:text-ink text-xs cursor-pointer"
                >
                  ปิด
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStaffRefundMethod('transfer')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    staffRefundMethod === 'transfer'
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-line bg-surface text-ink-soft hover:bg-hover'
                  }`}
                >
                  โอนเงินคืน (แนบสลิป)
                </button>
                <button
                  type="button"
                  onClick={() => setStaffRefundMethod('cash')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    staffRefundMethod === 'cash'
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-line bg-surface text-ink-soft hover:bg-hover'
                  }`}
                >
                  คืนเงินสด ณ สำนักงาน
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-soft mb-1">
                    จำนวนเงินที่คืนจริง (บาท) · สูงสุด {formatBaht(depositAmount)}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={depositAmount}
                    step="1"
                    value={staffRefundAmount}
                    onChange={(e) => setStaffRefundAmount(e.target.value)}
                    className="jw-in text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-soft mb-1">
                    เลขที่ใบสำคัญจ่าย / อ้างอิง
                  </label>
                  <input
                    type="text"
                    value={staffRefundReceiptNo}
                    onChange={(e) => setStaffRefundReceiptNo(e.target.value)}
                    placeholder={`RF-${req.code}`}
                    className="jw-in text-xs font-mono"
                  />
                </div>
              </div>

              {staffRefundMethod === 'transfer' && (
                <div>
                  <input
                    ref={refundSlipRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleSelectRefundSlip}
                    className="hidden"
                  />
                  {staffRefundSlip ? (
                    <div className="relative rounded-xl overflow-hidden border border-teal-600">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={staffRefundSlip} alt="ตัวอย่างสลิปโอนคืน" className="w-full max-h-40 object-cover" />
                      <button
                        type="button"
                        onClick={() => setStaffRefundSlip('')}
                        className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/75 text-white text-xs cursor-pointer"
                      >
                        เปลี่ยนรูป
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => refundSlipRef.current?.click()}
                      className="w-full py-2.5 px-3 rounded-xl border border-dashed border-teal-600/60 bg-surface hover:bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Upload className="size-4" />
                      <span>อัปโหลดรูปสลิปโอนคืนเงินมัดจำ</span>
                    </button>
                  )}
                </div>
              )}

              <input
                type="text"
                value={staffRefundNote}
                onChange={(e) => setStaffRefundNote(e.target.value)}
                placeholder="หมายเหตุ (เช่น คืนเต็มจำนวน / หักค่าเสียหายเก้าอี้ 1 ตัว 200 บาท / ผู้รับเซ็นรับเงินสดแล้ว)"
                className="jw-in text-xs"
              />

              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmRefund}
                className="jw-btn w-full min-h-[40px] text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="size-4" />
                <span>
                  {busy
                    ? 'กำลังบันทึก...'
                    : `ยืนยันคืนเงินมัดจำ (${formatBaht(Math.max(0, Number(staffRefundAmount) || 0))})`}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

          {/* Lightbox for slip preview */}
          {previewSlip && (
            <div
              className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
              onClick={() => setPreviewSlip(null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSlip}
                alt="สลิปการชำระเงิน"
                className="max-w-full max-h-[85vh] rounded-2xl object-contain bg-white"
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
