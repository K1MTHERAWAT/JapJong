'use client';

/**
 * =====================================================================
 * หน้าตั้งค่าลายมือชื่อและรหัส PIN ผู้อนุมัติ (Approver Signature & PIN Settings Page)
 * =====================================================================
 * ระบบเตรียมความพร้อมการลงนามดิจิทัล 3 ขั้นตอน (3-Step Setup Wizard):
 * 1. วาดบันทึกลายมือชื่อดิจิทัลประจำตัว (SignatureBox)
 * 2. กำหนดรหัสผ่านลับ PIN 6 หลักสำหรับกดยืนยันการอนุมัติ (PinKeypad)
 * 3. ยืนยันเปิดใช้งานเซสชันด้วยรหัสผ่านใช้ครั้งเดียวทางอีเมล (Email OTP Verifier)
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { roleHomePath, useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { PinKeypad, SignatureBox, SignOtpVerifier } from '@/components/ui';
import { api } from '@/lib/api';

// ชนิดสเต็ปในกระบวนการตั้งค่า
type StepMode = 'signature' | 'pin' | 'otp';

export default function ApproverSignaturePinSettingsPage() {
  const router = useRouter();
  // ดึงข้อมูลบัญชีผู้ใช้ปัจจุบัน และฟังก์ชันรีเฟรชข้อมูลโปรไฟล์
  const { account, refreshMe } = useAuth();

  // State สเต็ปปัจจุบันของวิซาร์ด
  const [step, setStep] = useState<StepMode>('signature');
  // State ข้อมูลภาพลายเซ็น (Base64 data URL)
  const [signature, setSignature] = useState(account?.signature || '');
  // State รหัส PIN 6 หลักที่กำลังกรอก
  const [pin, setPin] = useState('');
  // State ข้อความแจ้งเตือนข้อผิดพลาดของ PIN
  const [pinError, setPinError] = useState('');
  // State กำลังบันทึก PIN
  const [savingPin, setSavingPin] = useState(false);
  // State ข้อความแจ้งเตือนผลสำเร็จ
  const [message, setMessage] = useState('');

  // ซิงค์ลายเซ็นเดิมที่มีอยู่ในระบบมาแสดงเมื่อเข้าหน้า
  useEffect(() => {
    if (account) {
      setSignature(account.signature || '');
    }
  }, [account]);

  // คำนวณเส้นทางกลับหน้าหลักตามบทบาท
  const homeHref = roleHomePath(account?.role);

  // ฟังก์ชันบันทึกลายเซ็นและไปสเต็ปถัดไป (ตั้ง PIN)
  const handleSaveSignature = async () => {
    await api.saveSignature(signature);
    await refreshMe();
    setStep('pin');
  };

  // ฟังก์ชันบันทึกรหัส PIN 6 หลัก
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
      {/* แถบลำดับขั้นตอน (Stepper Header 1-2-3) */}
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

      {/* สเต็ปที่ 1: วาดลายเซ็นดิจิทัล */}
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
        /* สเต็ปที่ 2: ตั้งค่ารหัส PIN 6 หลัก */
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
        /* สเต็ปที่ 3: ตรวจสอบยืนยันเซสชันผ่าน OTP */
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
