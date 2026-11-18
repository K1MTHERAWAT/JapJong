import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { clampNameInput, formatNameCounter, isNameAtLimit } from '@japjong/shared';

/**
 * =====================================================================
 * คอมโพเนนต์ควบคุมฟอร์มมาตรฐาน (Input, Textarea & Select Primitives)
 * =====================================================================
 * คุณสมบัติตามแนวทาง GOV Components Library:
 * - รองรับ label, error message, helperText และเครื่องหมายบังคับกรอก (required)
 * - รองรับการจำกัดความยาวชื่อ (maxLength) พร้อมตัวนับจำนวนตัวอักษร (เช่น 25/100) และข้อความแจ้งเตือนเมื่อครบขีดจำกัด
 * - รองรับข้อความที่มีความยาวแตกต่างกัน (min-w-0, break-words, auto-expanding textarea)
 * - มาตรฐานการเข้าถึง Accessibility: `aria-invalid`, `aria-describedby`
 * - สถานะ Disabled และ Error ใช้สีจาก Design Tokens ส่วนกลาง
 */

export interface NameLengthBadgeProps {
  value: string | number | readonly string[] | undefined | null;
  maxLength: number;
  className?: string;
}

/**
 * ป้ายแสดงตัวนับจำนวนตัวอักษร เช่น 25/100
 */
export function NameLengthBadge({ value, maxLength, className = '' }: NameLengthBadgeProps) {
  const str = value == null ? '' : String(value);
  const atLimit = isNameAtLimit(str, maxLength);
  return (
    <span
      data-testid="char-counter"
      className={[
        'text-[11.5px] font-mono tabular-nums shrink-0 transition-colors',
        atLimit ? 'text-warn-fg font-bold' : 'text-ink-mute',
        className,
      ].join(' ')}
    >
      {formatNameCounter(str, maxLength)}
    </span>
  );
}

export interface NameLimitWarningProps {
  value: string | number | readonly string[] | undefined | null;
  maxLength: number;
  className?: string;
}

/**
 * ข้อความแจ้งเตือนเมื่อกรอกตัวอักษรถึงขีดจำกัดสูงสุดที่กำหนด
 */
