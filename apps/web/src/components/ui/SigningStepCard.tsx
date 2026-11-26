'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, FileText, PenLine, X } from 'lucide-react';

export type SigningStepStatus =
  | 'signed'
  | 'current'
  | 'upcoming'
  | 'rejected'
  | 'cancelled'
  | 'system_pending'
  | 'system_ready';

export interface SigningStepCardProps {
  stepNumber: number;
  roleTitle: string;
  shortRoleTitle?: string;
  status: SigningStepStatus;
  signerName?: string;
  signature?: string | null;
  signedAtText?: string;
  hint?: string;
  note?: string;
  systemNote?: string;
  actionHref?: string;
  actionLabel?: string;
}

export interface SigningProgressSpotlightProps {
  steps: SigningStepCardProps[];
  requestKey?: string;
}

const CARD_STYLE: Record<SigningStepStatus, string> = {
  signed: 'border-ok-border bg-ok-bg/20',
  system_ready: 'border-ok-border bg-ok-bg/20',
  current: 'border-warn-border bg-warn-bg/25 ring-1 ring-warn-border/40',
  rejected: 'border-danger-border bg-danger-bg/20',
  upcoming: 'border-line bg-surface-muted/40',
  cancelled: 'border-line bg-surface-muted/40',
  system_pending: 'border-line bg-surface-muted/40',
};

const STEP_PILL_STYLE: Record<SigningStepStatus, string> = {
  signed: 'bg-ok-bg text-ok-fg border-ok-border',
  system_ready: 'bg-ok-bg text-ok-fg border-ok-border',
  current: 'bg-warn-bg text-warn-fg border-warn-border',
  rejected: 'bg-danger-bg text-danger-fg border-danger-border',
  upcoming: 'bg-surface text-ink-soft border-line',
  cancelled: 'bg-surface text-ink-soft border-line',
  system_pending: 'bg-surface text-ink-soft border-line',
};

const BADGE_STYLE: Record<SigningStepStatus, { cls: string; text: string; queueText: string }> = {
  signed: {
    cls: 'bg-ok-bg text-ok-fg border-ok-border',
    text: '✓ ลงนามแล้ว',
    queueText: 'ลงนามแล้ว',
  },
  system_ready: {
    cls: 'bg-ok-bg text-ok-fg border-ok-border',
    text: '✓ ออกเอกสารแล้ว',
    queueText: 'ออกเอกสารแล้ว',
  },
  current: {
    cls: 'bg-warn-bg text-warn-fg border-warn-border',
    text: '● รอลงนาม · ปัจจุบัน',
    queueText: 'ปัจจุบัน',
  },
  rejected: {
    cls: 'bg-danger-bg text-danger-fg border-danger-border',
    text: '✕ ไม่ผ่านการอนุมัติ',
    queueText: 'ไม่อนุมัติ',
  },
  upcoming: {
    cls: 'bg-surface text-ink-soft border-line',
    text: 'รอดำเนินการ',
    queueText: 'รอดำเนินการ',
  },
  system_pending: {
    cls: 'bg-surface text-ink-soft border-line',
    text: 'รอดำเนินการ',
    queueText: 'รอดำเนินการ',
  },
  cancelled: {
    cls: 'bg-surface text-ink-soft border-line',
    text: 'ยกเลิกแล้ว',
    queueText: 'ยกเลิกแล้ว',
  },
};

const QUEUE_DOT_STYLE: Record<SigningStepStatus, string> = {
  signed: 'bg-brand text-white border-brand',
  system_ready: 'bg-brand text-white border-brand',
  current: 'bg-warn-bg text-warn-fg border-warn-border',
  rejected: 'bg-danger-solid text-white border-danger-solid',
  upcoming: 'bg-surface text-ink-soft border-line',
  system_pending: 'bg-surface text-ink-soft border-line',
  cancelled: 'bg-surface text-ink-soft border-line',
};

function findDefaultStepIndex(steps: SigningStepCardProps[]): number {
  const currentIdx = steps.findIndex((s) => s.status === 'current');
  if (currentIdx !== -1) return currentIdx;
  const rejectedIdx = steps.findIndex((s) => s.status === 'rejected');
  if (rejectedIdx !== -1) return rejectedIdx;
  const readyIdx = steps.findIndex((s) => s.status === 'system_ready');
  if (readyIdx !== -1) return readyIdx;
  return 0;
}

