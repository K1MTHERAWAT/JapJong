import React from 'react';
import { Button } from './Button';

/**
 * =====================================================================
 * คอมโพเนนต์แสดงผลย้อนกลับและสถานะ (Feedback & State UI Components)
 * =====================================================================
 * 1. LoadingSkeleton: โครงร่างกะพริบระหว่างโหลดข้อมูล (Pulse Animation)
 * 2. EmptyState: กล่องข้อความเมื่อไม่มีข้อมูล พร้อมปุ่ม Call-to-action
 * 3. ErrorState: กล่องแจ้งเตือนข้อผิดพลาดสีแดง พร้อมปุ่ม "ลองอีกครั้ง" (Retry)
 * 4. Feedback: แถบข้อความแจ้งเตือนผลการดำเนินงาน (Toast/Alert Banner) 4 โทนสี
 */

// โครงร่างโหลดกะพริบ
export function LoadingSkeleton({ className = 'h-24 w-full' }: { className?: string }) {
  return <div className={`bg-surface-muted animate-pulse rounded-card ${className}`} />;
}

// กล่องแสดงผลเมื่อไม่มีข้อมูลในระบบ
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-card border border-dashed border-line bg-surface">
      <div className="text-heading text-ink font-semibold">{title}</div>
      {description && <div className="text-body text-muted mt-1 max-w-sm">{description}</div>}
      {actionLabel && (
        <div className="mt-4">
          {actionHref ? (
            <a href={actionHref}>
              <Button variant="primary">{actionLabel}</Button>
            </a>
          ) : (
            <Button variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// กล่องแสดงผลเมื่อเกิดข้อผิดพลาด
export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-card border border-danger-fg/20 bg-danger-bg p-5">
      <div className="text-body font-semibold text-danger-fg">
        {message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล'}
      </div>
      {onRetry && (
        <div className="mt-3">
          <Button variant="secondary" onClick={onRetry}>
            ลองอีกครั้ง
          </Button>
        </div>
      )}
    </div>
  );
}

// แถบข้อความตอบกลับผลลัพธ์ (Alert / Feedback Banner)
export function Feedback({
  tone = 'neutral',
  className = '',
  children,
}: {
  tone?: 'brand' | 'crit' | 'neutral' | 'warn';
  className?: string;
  children: React.ReactNode;
}) {
  const toneClasses = {
    brand: 'bg-[#F2F7F4] border-brand/30 text-brand-ink',
    crit: 'bg-danger-bg border-danger-fg/30 text-danger-fg',
    warn: 'bg-warn-bg border-warn-fg/30 text-warn-fg',
    neutral: 'bg-surface-muted border-line text-ink-soft',
  };
  return (
    <div
      className={`rounded-control border p-3.5 text-caption font-medium flex items-center justify-between gap-2 ${
        toneClasses[tone] || toneClasses.neutral
      } ${className}`}
    >
      <div>{children}</div>
    </div>
  );
}
