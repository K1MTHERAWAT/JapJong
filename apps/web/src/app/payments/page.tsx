'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Banknote, ExternalLink, Search, Settings } from 'lucide-react';
import {
  PAYMENT_STATUS_LABEL,
  PaymentSettings,
  PaymentStatus,
  RequestWithTimeline,
  formatBaht,
  hasPermission,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { PaymentStatusCard, RequestTypeChip } from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate } from '@/lib/api';

type PaymentTab = 'all' | 'awaiting_payment' | 'verifying' | 'paid';

function renderPaymentBadge(req: RequestWithTimeline) {
  if (req.feeWaived) {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
        ยกเว้นค่าธรรมเนียม
      </span>
    );
  }
  const st: PaymentStatus = req.paymentStatus || 'not_required';
  const isPendingApproval = ['pending_staff', 'pending_l2', 'pending_l1'].includes(req.status);
  if (isPendingApproval) {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-muted text-ink-soft border border-line">
        ชำระหลังอนุมัติ
      </span>
    );
  }
  const cls =
    st === 'paid' || st === 'refunded'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
      : st === 'verifying'
        ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
        : st === 'awaiting_payment'
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
          : 'bg-surface-muted text-ink-soft border-line';
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{PAYMENT_STATUS_LABEL[st]}</span>;
}

