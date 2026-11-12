import React, { useId } from 'react';

/**
 * =====================================================================
 * ช่องกรอกข้อความมาตรฐาน (Input Field Primitive)
 * =====================================================================
 * คุณสมบัติ:
 * - รองรับ label, error message, และ helperText
 * - สร้าง id อัตโนมัติด้วย React `useId()`
 * - มาตรฐานการเข้าถึง Accessibility: `aria-invalid`, `aria-describedby`
 * - แสดงสถานะเส้นขอบสีแดงเมื่อมี Error
 */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, id: customId, className = '', ...props }, ref) => {
    // สร้างรหัสอ้างอิงอัตโนมัติสำหรับจับคู่ label และข้อความ error
    const reactId = useId();
    const id = customId || reactId;
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {/* ป้ายชื่อช่องกรอก */}
        {label && (
          <label htmlFor={id} className="text-caption font-semibold text-ink">
            {label}
          </label>
        )}
        {/* ช่องกรอกข้อความหลัก */}
        <input
          ref={ref}
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={[
            'h-11 w-full rounded-control border bg-surface px-3.5 text-body text-ink placeholder:text-muted',
            'transition-colors shadow-sm focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand',
            error ? 'border-danger-fg' : 'border-line-input hover:border-ink-soft',
            'disabled:bg-surface-muted disabled:opacity-60 disabled:cursor-not-allowed',
            className,
          ].join(' ')}
          {...props}
        />
        {/* ข้อความแสดงข้อผิดพลาด */}
        {error && (
          <span id={errorId} className="text-caption font-medium text-danger-fg">
            {error}
          </span>
        )}
        {/* ข้อความช่วยเหลืออธิบายเพิ่มเติม */}
        {!error && helperText && (
          <span id={helperId} className="text-caption text-muted">
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
