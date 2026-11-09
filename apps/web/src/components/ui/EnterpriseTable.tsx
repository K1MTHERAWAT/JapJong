'use client';

import React, { useEffect } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';

/* ============================================================================
 * 1. PageHeader — Standardized Enterprise Page Header
 * ============================================================================ */
export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 ${className}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[20px] sm:text-[22px] leading-tight font-bold text-ink tracking-tight">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-[13.5px] text-ink-mute mt-1 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ============================================================================
 * 2. SearchInput — Standardized Search Input with Clear Button
 * ============================================================================ */
export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'ค้นหารายการ...',
  className = '',
}: SearchInputProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="size-4 text-ink-mute absolute left-3 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-line-input bg-surface pl-9 pr-8 text-[13.5px] text-ink placeholder:text-ink-ph focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="ล้างคำค้นหา"
          className="absolute right-2.5 text-ink-mute hover:text-ink p-0.5 rounded"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/* ============================================================================
 * 3. FilterToolbar — Unified Horizontal Toolbar for Data Tables
 * ============================================================================ */
export interface FilterToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function FilterToolbar({ left, right, children, className = '' }: FilterToolbarProps) {
  return (
    <div
      className={`rounded-xl border border-line bg-surface p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs ${className}`}
    >
      {children ? (
        children
      ) : (
        <>
          {left && <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{left}</div>}
          {right && <div className="flex flex-wrap items-center gap-2 shrink-0">{right}</div>}
        </>
      )}
    </div>
  );
}

/* ============================================================================
 * 4. Pagination — Clean Table Footer Pagination
 * ============================================================================ */
export interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize && page === 1) return null;

  const startIdx = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, page * pageSize);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 border-t border-line bg-surface-muted/50 text-[12.5px] text-ink-mute">
      <div>
        แสดง <b className="text-ink font-semibold">{startIdx}</b>–
        <b className="text-ink font-semibold">{endIdx}</b> จากทั้งหมด{' '}
        <b className="text-ink font-semibold">{totalItems}</b> รายการ
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-line bg-surface text-ink-soft hover:bg-hover disabled:opacity-40 disabled:pointer-events-none transition"
        >
          <ChevronLeft className="size-3.5" />
          <span>ก่อนหน้า</span>
        </button>
        <span className="px-2 font-medium text-ink">
          หน้า {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-line bg-surface text-ink-soft hover:bg-hover disabled:opacity-40 disabled:pointer-events-none transition"
        >
          <span>ถัดไป</span>
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 * 5. DetailDrawer — Side Drawer on Desktop, Full/Sheet Dialog on Mobile
 * ============================================================================ */
export interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  widthClass?: string;
}

export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  footer,
  children,
  widthClass = 'max-w-[620px]',
}: DetailDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${widthClass} bg-surface h-dvh shadow-pop border-l border-line flex flex-col overflow-hidden`}
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-line bg-surface flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-bold text-ink leading-snug">{title}</h2>
              {badge}
            </div>
            {subtitle && <p className="text-[12.5px] text-ink-mute mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างรายละเอียด"
            className="grid size-8 place-items-center rounded-lg border border-line text-ink-mute hover:bg-hover hover:text-ink transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">{children}</div>

        {/* Drawer Footer */}
        {footer && (
          <div className="px-5 py-3.5 border-t border-line bg-surface-muted/60 flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * 6. SortableHeader — Helper for Table Column Headers
 * ============================================================================ */
export function SortableHeader({
  label,
  active,
  direction,
  onClick,
  align = 'left',
}: {
  label: string;
  active?: boolean;
  direction?: 'asc' | 'desc';
  onClick?: () => void;
  align?: 'left' | 'center' | 'right';
}) {
  if (!onClick) {
    return <span>{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-semibold hover:text-ink transition-colors ${
        align === 'right' ? 'ml-auto' : align === 'center' ? 'mx-auto' : ''
      } ${active ? 'text-brand-ink' : 'text-ink-soft'}`}
    >
      <span>{label}</span>
      {active ? (
        direction === 'asc' ? (
          <ArrowUp className="size-3.5 text-brand" />
        ) : (
          <ArrowDown className="size-3.5 text-brand" />
        )
      ) : (
        <ArrowUpDown className="size-3 text-ink-ph" />
      )}
    </button>
  );
}