export function NameLimitWarning({ value, maxLength, className = '' }: NameLimitWarningProps) {
  const str = value == null ? '' : String(value);
  if (!isNameAtLimit(str, maxLength)) return null;
  const currentLen = Math.min(str.length, maxLength);
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="char-limit-warning"
      className={[
        'text-[11.5px] font-medium text-warn-fg flex items-center gap-1 mt-1 leading-snug break-words',
        className,
      ].join(' ')}
    >
      <span>ถึงขีดจำกัดความยาวสูงสุดแล้ว ({currentLen}/{maxLength} ตัวอักษร)</span>
    </span>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  /** แสดงตัวนับจำนวนตัวอักษร (เช่น 25/100) เมื่อระบุ maxLength (ค่าเริ่มต้น: true เมื่อมี maxLength) */
  showCount?: boolean;
  /** แสดงปุ่มสลับการแสดง/ซ่อนรหัสผ่านเมื่อ type="password" */
  showPasswordToggle?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      id: customId,
      required,
      maxLength,
      showCount,
      showPasswordToggle,
      type,
      value,
      onChange,
      className = '',
      ...props
    },
    ref,
  ) => {
    const reactId = useId();
    const id = customId || reactId;
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;
    const limitId = `${id}-limit`;
    const [passwordVisible, setPasswordVisible] = useState(false);
    const canTogglePassword = type === 'password' && Boolean(showPasswordToggle);
    const resolvedType = canTogglePassword && passwordVisible ? 'text' : type;

    const hasMaxLength = typeof maxLength === 'number' && maxLength > 0;
    const shouldShowCount = showCount ?? hasMaxLength;
    const strValue = value == null ? '' : String(value);
    const atLimit = hasMaxLength && isNameAtLimit(strValue, maxLength);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (hasMaxLength && e.target.value.length > maxLength) {
        e.target.value = clampNameInput(e.target.value, maxLength);
      }
      onChange?.(e);
    };

    const describedBy = [
      error ? errorId : undefined,
      !error && helperText ? helperId : undefined,
      !error && atLimit ? limitId : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1.5 w-full min-w-0">
        {(label || (shouldShowCount && hasMaxLength)) && (
          <div className="flex items-center justify-between gap-2 min-w-0">
            {label ? (
              <label htmlFor={id} className="jw-lbl mb-0 min-w-0 break-words">
                {label}
                {required && <span className="ml-1 text-danger-fg font-bold">*</span>}
              </label>
            ) : (
              <span />
            )}
            {shouldShowCount && hasMaxLength && (
              <NameLengthBadge value={strValue} maxLength={maxLength} />
            )}
          </div>
        )}
        <div className="relative w-full min-w-0">
          <input
            ref={ref}
            id={id}
            type={resolvedType}
            required={required}
            maxLength={maxLength}
            value={value}
            onChange={handleChange}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={[
              'h-11 min-h-[44px] w-full min-w-0 rounded-control border bg-surface px-3.5 text-body text-ink placeholder:text-ink-ph',
              canTogglePassword ? 'pr-11' : '',
              'transition-colors focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20',
              error
                ? 'border-danger-fg focus:border-danger-fg focus:ring-danger-fg/20'
                : atLimit
                  ? 'border-warn-fg focus:border-warn-fg focus:ring-warn-fg/20'
                  : 'border-line-input hover:border-ink-mute',
              'disabled:bg-disabled-bg disabled:text-disabled-fg disabled:border-disabled-border disabled:cursor-not-allowed',
              className,
            ].join(' ')}
            {...props}
          />
          {canTogglePassword && (
            <button
              type="button"
              onClick={() => setPasswordVisible((v) => !v)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-ink-mute hover:text-brand transition cursor-pointer"
              aria-label={passwordVisible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            >
              {passwordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        {error && (
          <span id={errorId} className="text-caption font-medium text-danger-fg break-words">
            {error}
          </span>
        )}
        {!error && atLimit && hasMaxLength && (
          <span id={limitId}>
            <NameLimitWarning value={strValue} maxLength={maxLength} className="mt-0" />
          </span>
        )}
        {!error && helperText && (
          <span id={helperId} className="text-caption text-ink-mute break-words">
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, id: customId, required, className = '', ...props }, ref) => {
    const reactId = useId();
    const id = customId || reactId;
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;

    return (
      <div className="flex flex-col gap-1.5 w-full min-w-0">
        {label && (
          <label htmlFor={id} className="jw-lbl mb-0">
            {label}
            {required && <span className="ml-1 text-danger-fg font-bold">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={[
            'min-h-[96px] w-full min-w-0 rounded-control border bg-surface px-3.5 py-2.5 text-body text-ink placeholder:text-ink-ph leading-relaxed resize-y break-words',
            'transition-colors focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20',
            error ? 'border-danger-fg focus:border-danger-fg focus:ring-danger-fg/20' : 'border-line-input hover:border-ink-mute',
            'disabled:bg-disabled-bg disabled:text-disabled-fg disabled:border-disabled-border disabled:cursor-not-allowed',
            className,
          ].join(' ')}
          {...props}
        />
        {error && (
          <span id={errorId} className="text-caption font-medium text-danger-fg break-words">
            {error}
          </span>
        )}
        {!error && helperText && (
          <span id={helperId} className="text-caption text-ink-mute break-words">
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, id: customId, required, className = '', children, ...props }, ref) => {
    const reactId = useId();
    const id = customId || reactId;
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;

    return (
      <div className="flex flex-col gap-1.5 w-full min-w-0">
        {label && (
          <label htmlFor={id} className="jw-lbl mb-0">
            {label}
            {required && <span className="ml-1 text-danger-fg font-bold">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={[
            'jw-select',
            error ? 'border-danger-fg focus:border-danger-fg focus:ring-danger-fg/20' : 'border-line-input hover:border-ink-mute',
            className,
          ].join(' ')}
          {...props}
        >
          {children}
        </select>
        {error && (
          <span id={errorId} className="text-caption font-medium text-danger-fg break-words">
            {error}
          </span>
        )}
        {!error && helperText && (
          <span id={helperId} className="text-caption text-ink-mute break-words">
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
