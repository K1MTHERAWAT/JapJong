'use client'; // กำหนดให้คอมโพเนนต์นี้ทำงานในฝั่ง Client (React Client Component)

// นำเข้าโมดูลและฟังก์ชันพื้นฐานจาก React
import React, { useState } from 'react';
// นำเข้า Link สำหรับการเปลี่ยนหน้า
import Link from 'next/link';
// นำเข้า useRouter hook สำหรับสั่งเปลี่ยน URL เมื่อลงทะเบียนสำเร็จ
import { useRouter } from 'next/navigation';
// นำเข้า useAuth hook สำหรับเรียกฟังก์ชัน registerAccount
import { useAuth } from '@/components/auth-context';
// นำเข้า Icon แสดงรูปไอคอน SVG
import { Icon } from '@/components/icons';
import { Eye, EyeOff } from 'lucide-react';
import {
  NAME_MAX_LENGTH,
  clampNameInput,
  getPasswordRuleChecks,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@japjong/shared';
import { NameLengthBadge, NameLimitWarning } from '@/components/ui';

/**
 * หน้าลงทะเบียนผู้ใช้งานทั่วไป (Register Page)
 * รองรับการกรอกข้อมูลชื่อ-นามสกุล, สังกัด/ชุมชน, อีเมล, รหัสผ่าน, และการยอมรับข้อตกลง PDPA
 */
export default function RegisterPage() {
  const router = useRouter();
  // ดึงฟังก์ชันสมัครสมาชิกจาก Auth Context
  const { registerAccount } = useAuth();

  // State ฟอร์มลงทะเบียน
  const [name, setName] = useState(''); // ชื่อ-นามสกุล
  const [username, setUsername] = useState(''); // ชื่อผู้ใช้ (Username)
  const [department, setDepartment] = useState(''); // หน่วยงาน / ชุมชน / สังกัด
  const [email, setEmail] = useState(''); // อีเมล / Gmail
  const [password, setPassword] = useState(''); // รหัสผ่าน
  const [showPassword, setShowPassword] = useState(false); // แสดง/ซ่อนรหัสผ่าน
  const [pdpa, setPdpa] = useState(true); // ยินยอมเงื่อนไข PDPA (ค่าเริ่มต้น: ยินยอม)
  const [error, setError] = useState(''); // ข้อความแจ้งเตือนข้อผิดพลาด
  const [submitting, setSubmitting] = useState(false); // สถานะกำลังส่งข้อมูลสมัครสมาชิก

  const passwordChecks = getPasswordRuleChecks(password);

  // ตรวจสอบตัวแปรสภาพแวดล้อมว่าเปิดให้ประชาชนลงทะเบียนด้วยตนเองหรือไม่
  const isRegistrationOpen = process.env.NEXT_PUBLIC_REGISTRATION_OPEN !== 'false';

  /**
   * ฟังก์ชันจัดการเมื่อกด Submit ฟอร์มลงทะเบียน
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 1. ตรวจสอบว่าระบบเปิดรับสมัครด้วยตนเองหรือไม่
    if (!isRegistrationOpen) {
      setError('ปิดรับการลงทะเบียนด้วยตนเองชั่วคราว กรุณาติดต่อเจ้าหน้าที่เพื่อสร้างบัญชี (Walk-in)');
      return;
    }
    // 2. ตรวจสอบชื่อ-นามสกุล
    if (!name.trim()) {
      setError('กรุณากรอกชื่อ-นามสกุล');
      return;
    }
    // 3. ตรวจสอบมาตรฐานชื่อผู้ใช้ (Username)
    const usernameCheck = validateUsername(username);
    if (!usernameCheck.valid) {
      setError(usernameCheck.error || 'ชื่อผู้ใช้ (Username) ไม่ถูกต้อง');
      return;
    }
    // 4. ตรวจสอบรูปแบบอีเมล / Gmail
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      setError(emailCheck.error || 'กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }
    // 5. ตรวจสอบความปลอดภัยของรหัสผ่าน (อย่างน้อย 8 ตัวอักษร มีตัวอักษรภาษาอังกฤษและตัวเลข)
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      setError(passwordCheck.error || 'รหัสผ่านไม่ผ่านเงื่อนไขที่กำหนด');
      return;
    }
    // 6. ตรวจสอบการยินยอมนโยบาย PDPA
    if (!pdpa) {
      setError('กรุณายินยอมนโยบาย PDPA ก่อนลงทะเบียน');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      // เรียกฟังก์ชันลงทะเบียนผ่าน Auth Context
      await registerAccount({
        name: name.trim(),
        username: usernameCheck.value,
        department: department.trim() || 'ประชาชนทั่วไป',
        email: emailCheck.value,
        password,
      });
      // ลงทะเบียนสำเร็จ นำทางไปยังหน้าหลักของระบบ
      router.push('/');
    } catch (err) {
      setError((err as Error).message || 'การลงทะเบียนไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      {/* กล่องการ์ดฟอร์มลงทะเบียน */}
      <form onSubmit={handleSubmit} className="w-full max-w-[440px] jw-card overflow-hidden flex flex-col">
        {/* แถบส่วนหัวด้านบนพร้อมปุ่มย้อนกลับไปหน้า Login */}
        <div className="jw-header text-white h-14 px-4 flex items-center gap-3 font-bold text-[16px]">
          <Link href="/login" className="p-1 -ml-1 rounded-full hover:bg-white/15">
            <Icon name="chevron-left" className="w-5 h-5" />
          </Link>
          <span>ลงทะเบียน</span>
        </div>

        <div className="p-5 flex flex-col gap-3.5">
          {/* โลโก้และหัวเรื่อง */}
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-control bg-surface-muted border border-line-soft flex items-center justify-center shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="โลโก้จับจอง" className="size-full object-contain" />
            </div>
            <div>
              <b className="text-[16px] text-ink">สร้างบัญชีผู้ใช้ใหม่</b>
              <div className="text-[13px] text-ink-mute">ลงทะเบียนสำหรับบุคคลทั่วไป</div>
            </div>
          </div>

          {/* กล่องแจ้งเตือนกรณีระบบปิดรับสมัครด้วยตนเอง */}
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

          {/* ช่องกรอกชื่อ-นามสกุล */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="jw-lbl mb-0">
                ชื่อ-นามสกุล <span className="text-status-crit">*</span>
              </label>
              <NameLengthBadge value={name} maxLength={NAME_MAX_LENGTH.PERSON_NAME} />
            </div>
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX_LENGTH.PERSON_NAME}
              onChange={(e) => setName(clampNameInput(e.target.value, NAME_MAX_LENGTH.PERSON_NAME))}
              placeholder="เช่น สมชาย ใจดี"
              className="jw-in"
              required
            />
            <NameLimitWarning value={name} maxLength={NAME_MAX_LENGTH.PERSON_NAME} />
          </div>

          {/* ช่องกรอกหน่วยงาน/ชุมชน */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="jw-lbl mb-0">หน่วยงาน / ชุมชน / กลุ่ม</label>
              <NameLengthBadge value={department} maxLength={NAME_MAX_LENGTH.ORGANIZATION} />
            </div>
            <input
              type="text"
              value={department}
              maxLength={NAME_MAX_LENGTH.ORGANIZATION}
              onChange={(e) => setDepartment(clampNameInput(e.target.value, NAME_MAX_LENGTH.ORGANIZATION))}
              placeholder="ระบุหน่วยงาน ชุมชน หรือกลุ่มของคุณ"
              className="jw-in"
            />
            <NameLimitWarning value={department} maxLength={NAME_MAX_LENGTH.ORGANIZATION} />
          </div>

          {/* ช่องกรอกชื่อผู้ใช้ (Username) */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="jw-lbl mb-0">
                ชื่อผู้ใช้ (Username) <span className="text-status-crit">*</span>
              </label>
              <NameLengthBadge value={username} maxLength={NAME_MAX_LENGTH.USERNAME} />
            </div>
            <input
              type="text"
              value={username}
              maxLength={NAME_MAX_LENGTH.USERNAME}
              onChange={(e) => setUsername(clampNameInput(e.target.value, NAME_MAX_LENGTH.USERNAME))}
              placeholder="เช่น somchai, supa1234 (อย่างน้อย 4 ตัวอักษร)"
              className="jw-in"
              autoComplete="username"
              required
            />
            <div className="text-[12px] text-ink-mute mt-1">
              อย่างน้อย 4 ตัวอักษร ใช้ตัวอักษรภาษาอังกฤษ (A-Z, a-z), ตัวเลข (0-9), _ หรือ -
            </div>
          </div>

          {/* ช่องกรอกอีเมล / Gmail */}
          <div>
            <label className="jw-lbl">
              อีเมล / Gmail <span className="text-status-crit">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="เช่น somchai@gmail.com"
              className="jw-in"
              autoComplete="email"
              required
            />
          </div>

          {/* ช่องกรอกรหัสผ่าน */}
          <div>
            <label className="jw-lbl">
              รหัสผ่าน <span className="text-status-crit">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="อย่างน้อย 8 ตัวอักษร เช่น supa1234"
                className="jw-in pr-11"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-ink-mute hover:text-brand transition cursor-pointer"
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="text-[12px] mt-1.5 flex flex-col gap-0.5">
              <span className={passwordChecks.minLength ? 'text-status-ok font-medium' : 'text-ink-mute'}>
                {passwordChecks.minLength ? '✓' : '•'} ความยาวอย่างน้อย 8 ตัวอักษร
              </span>
              <span className={passwordChecks.hasLetter ? 'text-status-ok font-medium' : 'text-ink-mute'}>
                {passwordChecks.hasLetter ? '✓' : '•'} มีตัวอักษรภาษาอังกฤษอย่างน้อย 1 ตัว
              </span>
              <span className={passwordChecks.hasNumber ? 'text-status-ok font-medium' : 'text-ink-mute'}>
                {passwordChecks.hasNumber ? '✓' : '•'} มีตัวเลขอย่างน้อย 1 ตัว
              </span>
            </div>
          </div>

          {/* กล่องเลือกความยินยอมนโยบาย PDPA */}
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

          {/* ข้อความแจ้งเตือนเมื่อเกิดข้อผิดพลาด */}
          {error && (
            <div className="rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-3 py-2 text-[13px] text-[#7a1010]">
              {error}
            </div>
          )}
        </div>

        {/* ปุ่มยกเลิกและปุ่มลงทะเบียนด้านล่าง */}
        <div className="p-4 bg-white border-t border-line flex gap-2.5">
          <Link href="/login" className="jw-btn-sec flex-1 text-center">
            ยกเลิก
          </Link>
          <button
            type="submit"
            disabled={submitting || !name.trim() || !username.trim() || !email.trim() || !password.trim()}
            className="jw-btn flex-[1.5] disabled:opacity-50"
          >
            {submitting ? 'กำลังลงทะเบียน...' : 'ลงทะเบียน'}
          </button>
        </div>
      </form>
    </div>
  );
}
