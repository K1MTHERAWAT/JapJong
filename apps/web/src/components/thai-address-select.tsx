'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getThaiDistricts,
  getThaiProvinces,
  getThaiSubdistricts,
  sanitizePhoneInput,
  validateThaiPhone,
} from '@japjong/shared';
import { Icon } from './icons';

export interface ThaiAddressValue {
  province: string;
  district: string;
  subdistrict: string;
  provinceId?: string;
  districtId?: string;
  subdistrictId?: string;
  zipCode?: string;
}

interface SearchableDropdownProps {
  label: string;
  required?: boolean;
  value: string;
  placeholder: string;
  disabled?: boolean;
  disabledPlaceholder?: string;
  options: { id: string; label: string; subLabel?: string }[];
  onSelect: (option: { id: string; label: string; subLabel?: string } | null) => void;
  testId?: string;
}

function SearchableDropdown({
  label,
  required = false,
  value,
  placeholder,
  disabled = false,
  disabledPlaceholder,
  options,
  onSelect,
  testId,
}: SearchableDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.subLabel && o.subLabel.toLowerCase().includes(q)) ||
        o.id.toLowerCase().includes(q),
    );
  }, [options, search]);

  return (
    <div ref={containerRef} className="relative">
      <label className="jw-lbl">
        {label}
        {required && <span className="text-[9px] font-semibold leading-none text-status-crit">*</span>}
      </label>
      <button
        type="button"
        disabled={disabled}
        data-testid={testId}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`jw-in flex items-center justify-between gap-1.5 text-left transition ${
          disabled
            ? 'bg-soft/80 text-ink-faint cursor-not-allowed opacity-75'
            : open
            ? 'border-brand ring-2 ring-brand/15 bg-white'
            : 'bg-white hover:border-brand/50'
        }`}
      >
        <span className={`truncate text-[13.5px] ${value ? 'text-ink font-medium' : 'text-ink-faint'}`}>
          {value || (disabled ? disabledPlaceholder || placeholder : placeholder)}
        </span>
        <Icon
          name="chevron-down"
          className={`w-4 h-4 shrink-0 text-ink-mute transition-transform ${open ? 'rotate-180 text-brand' : ''}`}
        />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 min-w-[210px] rounded-2xl border border-line bg-white shadow-xl overflow-hidden animate-in fade-in duration-100">
          <div className="p-2 border-b border-line bg-soft/40">
            <div className="relative flex items-center">
              <Icon name="search" className="w-3.5 h-3.5 text-ink-mute absolute left-2.5 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`พิมพ์ค้นหา${label}...`}
                className="w-full h-8 pl-8 pr-7 rounded-lg border border-line bg-white text-[12.5px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-brand"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 text-ink-faint hover:text-ink text-[11px]"
                >
                  ล้าง
                </button>
              )}
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-line/40">
            {value && (
              <button
                type="button"
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-[12px] text-status-crit hover:bg-red-50 flex items-center justify-between"
              >
                <span>ล้างค่าที่เลือก</span>
                <span>×</span>
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12.5px] text-ink-mute">
                ไม่พบรายการที่ตรงกับ &ldquo;{search}&rdquo;
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.label === value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onSelect(opt);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-[13px] flex items-center justify-between gap-2 transition ${
                      isSelected
                        ? 'bg-brand-mint/70 text-brand-dark font-semibold'
                        : 'text-ink hover:bg-soft/70'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.subLabel ? (
                      <span className="text-[11px] text-ink-faint shrink-0">{opt.subLabel}</span>
                    ) : isSelected ? (
                      <Icon name="check" className="w-3.5 h-3.5 text-brand shrink-0" />
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

interface ThaiAddressFieldsProps {
  province: string;
  district: string;
  subdistrict: string;
  provinceId?: string;
  districtId?: string;
  subdistrictId?: string;
  onChange: (next: ThaiAddressValue) => void;
  required?: boolean;
  /** Render as fragments (3 direct grid children) to slot into an existing parent grid */
  asGridChildren?: boolean;
}

export function ThaiAddressSelect({
  province,
  district,
  subdistrict,
  onChange,
  required = true,
  asGridChildren = true,
}: ThaiAddressFieldsProps) {
  const provinces = useMemo(
    () => getThaiProvinces().map((p) => ({ id: p.id, label: p.nameTh })),
    [],
  );

  const districts = useMemo(
    () =>
      province
        ? getThaiDistricts(province).map((d) => ({
            id: d.id,
            label: d.nameTh,
          }))
        : [],
    [province],
  );

  const subdistricts = useMemo(
    () =>
      province && district
        ? getThaiSubdistricts(province, district).map((s) => ({
            id: s.id,
            label: s.nameTh,
            subLabel: s.zipCode ? `〒${s.zipCode}` : undefined,
          }))
        : [],
    [province, district],
  );

  const selectedProvObj = useMemo(
    () => provinces.find((p) => p.label === province),
    [provinces, province],
  );
  const selectedDistObj = useMemo(
    () => districts.find((d) => d.label === district),
    [districts, district],
  );

  const handleProvinceSelect = (opt: { id: string; label: string } | null) => {
    const nextProvince = opt?.label ?? '';
    if (nextProvince === province) return;
    // เปลี่ยนจังหวัด -> ล้างค่าอำเภอและตำบลอัตโนมัติ
    onChange({
      province: nextProvince,
      provinceId: opt?.id,
      district: '',
      districtId: undefined,
      subdistrict: '',
      subdistrictId: undefined,
      zipCode: undefined,
    });
  };

  const handleDistrictSelect = (opt: { id: string; label: string } | null) => {
    const nextDistrict = opt?.label ?? '';
    if (nextDistrict === district) return;
    // เปลี่ยนอำเภอ -> ล้างค่าตำบลอัตโนมัติ
    onChange({
      province,
      provinceId: selectedProvObj?.id,
      district: nextDistrict,
      districtId: opt?.id,
      subdistrict: '',
      subdistrictId: undefined,
      zipCode: undefined,
    });
  };

  const handleSubdistrictSelect = (opt: { id: string; label: string; subLabel?: string } | null) => {
    const nextSubdistrict = opt?.label ?? '';
    onChange({
      province,
      provinceId: selectedProvObj?.id,
      district,
      districtId: selectedDistObj?.id,
      subdistrict: nextSubdistrict,
      subdistrictId: opt?.id,
      zipCode: opt?.subLabel?.replace('〒', ''),
    });
  };

  const content = (
    <>
      <div>
        <SearchableDropdown
          label="จังหวัด"
          required={required}
          value={province}
          placeholder="เลือกจังหวัด"
          options={provinces}
          onSelect={handleProvinceSelect}
          testId="select-province"
        />
      </div>
      <div>
        <SearchableDropdown
          label="อำเภอ / เขต"
          required={required}
          value={district}
          placeholder="เลือกอำเภอ / เขต"
          disabled={!province}
          disabledPlaceholder="เลือกจังหวัดก่อน"
          options={districts}
          onSelect={handleDistrictSelect}
          testId="select-district"
        />
      </div>
      <div>
        <SearchableDropdown
          label="ตำบล / แขวง"
          required={required}
          value={subdistrict}
          placeholder="เลือกตำบล / แขวง"
          disabled={!province || !district}
          disabledPlaceholder="เลือกอำเภอก่อน"
          options={subdistricts}
          onSelect={handleSubdistrictSelect}
          testId="select-subdistrict"
        />
      </div>
    </>
  );

  if (asGridChildren) {
    return content;
  }

  return <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">{content}</div>;
}

interface Phone10DigitInputProps {
  value: string;
  onChange: (cleanValue: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

export function Phone10DigitInput({
  value,
  onChange,
  label = 'เบอร์โทรศัพท์ติดต่อ',
  required = true,
  placeholder = 'เช่น 0812345678 (ตัวเลข 10 หลัก)',
  className = '',
}: Phone10DigitInputProps) {
  const [touched, setTouched] = useState(false);
  const cleanValue = sanitizePhoneInput(value, 10);
  const check = validateThaiPhone(cleanValue);
  const showError = touched && cleanValue.length > 0 && !check.valid;

  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <label className="jw-lbl">
          {label}
          {required && <span className="text-[9px] font-semibold leading-none text-status-crit">*</span>}
        </label>
        <span
          className={`text-[11px] font-medium ${
            cleanValue.length === 10
              ? 'text-brand'
              : showError
              ? 'text-status-crit'
              : 'text-ink-faint'
          }`}
        >
          {cleanValue.length}/10 หลัก
        </span>
      </div>
      <input
        type="tel"
        inputMode="numeric"
        pattern="[0-9]{10}"
        maxLength={10}
        value={cleanValue}
        onBlur={() => setTouched(true)}
        onChange={(e) => {
          const digits = sanitizePhoneInput(e.target.value, 10);
          onChange(digits);
        }}
        className={`jw-in font-mono tracking-wide ${
          showError ? 'border-status-crit focus:border-status-crit' : ''
        }`}
        placeholder={placeholder}
        required={required}
      />
      {showError && (
        <p className="mt-1 text-[11.5px] font-medium text-status-crit">{check.error}</p>
      )}
    </div>
  );
}

