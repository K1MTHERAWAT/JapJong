'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * =====================================================================
 * หน้าต่างโมดอลมาตรฐาน (Modal / Dialog Component Primitive)
 * =====================================================================
 * คุณสมบัติตามแนวทาง GOV Components Library:
 * - รองรับขนาดมาตรฐาน: sm (420px), md (520px), lg (680px), xl (920px)
 * - ปิดหน้าต่างได้ด้วยการกดแป้น Escape หรือคลิกพื้นที่ฉากหลัง
 * - โครงสร้าง Header, Body (Scrollable), และ Footer ที่เป็นระเบียบ
 */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const MODAL_SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-[420px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[680px]',
  xl: 'max-w-[920px]',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: ModalSize;
  footer?: React.ReactNode;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  footer,
  children,
  closeOnBackdrop = true,
  className = '',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="jw-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={() => closeOnBackdrop && onClose()}
    >
      <div
        className={`jw-modal-panel ${MODAL_SIZE_CLASS[size]} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-line">
            <div className="min-w-0">
              {title && <h3 className="text-heading font-bold text-ink leading-snug">{title}</h3>}
              {subtitle && <p className="text-caption text-ink-mute mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่าง"
              className="size-8 rounded-control grid place-items-center text-ink-mute hover:bg-hover hover:text-ink transition-colors shrink-0 cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        <div className="min-w-0 flex-1 text-body text-ink-soft">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-line">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
