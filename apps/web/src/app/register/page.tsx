'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-context';
import { Icon } from '@/components/icons';

export default function RegisterPage() {
  const router = useRouter();
  const { registerAccount } = useAuth();
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pdpa, setPdpa] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isRegistrationOpen = process.env.NEXT_PUBLIC_REGISTRATION_OPEN !== 'false';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRegistrationOpen) {
      setError('ปิดรับการลงทะเบียนด้วยตนเองชั่วคราว กรุณาติดต่อเจ้าหน้าที่เพื่อสร้างบัญชี (Walk-in)');
      return;
    }
    if (!name.trim()) {
      setError('กรุณากรอกชื่อ-นามสกุล');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร และประกอบด้วยตัวอักษรและตัวเลข');
      return;
    }
    if (!pdpa) {
      setError('กรุณายินยอมนโยบาย PDPA ก่อนลงทะเบียน');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await registerAccount({
        name: name.trim(),
        department: department.trim() || 'ประชาชนทั่วไป',
        email: email.trim().toLowerCase(),
        password,
      });
      router.push('/');
    } catch (err) {
      setError((err as Error).message || 'การลงทะเบียนไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <form onSubmit={handleSubmit} className="w-full max-w-[440px] jw-card overflow-hidden flex flex-col">
        {/* Top bar */}
        <div className="jw-header text-white h-14 px-4 flex items-center gap-3 font-bold text-[16px]">
          <Link href="/login" className="p-1 -ml-1 rounded-full hover:bg-white/15">
            <Icon name="chevron-left" className="w-5 h-5" />
          </Link>
          <span>ลงทะเบียน</span>
        </div>

        <div className="p-5 flex flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-control bg-surface-muted border border-line-soft flex items-center justify-center shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Jongwen Logo" className="size-full object-contain" />
            </div>
            <div>
              <b className="text-[16px] text-ink">สร้างบัญชีผู้ใช้ใหม่</b>
              <div className="text-[13px] text-ink-mute">ลงทะเบียนสำหรับบุคคลทั่วไป</div>
            </div>
          </div>

          {!isRegistrationOpen && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-[13px] text-amber-900 flex items-start gap-2">
              <Icon name="shield-check" className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <b>ปิดรับการลงทะเบียนด้วยตนเองชั่วคราว</b>
                <p className="text-[12px] text-amber-800 mt-0.5">
                  กรุณาติดต่อเจ้าหน้าที่เพื่อสร้างบัญชีผ่านจุดบริการ (Walk-in)
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="jw-lbl">
              ชื่อ-นามสกุล <span className="text-status-crit">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น สมชาย ใจดี"
              className="jw-in"
              required
            />
          </div>

          <div>
            <label className="jw-lbl">หน่วยงาน / ชุมชน / กลุ่ม</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="ระบุหน่วยงาน ชุมชน หรือกลุ่มของคุณ"
              className="jw-in"
            />
          </div>

          <div>
            <label className="jw-lbl">
              อีเมล <span className="text-status-crit">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="เช่น somchai@example.com"
              className="jw-in"
              required
            />
          </div>

          <div>
            <label className="jw-lbl">
              รหัสผ่าน <span className="text-status-crit">*</span>
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่าน"
                className="jw-in pr-10"
                required
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-mute">
                <Icon name="lock" className="w-4 h-4" />
              </span>
            </div>
            <div className="text-[12px] text-ink-mute mt-1">
              อย่างน้อย 8 ตัวอักษร ประกอบด้วยตัวอักษรและตัวเลข
            </div>
          </div>

          <div
            onClick={() => setPdpa((v) => !v)}
            className="border border-line rounded-2xl p-3 flex items-start gap-2.5 cursor-pointer select-none bg-white"
          >
            <div
              className={`w-[22px] h-[22px] rounded-[6px] border-[1.5px] flex items-center justify-center shrink-0 mt-0.5 ${
                pdpa ? 'bg-brand border-brand text-white' : 'bg-white border-[#7A7A7A]'
              }`}
            >
              {pdpa && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
            </div>
            <div className="text-[13px] text-ink-mute leading-relaxed">
              ยินยอมให้เก็บ ใช้ และเปิดเผยข้อมูลส่วนบุคคลตามนโยบาย PDPA{' '}
              <u className="text-ink font-medium">อ่านประกาศความเป็นส่วนตัว</u>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-3 py-2 text-[13px] text-[#7a1010]">
              {error}
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-line flex gap-2.5">
          <Link href="/login" className="jw-btn-sec flex-1 text-center">
            ยกเลิก
          </Link>
          <button
            type="submit"
            disabled={submitting || !name.trim() || !email.trim() || !password.trim()}
            className="jw-btn flex-[1.5] disabled:opacity-50"
          >
            {submitting ? 'กำลังลงทะเบียน...' : 'ลงทะเบียน'}
          </button>
        </div>
      </form>
    </div>
  );
}
