'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: string;
  subtitle?: string;
  badge?: string;
  icon?: React.ReactNode;
  keywords?: string;
}

export interface SearchableComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = '-- กรุณาเลือกรายการ --',
  searchPlaceholder = 'ค้นหารายการ...',
  emptyText = 'ไม่พบรายการที่ตรงกับคำค้นหา',
  clearable = true,
  disabled = false,
  className = '',
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value) || null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const haystack = `${opt.label} ${opt.subtitle || ''} ${opt.badge || ''} ${opt.keywords || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      setQuery('');
    }
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((prev) => !prev);
          } else if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`w-full min-h-[44px] flex items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl border bg-surface text-left transition select-none ${
          disabled
            ? 'opacity-60 cursor-not-allowed border-line'
            : open
              ? 'border-brand ring-2 ring-brand/15 cursor-pointer'
              : 'border-line hover:border-brand/60 cursor-pointer'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {selected ? (
            <>
              {selected.icon && (
                <span className="w-7 h-7 rounded-lg bg-brand/12 text-brand flex items-center justify-center shrink-0">
                  {selected.icon}
                </span>
              )}
              <span className="text-sm font-semibold text-ink truncate">{selected.label}</span>
              {selected.subtitle && (
                <span className="hidden sm:inline-flex text-xs px-2 py-0.5 rounded-md bg-surface-muted border border-line text-ink-mute shrink-0">
                  {selected.subtitle}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-ink-mute truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {clearable && selected && !disabled && (
            <button
              type="button"
              aria-label="ล้างค่าที่เลือก"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="w-6 h-6 rounded-md flex items-center justify-center text-ink-mute hover:text-ink hover:bg-surface-muted transition cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
          <ChevronDown
            className={`size-4 text-ink-mute transition-transform duration-150 ${
              open ? 'rotate-180 text-brand' : ''
            }`}
          />
        </div>
      </div>

      {/* Dropdown Popover */}
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-40 rounded-2xl border border-line bg-surface shadow-xl overflow-hidden"
        >
          {/* Search Input */}
          <div className="p-2.5 border-b border-line bg-surface">
            <div className="relative">
              <Search className="size-4 text-ink-mute absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-8 py-2 text-sm rounded-xl bg-surface-muted/60 border border-line text-ink placeholder:text-ink-mute focus:outline-none focus:border-brand focus:bg-surface transition"
              />
              {query && (
                <button
                  type="button"
                  aria-label="ล้างคำค้นหา"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
            {filtered.length === 0 ? (
              <div className="py-7 px-3 text-center text-xs text-ink-mute">{emptyText}</div>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-brand/10 text-ink'
                        : 'hover:bg-surface-muted/75 text-ink'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {opt.icon && (
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition ${
                            isSelected
                              ? 'bg-brand text-white'
                              : 'bg-surface-muted border border-line text-ink-mute'
                          }`}
                        >
                          {opt.icon}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink truncate">{opt.label}</div>
                        {opt.subtitle && (
                          <div className="text-xs text-ink-mute truncate mt-0.5">{opt.subtitle}</div>
                        )}
                      </div>
                    </div>

                    {isSelected ? (
                      <Check className="size-4 text-brand shrink-0 stroke-[2.5]" />
                    ) : opt.badge ? (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-surface-muted text-ink-mute shrink-0">
                        {opt.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
