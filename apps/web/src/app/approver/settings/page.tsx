'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { roleHomePath, useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { PinKeypad, SignatureBox, SignOtpVerifier } from '@/components/ui';
import { api } from '@/lib/api';

type StepMode = 'signature' | 'pin' | 'otp';

export default function ApproverSignaturePinSettingsPage() {
  const router = useRouter();
  const { account, refreshMe } = useAuth();
  const [step, setStep] = useState<StepMode>('signature');
  const [signature, setSignature] = useState(account?.signature || '');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (account) {
      setSignature(account.signature || '');
    }
  }, [account]);

  const homeHref = roleHomePath(account?.role);

  const handleSaveSignature = async () => {
    await api.saveSignature(signature);
    await refreshMe();
    setStep('pin');
  };

  const handleSavePin = async (fullPin: string) => {
    setPinError('');
    setSavingPin(true);
    try {
      await api.savePin(fullPin);
      await refreshMe();
      setMessage('บันทึกรหัส PIN 6 หลักสำเร็จ');
      setTimeout(() => {
        setMessage('');
        setStep('otp');
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก PIN';
      setPinError(msg);
      setPin('');
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <AppShell
      title={
        step === 'signature'
          ? 'ขั้นตอนที่ 1: ลายมือชื่อดิจิทัล'
          : step === 'pin'
          ? 'ขั้นตอนที่ 2: รหัส PIN 6 หลัก'
          : 'ขั้นตอนที่ 3: ยืนยันเซสชัน Email OTP'
      }
      backHref={homeHref}
      onBack={
        step === 'otp'
          ? () => setStep('pin')
          : step === 'pin'
          ? () => setStep('signature')
          : undefined
      }
      rightLabel={account?.position || 'นายก'}
      maxWidth="max-w-[600px]"
      footer={
        step === 'signature' ? (
          <button
            type="button"
            disabled={!signature.trim()}
            onClick={handleSaveSignature}
            className="jw-btn w-full"
          >
            บันทึกลายเซ็นประจำตัว · ถัดไปตั้งรหัส PIN 6 หลัก
          </button>
        ) : undefined
      }
    >
      {/* Stepper Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <span
            className={`w-7 h-7 rounded-full text-[12px] font-bold flex items-center justify-center ${
              step === 'signature'
                ? 'bg-brand text-white'
                : 'bg-brand-mint text-brand'
            }`}
          >
            1
          </span>
          <span className="text-[13px] font-medium text-ink">ลายเซ็น</span>
        </div>
        <div className="flex-1 h-[2px] bg-line mx-3" />
        <div className="flex items-center gap-2">
          <span
            className={`w-7 h-7 rounded-full text-[12px] font-bold flex items-center justify-center ${
              step === 'pin'
                ? 'bg-brand text-white'
                : step === 'otp'
                ? 'bg-brand-mint text-brand'
                : 'bg-soft text-ink-mute'
            }`}
          >
            2
          </span>
          <span className="text-[13px] font-medium text-ink">รหัส PIN</span>
        </div>
        <div className="flex-1 h-[2px] bg-line mx-3" />
        <div className="flex items-center gap-2">
          <span
            className={`w-7 h-7 rounded-full text-[12px] font-bold flex items-center justify-center ${
              step === 'otp' ? 'bg-brand text-white' : 'bg-soft text-ink-mute'
            }`}
          >
            3
          </span>
          <span className="text-[13px] font-medium text-ink">Email OTP</span>
        </div>
      </div>

      {step === 'signature' ? (
        <div className="jw-card p-5 flex flex-col gap-4">
          <div>
            <b className="text-[16px] text-ink block">เขียนลายมือชื่อประจำตัวของคุณบนหน้าจอ</b>
            <span className="text-[13px] text-ink-mute">
              ใช้นิ้ว เมาส์ หรือปากกาวาดลายเซ็นจริงบนกรอบด้านล่าง (ไม่อนุญาตให้พิมพ์ตัวอักษร)
            </span>
          </div>

          <SignatureBox
            value={signature}
            onChange={setSignature}
            signerLabel={account ? `${account.name} · ${account.position}` : undefined}
            height={220}
          />
        </div>
      ) : step === 'pin' ? (
        <div className="jw-card p-6 flex flex-col items-center gap-4">
          <PinKeypad
            pin={pin}
            onChange={setPin}
            subtitle={`กำหนดรหัส PIN 6 หลักใหม่ของ ${account?.name || 'ผู้ใช้งาน'} เพื่อใช้ยืนยันการลงนามเอกสารแต่ละฉบับ`}
            onComplete={handleSavePin}
          />

          {pinError && (
            <div className="w-full rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-3.5 py-2 text-[13px] text-[#7a1010] text-center">
              {pinError}
            </div>
          )}

          {message && (
            <div className="w-full rounded-2xl bg-brand-mint text-brand px-4 py-2.5 text-[13px] font-semibold text-center">
              {message}
            </div>
          )}

          {savingPin && (
            <div className="text-[13px] text-brand font-medium animate-pulse">
              กำลังบันทึกรหัส PIN 6 หลัก...
            </div>
          )}

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setStep('signature')}
              className="text-[12.5px] text-ink-mute hover:underline"
            >
              ← ย้อนกลับไปแก้ไขลายเซ็น
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <SignOtpVerifier
            initialEmail={account?.email}
            onVerified={() => {
              setMessage('ยืนยันตัวตนด้วยรหัส OTP ทางอีเมลสำเร็จ! การตั้งค่าครบถ้วน');
              setTimeout(() => router.push(homeHref), 1200);
            }}
          />

          {message && (
            <div className="rounded-2xl bg-brand-mint text-brand px-4 py-2.5 text-[13px] font-semibold text-center">
              {message}
            </div>
          )}

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setStep('pin')}
              className="text-[12.5px] text-ink-mute hover:underline"
            >
              ← ย้อนกลับไปแก้ไขรหัส PIN
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
