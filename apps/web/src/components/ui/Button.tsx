import React from 'react';

/**
 * =====================================================================
 * ปุ่มมาตรฐานระบบราชการดิจิทัล (Button Component Primitive)
 * =====================================================================
 * อ้างอิงลำดับขั้นความสำคัญจาก GOV Components Library:
 * - primary: ปุ่มหลักโทนสีแบรนด์ (เขียวมรกตราชการ) สำหรับ Action หลักของหน้าจอ
 * - secondary: ปุ่มรองพื้นผิวขาวขอบเทา สำหรับการกระทำรอง เช่น ย้อนกลับ / ยกเลิก
 * - tertiary / ghost: ปุ่มลำดับที่ 3 แบบโปร่งใส สำหรับการกระทำเสริมที่ไม่แย่งสายตา
 * - destructive / danger: ปุ่มสำหรับการลบ ยกเลิกคำขอ หรือไม่อนุมัติ (โทนสีแดงสุภาพ)
 * - icon: ปุ่มทรงจัตุรัสสำหรับไอคอนล้วน (44x44px มาตรฐาน Hitbox)
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'destructive'
  | 'ghost'
  | 'icon'
  | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: React.ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'inline-flex items-center justify-center gap-2 text-center rounded-control bg-brand font-semibold text-white shadow-xs hover:bg-brand-ink active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
  secondary:
    'inline-flex items-center justify-center gap-2 text-center rounded-control border border-line-input bg-surface font-semibold text-ink shadow-xs hover:bg-hover hover:border-ink-mute active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
  tertiary:
    'inline-flex items-center justify-center gap-2 text-center rounded-control bg-transparent font-semibold text-ink-soft hover:bg-hover hover:text-ink active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
  ghost:
    'inline-flex items-center justify-center gap-2 text-center rounded-control bg-transparent font-semibold text-ink-soft hover:bg-hover hover:text-ink active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
  icon:
    'grid size-11 shrink-0 place-items-center rounded-control text-ink-soft hover:bg-hover hover:text-ink active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
  destructive:
    'inline-flex items-center justify-center gap-2 text-center rounded-control bg-danger-solid font-semibold text-white shadow-xs hover:opacity-90 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-fg',
  danger:
    'inline-flex items-center justify-center gap-2 text-center rounded-control bg-danger-solid font-semibold text-white shadow-xs hover:opacity-90 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-fg',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] h-auto py-1.5 px-3 text-caption rounded-lg',
  md: 'min-h-[44px] h-auto py-2 px-4 text-body',
  lg: 'min-h-[48px] h-auto py-2.5 px-5 text-[15px]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', disabled, children, ...props }, ref) => {
    const sizeClass = variant === 'icon' ? '' : SIZES[size];
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={[
          VARIANTS[variant],
          sizeClass,
          'transition-all duration-150 select-none cursor-pointer',
          'disabled:opacity-50 disabled:pointer-events-none',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
