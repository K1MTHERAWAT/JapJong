'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, formatThaiDateTime } from '@/lib/api';
import { Icon } from './icons';

interface SignOtpVerifierProps {
  /** เรียกเมื่อการยืนยันตัวตนสำเร็จ */
  onVerified?: (expiresAt?: string) => void;
  /** แสดงกล่องสถานะแบบกะทัดรัด (สำหรับแทรกในหน้าลงนาม) */
  compact?: boolean;
  /** ปิดการแสดงผลอัตโนมัติเมื่อ verified แล้ว */
  autoHideWhenVerified?: boolean;
  /** อีเมลของบัญชีผู้ใช้งาน */
  initialEmail?: string;
}

export function SignOtpVerifier({
  onVerified,
  compact = false,
  autoHideWhenVerified = false,
  initialEmail,
}: SignOtpVerifierProps) {
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string>('');
  const [targetEmail, setTargetEmail] = useState<string>(initialEmail || '');

  // OTP Request State
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);

  // 6-digit OTP Inputs
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ตรวจสอบสถานะ Signing Session ปัจจุบัน
  const checkStatus = useCallback(async () => {
    try {
      const res = await api.getSignSessionStatus();
      setIsVerified(res.isVerified);
      if (res.expiresAt) setExpiresAt(res.expiresAt);
      if (res.maskedEmail) setMaskedEmail(res.maskedEmail);
      if (res.email && !targetEmail) setTargetEmail(res.email);
      if (res.isVerified && onVerified) {
        onVerified(res.expiresAt);
      }
    } catch {
      setIsVerified(false);
    }
  }, [onVerified, targetEmail]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Cooldown timer (60s)
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // ขอรหัส OTP ใหม่
  const handleRequestOtp = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.requestSignOtp(targetEmail || undefined);
      setOtpSent(true);
      setMaskedEmail(res.maskedEmail);
      setCooldown(res.resendCooldownSeconds || 60);
      setSuccessMsg(`ระบบได้จัดส่งรหัส OTP 6 หลักไปยัง ${res.maskedEmail} แล้ว`);
      if (res.demoOtp) {
        setDemoOtp(res.demoOtp);
      }
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถขอรหัส OTP ได้';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ยืนยันรหัส OTP
  const handleVerify = async (fullCode?: string) => {
    const code = fullCode || digits.join('');
    if (code.length !== 6) {
      setError('กรุณากรอกรหัส OTP ให้ครบทั้ง 6 หลัก');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.verifySignOtp(code);
      setIsVerified(true);
      setExpiresAt(res.expiresAt);
      setSuccessMsg(res.message || 'ยืนยันตัวตนสำเร็จ');
      if (onVerified) onVerified(res.expiresAt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'รหัส OTP ไม่ถูกต้อง';
      setError(msg);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // จัดการการพิมพ์ในกล่อง 6 ช่อง
  const handleDigitChange = (index: number, val: string) => {
    const cleanVal = val.replace(/\D/g, '');
    if (!cleanVal) {
      const copy = [...digits];
      copy[index] = '';
      setDigits(copy);
      return;
    }

    // กรณี Paste ข้อความหลายหลัก
    if (cleanVal.length > 1) {
      const chars = cleanVal.slice(0, 6).split('');
      const copy = [...digits];
      chars.forEach((c, i) => {
        if (index + i < 6) copy[index + i] = c;
      });
      setDigits(copy);
      const nextIdx = Math.min(5, index + chars.length);
      inputRefs.current[nextIdx]?.focus();
      if (copy.every((d) => d !== '')) {
        handleVerify(copy.join(''));
      }
      return;
    }

    const copy = [...digits];
    copy[index] = cleanVal;
    setDigits(copy);

    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else {
      if (copy.every((d) => d !== '')) {
        handleVerify(copy.join(''));
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // เพิกถอนเซสชันยืนยันการลงนาม
  const handleRevoke = async () => {
    if (!confirm('คุณต้องการยกเลิกเซสชันการลงนามนี้หรือไม่? (หลังจากยกเลิกจะต้องขอ OTP ใหม่เมื่อต้องการลงนาม)')) {
      return;
    }
    setLoading(true);
    try {
      await api.revokeSignSession();
      setIsVerified(false);
      setExpiresAt(null);
      setOtpSent(false);
      setDigits(['', '', '', '', '', '']);
      setSuccessMsg('ยกเลิกเซสชันยืนยันการลงนามเรียบร้อยแล้ว');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถยกเลิกเซสชันได้';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (isVerified === null) {
    return (
      <div className="jw-card p-4 flex items-center justify-center text-[13px] text-ink-mute">
        กำลังตรวจสอบสถานะเซสชันการลงนาม...
      </div>
    );
  }

  // กรณีเซสชันยืนยันตัวตนแล้ว (Verified Active Session)
  if (isVerified) {
    if (autoHideWhenVerified) return null;
    return (
      <div className="jw-card p-4 bg-brand-mint border border-brand/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-ink">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center shrink-0">
            <Icon name="check" className="w-5 h-5" strokeWidth={3} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-[14px] text-brand-ink flex items-center gap-1.5">
              ยืนยันตัวตนด้วยรหัส OTP ทางอีเมลเรียบร้อยแล้ว
            </span>
            <span className="text-[12px] text-ink-mute">
              เซสชันการลงนามพร้อมใช้งานตลอดเซสชันนี้
              {expiresAt && ` (มีผลถึง ${formatThaiDateTime(expiresAt, true)})`} · ไม่ต้องกรอก OTP ซ้ำในแต่ละเอกสาร
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRevoke}
          disabled={loading}
          className="text-[12px] text-status-crit hover:underline self-end sm:self-center shrink-0"
        >
          ยกเลิกเซสชันลงนาม
        </button>
      </div>
    );
  }

  // กรณียังไม่ได้ยืนยันตัวตน (Not Verified)
  return (
    <div className={`jw-card ${compact ? 'p-4' : 'p-6'} flex flex-col gap-4 border-[#CBD5E1] bg-white`}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-tint text-brand-ink flex items-center justify-center shrink-0">
            <Icon name="shield-check" className="w-4 h-4" />
          </div>
          <b className="text-[15px] text-ink">ยืนยันตัวตนด้วยรหัส OTP ทางอีเมล (Resend)</b>
        </div>
        <p className="text-[12.5px] text-ink-mute leading-relaxed pl-9">
          ระบบความปลอดภัย 2 ขั้นตอน (2FA) แทนรหัส PIN เดิม ยืนยันเพียงครั้งเดียวสามารถลงนามเอกสารในคิวได้ต่อเนื่องตลอดเซสชัน
        </p>
      </div>

      {/* อีเมลปลายทาง */}
      <div className="rounded-xl bg-canvas border border-line p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-ink-mute">อีเมลสำหรับรับ OTP:</span>
          <span className="font-semibold text-ink font-mono">
            {maskedEmail || targetEmail || 'ยังไม่ได้ระบุอีเมล'}
          </span>
        </div>

        <button
          type="button"
          disabled={cooldown > 0 || loading}
          onClick={handleRequestOtp}
          className="jw-btn-sec jw-btn-sm shrink-0 flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {loading ? (
            'กำลังส่ง...'
          ) : cooldown > 0 ? (
            `ขอรหัสใหม่ได้ใน ${cooldown} วิ`
          ) : otpSent ? (
            'ส่งรหัส OTP ใหม่อีกครั้ง'
          ) : (
            'ส่งรหัส OTP ไปที่อีเมล'
          )}
        </button>
      </div>

      {/* กล่องใส่ OTP 6 หลัก */}
      {otpSent && (
        <div className="flex flex-col items-center gap-3 pt-2">
          <label className="text-[13px] font-medium text-ink text-center">
            กรอกรหัสยืนยัน 6 หลักที่ส่งไปยังอีเมลของคุณ
          </label>

          <div className="flex items-center gap-2 sm:gap-2.5">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-10 h-12 sm:w-12 sm:h-14 text-center text-[22px] font-bold font-mono rounded-xl border-2 border-line focus:border-brand focus:ring-2 focus:ring-brand-tint outline-none transition bg-white"
              />
            ))}
          </div>

          <div className="flex items-center gap-2 text-[12px] text-ink-mute">
            <span>⏱️ รหัสมีอายุ 5 นาที</span>
            <span>·</span>
            <span>จำกัดกรอกผิดไม่เกิน 5 ครั้ง</span>
          </div>

          {/* Demo OTP Helper (ช่วยทดสอบในโหมดเดโม) */}
          {demoOtp && (
            <div className="mt-1 flex items-center gap-2 bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] px-3 py-1.5 rounded-lg text-[12px]">
              <span>💡 โหมดทดสอบ (Demo/Dev): รหัสคือ <b>{demoOtp}</b></span>
              <button
                type="button"
                onClick={() => {
                  const arr = demoOtp.split('');
                  setDigits(arr);
                  handleVerify(demoOtp);
                }}
                className="font-semibold underline ml-1 hover:text-ink"
              >
                กดเพื่อกรอกทันที
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={digits.some((d) => !d) || loading}
            onClick={() => handleVerify()}
            className="jw-btn w-full sm:w-64 mt-2 disabled:opacity-40"
          >
            {loading ? 'กำลังตรวจสอบ...' : 'ยืนยันรหัส OTP และเปิดเซสชันลงนาม'}
          </button>
        </div>
      )}

      {/* ข้อความแจ้งเตือน / Error */}
      {error && (
        <div className="rounded-xl bg-[#FDE8E8] border border-[#F9B4B4] p-3 text-[13px] text-[#7A1010] flex items-center gap-2">
          <Icon name="x" className="w-4 h-4 shrink-0 text-status-crit" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && !error && (
        <div className="rounded-xl bg-brand-mint border border-brand/30 p-3 text-[13px] text-brand-ink flex items-center gap-2">
          <Icon name="check" className="w-4 h-4 shrink-0 text-brand" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  );
}
