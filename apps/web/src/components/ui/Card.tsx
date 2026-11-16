import React from 'react';
import Link from 'next/link';

/**
 * =====================================================================
 * การ์ดมาตรฐานสำหรับบรรจุเนื้อหา (Card Component Primitive)
 * =====================================================================
 * คุณสมบัติตามแนวทาง GOV Components Library:
 * - ปรับระดับ Padding ได้ 4 แบบ: 'normal' (p-5 sm:p-6), 'compact' (p-4), 'list' (px-5 py-4 sm:px-6 sm:py-5), 'none' (0)
 * - หากระบุ prop `href` จะเรนเดอร์เป็นคอมโพเนนต์ Next.js `<Link>` พร้อมเอฟเฟกต์ยกตัวนุ่มนวล
 * - เส้นขอบ ความโค้งมน และเงาตาม Design Tokens ส่วนกลาง
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  href?: string;
  padding?: 'normal' | 'compact' | 'list' | 'none';
  children: React.ReactNode;
}

export function Card({
  href,
  padding = 'normal',
  className = '',
  children,
  ...props
}: CardProps) {
  const padClass =
    padding === 'normal'
      ? 'p-5 sm:p-6'
      : padding === 'compact'
      ? 'p-4'
      : padding === 'list'
      ? 'px-5 py-4 sm:px-6 sm:py-5'
      : '';

  const baseClass = [
    'rounded-card border border-line bg-surface shadow-card transition-all duration-200',
    padClass,
    href ? 'hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-high block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (href) {
    return (
      <Link href={href} className={baseClass}>
        {children}
      </Link>
    );
  }

  return (
    <div className={baseClass} {...props}>
      {children}
    </div>
  );
}
