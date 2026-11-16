'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { decodeUploadedQrImageFile } from '@/lib/qr-scanner-engine';

/**
 * หน้าตรวจสอบเอกสารสาธารณะ (/verify)
 * รองรับการวางลิงก์ที่สแกนได้จากแอปสแกน QR Code ทั่วไป, กรอกรหัสยืนยัน, เลขที่เอกสาร หรืออัปโหลดรูปภาพ QR Code
 */
export default function VerifyIndexPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [decoding, setDecoding] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const extractTokenOrCode = (raw: string): string => {
    const cleaned = raw.trim();
    const match = /\/verify\/([a-zA-Z0-9_-]+)/.exec(cleaned);
    if (match) return match[1];
    return cleaned;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = extractTokenOrCode(query);
    if (!token) {
      setErrorMsg('กรุณากรอกรหัสยืนยัน เลขที่เอกสาร หรือวางลิงก์จาก QR Code');
      return;
    }
    setErrorMsg('');
    router.push(`/verify/${encodeURIComponent(token)}`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setDecoding(true);
    try {
      const decoded = await decodeUploadedQrImageFile(file);
      if (!decoded) {
        setErrorMsg('ไม่พบ QR Code ในรูปภาพนี้ กรุณาลองใช้ภาพที่คมชัดขึ้น');
        return;
      }
      const token = extractTokenOrCode(decoded);
      router.push(`/verify/${encodeURIComponent(token)}`);
    } catch {
      setErrorMsg('ไม่สามารถอ่านรูปภาพ QR Code ได้');
    } finally {
      setDecoding(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <AppShell
      title="ตรวจสอบเอกสารทางราชการ"
      backHref="/"
      maxWidth="max-w-[680px]"
    >
      <div className="flex flex-col gap-5">
        <div className="jw-card p-6 sm:p-8 flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-2xl bg-brand-mint text-brand flex items-center justify-center mb-1">
            <Icon name="shield-check" className="w-7 h-7" />
          </div>
          <h2 className="text-[19px] sm:text-[21px] font-bold text-ink">
            ตรวจสอบความถูกต้องของเอกสาร
          </h2>
          <p className="text-[13.5px] text-ink-mute max-w-md leading-relaxed">
            สามารถใช้กล้องมือถือหรือแอปสแกน QR Code ทั่วไปสแกนบนเอกสารได้โดยตรง
            หรือวางลิงก์ / รหัสยืนยัน / เลขที่เอกสารด้านล่าง
          </p>
        </div>

        <form onSubmit={handleSubmit} className="jw-card p-5 sm:p-6 flex flex-col gap-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
              <Icon name="alert-triangle" className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label htmlFor="verify-query" className="jw-lbl">
              ลิงก์จาก QR Code, รหัสยืนยัน หรือเลขที่เอกสาร
            </label>
            <input
              id="verify-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="เช่น https://.../verify/abc123 หรือ BK-2026-0001"
              className="jw-in"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              disabled={decoding}
              onClick={() => fileInputRef.current?.click()}
              className="jw-btn-sec flex-1"
            >
              {decoding ? 'กำลังอ่านภาพ QR...' : 'อัปโหลดรูปภาพ QR Code'}
            </button>
            <button type="submit" className="jw-btn flex-[1.5]">
              ตรวจสอบเอกสาร
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </form>

        <div className="text-center">
          <Link href="/" className="text-sm font-semibold text-brand hover:underline">
            กลับสู่หน้าหลักระบบ
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
