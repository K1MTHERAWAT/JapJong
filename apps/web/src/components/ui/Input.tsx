import React, { useId } from 'react';

/**
 * =====================================================================
 * คอมโพเนนต์ควบคุมฟอร์มมาตรฐาน (Input, Textarea & Select Primitives)
 * =====================================================================
 * คุณสมบัติตามแนวทาง GOV Components Library:
 * - รองรับ label, error message, helperText และเครื่องหมายบังคับกรอก (required)
 * - รองรับข้อความที่มีความยาวแตกต่างกัน (min-w-0, break-words, auto-expanding textarea)
 * - มาตรฐานการเข้าถึง Accessibility: `aria-invalid`, `aria-describedby`
 * - สถานะ Disabled และ Error ใช้สีจาก Design Tokens ส่วนกลาง
 */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
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
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={[
            'h-11 min-h-[44px] w-full min-w-0 rounded-control border bg-surface px-3.5 text-body text-ink placeholder:text-ink-ph',
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