/**
 * แสดงความคืบหน้าการลงนามแบบ Active Spotlight + Interactive Queue (ดีไซน์แบบที่ 3)
 * - ด้านซ้าย: ไฮไลต์ขั้นตอนปัจจุบัน/ขั้นตอนที่เลือก พร้อมพรีวิวลายมือชื่อและแถบลายเซ็นที่บันทึกแล้ว
 * - ด้านขวา: รายการคิวทั้ง 5 ลำดับแบบกระชับ คลิกสลับดูรายละเอียดแต่ละลำดับได้ทันที
 */
export function SigningProgressSpotlight({ steps, requestKey }: SigningProgressSpotlightProps) {
  const statusSignature = steps.map((s) => `${s.stepNumber}:${s.status}`).join('|');
  const [selectedIndex, setSelectedIndex] = useState<number>(() => findDefaultStepIndex(steps));

  useEffect(() => {
    setSelectedIndex(findDefaultStepIndex(steps));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, statusSignature]);

  if (steps.length === 0) return null;

  const safeIndex = selectedIndex >= 0 && selectedIndex < steps.length ? selectedIndex : 0;
  const activeStep = steps[safeIndex];
  const activeBadge = BADGE_STYLE[activeStep.status];
  const isActiveSystem =
    activeStep.status === 'system_pending' || activeStep.status === 'system_ready';
  const signedSteps = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.status === 'signed');

  const renderSpotlightDescription = () => {
    if (activeStep.note) {
      if (activeStep.status === 'rejected') {
        return <span className="text-danger-fg font-medium">เหตุผลที่ไม่ผ่าน: {activeStep.note}</span>;
      }
      return <span>หมายเหตุ: {activeStep.note}</span>;
    }
    if (isActiveSystem) {
      return (
        <span>
          {activeStep.status === 'system_ready'
            ? 'ลงนามครบทั้ง 4 ฝ่ายเรียบร้อยแล้ว ระบบออกเอกสารใบอนุญาต PDF พร้อมเปิดดูหรือสั่งพิมพ์'
            : activeStep.systemNote || 'ออกโดยระบบเมื่อลงนามครบทั้ง 4 ฝ่าย'}
        </span>
      );
    }
    if (activeStep.status === 'signed' && activeStep.signerName) {
      return <span>ยืนยันตัวตนและลงลายมือชื่อโดย {activeStep.signerName}</span>;
    }
    if (activeStep.status === 'current') {
      return (
        <span>
          {activeStep.hint || 'กำลังรอผู้รับผิดชอบตรวจสอบรายละเอียดและเขียนลายมือชื่อบนหน้าจอ'}
        </span>
      );
    }
    if (activeStep.status === 'cancelled') {
      return <span>คำขอนี้ถูกยกเลิกการดำเนินการแล้ว</span>;
    }
    return (
      <span>{activeStep.hint || 'จะเปิดให้ลงนามอัตโนมัติเมื่อขั้นตอนก่อนหน้าอนุมัติแล้ว'}</span>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch min-w-0">
      {/* คอลัมน์ซ้าย (7 ส่วน): Active Spotlight แสดงรายละเอียดของขั้นตอนที่เลือก */}
      <div
        className={`lg:col-span-7 rounded-control border p-4 flex flex-col justify-between gap-3.5 min-w-0 transition-colors ${CARD_STYLE[activeStep.status]}`}
      >
        {/* ส่วนหัวของขั้นตอนที่กำลังโฟกัส */}
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold border ${activeBadge.cls}`}
            >
              ลำดับที่ {activeStep.stepNumber} · {activeBadge.text}
            </span>
          </div>
          <h3 className="text-[16px] font-bold text-ink leading-snug pt-0.5">
            {activeStep.roleTitle}
          </h3>
          <p className="text-[12.5px] text-ink-soft leading-relaxed">
            {renderSpotlightDescription()}
          </p>
        </div>

        {/* กล่องพรีวิวลายมือชื่อ หรือ สถานะเอกสารระบบ */}
        <div className="rounded-control bg-surface border border-line p-4 flex flex-col items-center justify-center min-h-[124px] text-center gap-2">
          {isActiveSystem ? (
            <>
              <div
                className={`size-9 rounded-full border flex items-center justify-center shrink-0 ${
                  activeStep.status === 'system_ready'
                    ? 'bg-ok-bg text-ok-fg border-ok-border'
                    : 'bg-surface-muted text-ink-mute border-line'
                }`}
              >
                <FileText className="size-4" />
              </div>
              <div className="text-[13.5px] font-semibold text-ink leading-snug">
                {activeStep.status === 'system_ready'
                  ? 'ออกเอกสารใบอนุญาต (PDF) เรียบร้อยแล้ว'
                  : activeStep.systemNote || 'ออกโดยระบบเมื่อลงนามครบทั้ง 4 ฝ่าย'}
              </div>
              {activeStep.actionHref && activeStep.actionLabel ? (
                <Link
                  href={activeStep.actionHref}
                  className="jw-btn min-h-[42px] px-4 text-[13px] inline-flex items-center gap-1.5 mt-0.5"
                >
                  <FileText className="size-4" />
                  {activeStep.actionLabel}
                </Link>
              ) : (
                <span className="text-[12px] text-ink-mute">
                  ระบบจะสร้างไฟล์ PDF อัตโนมัติทันทีที่ผู้มีอำนาจลงนามครบทั้ง 4 ฝ่าย
                </span>
              )}
            </>
          ) : activeStep.signature ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeStep.signature}
                alt={`ลายมือชื่อ ${activeStep.roleTitle}`}
                className="max-h-[54px] max-w-full object-contain"
              />
              <div className="text-[12.5px] font-semibold text-ink border-t border-dotted border-line-input pt-1.5 px-6 max-w-full truncate">
                {activeStep.signerName ? `(${activeStep.signerName})` : activeStep.roleTitle}
              </div>
              {activeStep.signedAtText && (
                <div className="text-[12px] text-ink-mute">{activeStep.signedAtText}</div>
              )}
            </>
          ) : (activeStep.status === 'signed' || activeStep.status === 'rejected') &&
            activeStep.signerName ? (
            <>
              <div className="text-[13.5px] font-semibold text-ink">
                ({activeStep.signerName})
              </div>
              {activeStep.signedAtText && (
                <div className="text-[12px] text-ink-mute">{activeStep.signedAtText}</div>
              )}
            </>
          ) : (
            <>
              <div
                className={`size-9 rounded-full border flex items-center justify-center shrink-0 ${
                  activeStep.status === 'current'
                    ? 'bg-warn-bg text-warn-fg border-warn-border'
                    : 'bg-surface-muted text-ink-mute border-line'
                }`}
              >
                <PenLine className="size-4" />
              </div>
              <div className="text-[13px] font-semibold text-ink">
                {activeStep.status === 'current'
                  ? 'กำลังรอผู้รับผิดชอบเขียนลายมือชื่อบนหน้าจอ'
                  : activeStep.status === 'cancelled'
                    ? 'ยกเลิกการดำเนินการแล้ว'
                    : 'ยังไม่มีลายมือชื่อในขั้นตอนนี้'}
              </div>
              <div className="text-[12px] text-ink-mute">
                ต้องลงนามด้วยลายมือชื่อจริงบนหน้าจอเพื่อยืนยันความรับผิดชอบ
              </div>
            </>
          )}
        </div>

        {/* แถบรวมลายมือชื่อที่บันทึกแล้วด้านล่างของการ์ด Spotlight */}
        {signedSteps.length > 0 && (
          <div className="flex flex-col gap-2 pt-2.5 border-t border-line/80">
            <span className="text-[12px] font-semibold text-ink-soft">
              ลายมือชื่อที่บันทึกแล้ว ({signedSteps.length} ฝ่าย):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {signedSteps.map(({ step, index }) => {
                const isFocused = index === safeIndex;
                return (
                  <button
                    key={step.stepNumber}
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-control border text-left transition cursor-pointer min-w-0 ${
                      isFocused
                        ? 'bg-surface border-brand ring-1 ring-brand/30'
                        : 'bg-surface/80 border-line hover:bg-surface'
                    }`}
                  >
                    <div className="h-[40px] w-[76px] rounded-md bg-surface border border-line/80 px-1.5 py-1 flex items-center justify-center shrink-0">
                      {step.signature ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={step.signature}
                          alt={`ลายมือชื่อ ${step.roleTitle}`}
                          className="max-h-[30px] max-w-full object-contain"
                        />
                      ) : (
                        <Check className="size-4 text-ok-fg" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-ink truncate">
                        {step.shortRoleTitle || step.roleTitle}
                      </div>
                      <div className="text-[11.5px] text-ink-soft truncate">
                        {step.signerName || '-'}
                      </div>
                      {step.signedAtText && (
                        <div className="text-[11px] font-medium text-ok-fg truncate">
                          {step.signedAtText}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* คอลัมน์ขวา (5 ส่วน): Interactive Queue แสดงลำดับ 1–5 แบบกระชับ */}
      <div className="lg:col-span-5 flex flex-col justify-between gap-2 min-w-0">
        {steps.map((s, idx) => {
          const isSelected = idx === safeIndex;
          const badge = BADGE_STYLE[s.status];
          const isDone = s.status === 'signed' || s.status === 'system_ready';
          const isRejected = s.status === 'rejected';
          const isSystem = s.status === 'system_pending' || s.status === 'system_ready';

          const subtext = s.signerName
            ? `${s.signerName}${s.signedAtText ? ` · ${s.signedAtText}` : ''}`
            : s.status === 'current'
              ? 'กำลังรอลงนามในขั้นตอนนี้'
              : isSystem
                ? s.status === 'system_ready'
                  ? 'พร้อมเปิดดูใบอนุญาต PDF'
                  : s.systemNote || 'ออกโดยระบบเมื่อลงนามครบทั้ง 4 ฝ่าย'
                : s.status === 'cancelled'
                  ? 'ยกเลิกคำขอแล้ว'
                  : 'รอดำเนินการตามลำดับ';

          return (
            <button
              key={s.stepNumber}
              type="button"
              onClick={() => setSelectedIndex(idx)}
              aria-pressed={isSelected}
              className={`w-full text-left px-3.5 py-2.5 min-h-[54px] rounded-control border transition flex items-center justify-between gap-3 cursor-pointer min-w-0 ${
                isSelected
                  ? 'border-brand bg-brand-tint/65 ring-1 ring-brand/35'
                  : 'border-line bg-surface-muted/35 hover:bg-hover'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span
                  className={`size-6 rounded-full border text-[12px] font-bold flex items-center justify-center shrink-0 ${QUEUE_DOT_STYLE[s.status]}`}
                >
                  {isDone ? (
                    <Check className="size-3.5 stroke-[2.5]" />
                  ) : isRejected ? (
                    <X className="size-3.5 stroke-[2.5]" />
                  ) : (
                    s.stepNumber
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-ink truncate">{s.roleTitle}</div>
                  <div className="text-[11.5px] text-ink-mute truncate">{subtext}</div>
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold border shrink-0 ${badge.cls}`}
              >
                {badge.queueText}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * การ์ดแสดงสถานะและลายมือชื่อรายใบ (คงไว้สำหรับความเข้ากันได้ย้อนหลัง)
 */
export function SigningStepCard({
  stepNumber,
  roleTitle,
  status,
  signerName,
  signature,
  signedAtText,
  systemNote,
  actionHref,
  actionLabel,
}: SigningStepCardProps) {
  const isSystemStep = status === 'system_pending' || status === 'system_ready';
  const badge = BADGE_STYLE[status];

  return (
    <div
      className={`rounded-control border p-3.5 flex flex-col gap-2.5 min-w-0 transition-colors ${CARD_STYLE[status]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${STEP_PILL_STYLE[status]}`}
        >
          ลำดับที่ {stepNumber}
        </span>
      </div>

      <b className="text-[14px] font-bold text-ink leading-snug min-h-[38px] flex items-start">
        {roleTitle}
      </b>

      {isSystemStep ? (
        <div className="h-[96px] flex flex-col items-center justify-center gap-1.5 px-3 rounded-lg bg-surface border border-dashed border-line text-center">
          <FileText className="size-4 text-ink-mute shrink-0" />
          <span className="text-[12px] text-ink-soft leading-relaxed">
            {systemNote || 'ออกโดยระบบเมื่อลงนามครบทั้ง 4 ฝ่าย'}
          </span>
        </div>
      ) : (
        <div className="h-[96px] rounded-lg bg-surface border border-line/80 px-3 py-2 flex flex-col items-center justify-between">
          <div className="flex-1 w-full flex items-end justify-center pb-1 border-b border-dotted border-line-input">
            {signature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signature}
                alt={`ลายมือชื่อ ${roleTitle}`}
                className="max-h-[48px] max-w-full object-contain"
              />
            ) : (
              <span className="text-[12px] text-ink-mute select-none pb-0.5">
                {status === 'cancelled' || status === 'rejected' ? '-' : 'ลงชื่อ'}
              </span>
            )}
          </div>
          <span className="pt-1 text-[11.5px] leading-tight text-ink-soft truncate max-w-full">
            {signerName && (status === 'signed' || status === 'rejected')
              ? `(${signerName})`
              : '\u00A0'}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1 pt-0.5">
        <span
          className={`inline-flex items-center w-fit px-2.5 py-0.5 rounded-full text-[12px] font-semibold border ${badge.cls}`}
        >
          {badge.text}
        </span>
        <span className="min-h-[18px] text-[11.5px] text-ink-mute leading-snug">
          {signedAtText || '\u00A0'}
        </span>
        {actionHref && actionLabel && (
          <Link href={actionHref} className="jw-btn min-h-[44px] px-3 text-[12.5px] w-full mt-0.5">
            {actionLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
