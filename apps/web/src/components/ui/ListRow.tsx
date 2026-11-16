import React from 'react';
import Link from 'next/link';

/**
 * =====================================================================
 * แถวรายการข้อมูลแบบมาตรฐาน (ListRow Component)
 * =====================================================================
 * โครงสร้างแถวแสดงผลรายการคำขอหรือประวัติ:
 * - ซ้าย: รหัสคำขอ (code), หัวเรื่อง (title), ข้อความย่อย (subtitle)
 * - ขวา: ชิปสถานะ (chip), เนื้อหาเพิ่มเติม (rightExtra)
 * - รองรับ prop `href` เพื่อเชื่อมต่อไปยังหน้ารายละเอียดพร้อมเอฟเฟกต์ hover
 */

export interface ListRowProps {
  href?: string;
  code?: React.ReactNode;
  title: string;
  subtitle?: string;
  chip?: React.ReactNode;
  rightExtra?: React.ReactNode;
  className?: string;
}

export function ListRow({
  href,
  code,
  title,
  subtitle,
  chip,
  rightExtra,
  className = '',
}: ListRowProps) {
  // เนื้อหาภายในแถวรายการ
  const innerContent = (
    <div
      className={[
        'flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2.5 sm:gap-3 border-t border-line-soft py-3 first:border-t-0 transition-colors',
        href ? 'group-hover:text-brand' : '',
        className,
      ].join(' ')}
    >
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        {code && <div className="flex flex-wrap items-center gap-2 text-caption text-muted">{code}</div>}
        <div className="text-body font-medium text-ink break-words leading-snug">{title}</div>
        {subtitle && <div className="text-caption text-muted break-words leading-relaxed mt-0.5">{subtitle}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {chip}
        {rightExtra}
      </div>
    </div>
  );

  // กรณีมี href ให้ครอบด้วย Link
  if (href) {
    return (
      <Link href={href} className="group block focus-visible:outline-2 focus-visible:outline-brand rounded-control">
        {innerContent}
      </Link>
    );
  }

  return innerContent;
}