export default function PaymentsPage() {
  const { account, loading: authLoading } = useAuth();
  const isStaff =
    account?.role === 'STAFF' ||
    account?.role === 'ADMIN' ||
    hasPermission(account, 'review') ||
    hasPermission(account, 'handover');

  const [items, setItems] = useState<RequestWithTimeline[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PaymentTab>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqs, settings] = await Promise.all([
        api.listRequests(isStaff ? {} : { mine: true }),
        api.getPaymentSettings().catch(() => null),
      ]);
      const payable = (reqs || []).filter((r) => Number(r.totalAmount || 0) > 0 || Boolean(r.feeWaived));
      setItems(payable);
      if (settings) setPaymentSettings(settings);
      setSelectedId((prev) => {
        if (prev && payable.some((r) => r.id === prev)) return prev;
        return payable[0]?.id ?? null;
      });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const counts = useMemo(() => {
    return {
      all: items.length,
      awaiting_payment: items.filter((r) => !r.feeWaived && r.paymentStatus === 'awaiting_payment').length,
      verifying: items.filter((r) => !r.feeWaived && r.paymentStatus === 'verifying').length,
      paid: items.filter((r) => r.feeWaived || r.paymentStatus === 'paid' || r.paymentStatus === 'refunded').length,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((r) => {
      if (tab === 'awaiting_payment' && (r.feeWaived || r.paymentStatus !== 'awaiting_payment')) return false;
      if (tab === 'verifying' && (r.feeWaived || r.paymentStatus !== 'verifying')) return false;
      if (tab === 'paid' && !r.feeWaived && r.paymentStatus !== 'paid' && r.paymentStatus !== 'refunded') return false;
      if (!q) return true;
      return `${r.code} ${r.title} ${r.requesterName} ${r.organization} ${r.receiptNo || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [items, tab, query]);

  const selected = useMemo(() => {
    return filtered.find((r) => r.id === selectedId) || filtered[0] || null;
  }, [filtered, selectedId]);

  return (
    <AppShell
      title={isStaff ? 'จัดการการชำระเงิน' : 'ชำระเงินค่าธรรมเนียม'}
      backHref={isStaff ? '/staff' : '/'}
      rightLabel={account?.nickname}
    >
      <div className="flex flex-col gap-5">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[20px] sm:text-[22px] font-bold text-ink tracking-tight m-0">
              {isStaff ? 'จัดการการชำระเงินและตรวจสลิป' : 'รายการชำระเงินของฉัน'}
            </h2>
            <p className="text-[13px] text-ink-mute mt-0.5 mb-0">
              {isStaff
                ? 'ตรวจสอบสลิปโอนเงิน บันทึกรับชำระเงินสด ออกเลขที่ใบเสร็จ และคืนเงินมัดจำ'
                : 'ดูยอดค่าบริการและค่ามัดจำ โอนเงินตามบัญชีหน่วยงาน และแนบสลิปได้ทันที'}
            </p>
          </div>
          {isStaff && (
            <Link
              href="/staff/payment-settings"
              className="jw-btn-sec min-h-[42px] px-4 text-[13px] font-semibold inline-flex items-center gap-2 shrink-0 self-start sm:self-auto"
            >
              <Settings className="size-4 text-brand" />
              <span>ตั้งค่าบัญชีรับเงิน</span>
            </Link>
          )}
        </div>

        {/* Filter Tabs + Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="inline-flex flex-wrap p-1 rounded-2xl border border-line bg-surface gap-1">
            {(
              [
                ['all', `ทั้งหมด (${counts.all})`],
                ['awaiting_payment', `รอชำระ (${counts.awaiting_payment})`],
                ['verifying', `รอตรวจสลิป (${counts.verifying})`],
                ['paid', `ชำระแล้ว (${counts.paid})`],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-semibold transition cursor-pointer ${
                  tab === k ? 'bg-brand text-white shadow-xs' : 'text-ink-soft hover:bg-surface-muted'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="size-4 text-ink-mute absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาเลขคำขอ, ชื่อผู้ขอ, เลขใบเสร็จ..."
              className="jw-in pl-9 text-sm"
            />
          </div>
        </div>

        {/* Master-Detail Workspace */}
        {loading ? (
          <div className="jw-card p-12 text-center text-sm text-ink-mute">กำลังโหลดรายการชำระเงิน...</div>
        ) : filtered.length === 0 ? (
          <div className="jw-card p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
              <Banknote className="size-7" />
            </div>
            <b className="text-[16px] text-ink">ไม่มีรายการที่มีค่าใช้จ่ายในหมวดนี้</b>
            <p className="text-[13px] text-ink-mute max-w-md m-0">
              รายการจองสถานที่หรือยืมอุปกรณ์ที่มีการตั้งค่าธรรมเนียมหรือค่ามัดจำจะแสดงที่นี่โดยอัตโนมัติ
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-5 items-start">
            {/* Left Master List */}
            <div className="flex flex-col gap-2.5 max-h-[75vh] overflow-y-auto pr-0.5">
              {filtered.map((r) => {
                const isSelected = selected?.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full p-4 rounded-2xl border text-left transition cursor-pointer bg-surface ${
                      isSelected
                        ? 'border-brand ring-2 ring-brand/15'
                        : 'border-line hover:border-brand/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-mono font-bold text-ink">{r.code}</span>
                      {renderPaymentBadge(r)}
                    </div>
                    <div className="text-[14px] font-bold text-ink truncate">{r.title}</div>
                    <div className="flex items-center justify-between gap-2 mt-2 text-xs">
                      <span className="text-ink-mute truncate">{r.requesterName}</span>
                      <span className="font-extrabold text-brand shrink-0">{formatBaht(r.totalAmount)}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Detail Workspace */}
            {selected && (
              <div className="flex flex-col gap-4">
                <div className="jw-card p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-ink-mute">{selected.code}</span>
                      <RequestTypeChip type={selected.type} />
                      {renderPaymentBadge(selected)}
                    </div>
                    <h3 className="text-[18px] font-bold text-ink m-0">{selected.title}</h3>
                    <div className="text-xs sm:text-[13px] text-ink-soft">
                      ผู้ขอ: <b className="text-ink">{selected.requesterName}</b> · {selected.organization || '-'}
                    </div>
                    <div className="text-xs text-ink-mute">
                      {selected.type === 'booking'
                        ? selected.periods.map((p) => formatPeriodRange(p)).join(', ')
                        : selected.type === 'borrow'
                          ? `ช่วงยืม: ${formatThaiDate(selected.pickupDate, false)}–${formatThaiDate(selected.returnDate, true)}`
                          : ''}
                    </div>
                  </div>
                  <Link
                    href={`/requests/${selected.id}`}
                    className="jw-btn-sec min-h-[38px] px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                  >
                    <span>ดูรายละเอียดคำขอ</span>
                    <ExternalLink className="size-3.5" />
                  </Link>
                </div>

                <PaymentStatusCard
                  req={selected}
                  account={account}
                  paymentSettings={paymentSettings}
                  onUpdated={() => {
                    void load();
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
