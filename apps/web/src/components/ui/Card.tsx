import React from 'react';
import Link from 'next/link';

/**
 * =====================================================================
 * การ์ดมาตรฐานสำหรับเนื้อหา (Card Component Primitive)
 * =====================================================================
 * คุณสมบัติ:
 * - ปรับระดับ Padding ได้ 3 แบบ: 'normal' (p-5), 'list' (px-6 py-5), 'none' (0)
 * - หากระบุ prop `href` จะเรนเดอร์เป็นคอมโพเนนต์ Next.js `<Link>` พร้อมเอฟเฟกต์ยกตัว (hover: -translate-y-0.5)
 * - เส้นขอบและเงาพื้นฐานตามระบบ Design System
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  href?: string;
  padding?: 'normal' | 'list' | 'none';
  children: React.ReactNode;
}

export function Card({
  href,
  padding = 'normal',
  className = '',
  children,
  ...props
}: CardProps) {
  // คำนวณคลาส Padding ตามการกำหนด
  const padClass =
    padding === 'normal' ? 'p-5' : padding === 'list' ? 'px-6 py-5' : '';

  // รวมคลาสพื้นฐานของการ์ด
  const baseClass = [
    'rounded-card border border-line bg-surface shadow-card transition-all duration-200',
    padClass,
    href ? 'hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-md block' : '',
    className,
  ].join(' ');

  // หากมี href ให้ส่งออกเป็น Next.js Link
  if (href) {
    return (
      <Link href={href} className={baseClass}>
        {children}
      </Link>
    );
  }

  // หากไม่มี href ให้ส่งออกเป็น div ทั่วไป
  return (
    <div className={baseClass} {...props}>
      {children}
    </div>
  );
}
