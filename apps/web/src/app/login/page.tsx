'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DemoAccountSummary, ROLE_LABEL, ROLE_TONE } from '@jongwen/shared';
import { useAuth } from '@/components/auth-context';
import { roleHomePath } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip } from '@/components/ui';
import { api, setStoredAuth } from '@/lib/api';

const DEFAULT_DEMO_ACCOUNTS: DemoAccountSummary[] = [
  { id: 'u-somchai', name: 'สมชาย ใจดี', role: 'USER', position: 'ประชาชน', department: 'กลุ่มแม่บ้านบ้านหนองบัว', initial: 'ส', nickname: 'สมชาย' },
  { id: 'u-manee', name: 'มานี มีนา', role: 'USER', position: 'ประชาชน', department: 'กองสวัสดิการสังคม', initial: 'ม', nickname: 'มานี' },
  { id: 's-suda', name: 'สุดา มีสุข', role: 'STAFF', position: 'เจ้าหน้าที่ธุรการ', department: 'สำนักปลัด อบต.', initial: 'สุ', nickname: 'สุดา' },
  { id: 'a-wichai', name: 'วิชัย รักถิ่น', role: 'APPROVER_L2', position: 'ปลัดองค์การบริหารส่วนตำบล', department: 'สำนักปลัด อบต.', initial: 'วิ', nickname: 'วิชัย' },
  { id: 'a-prasert', name: 'ประเสริฐ ศรีสุข', role: 'APPROVER_L1', position: 'นายกองค์การบริหารส่วนตำบล', department: 'องค์การบริหารส่วนตำบล', initial: 'ป', nickname: 'ประเสริฐ' },
  { id: 'ad-admin', name: 'ผู้ดูแลระบบ', role: 'ADMIN', position: 'ผู้ดูแลระบบ', department: 'ฝ่ายเทคโนโลยีสารสนเทศ', initial: 'อ', nickname: 'แอดมิน' },
];

function LineIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.365 9.863c.349.002.63.285.63.631 0 .348-.281.63-.63.63h-2.12v1.341h2.12c.349 0 .63.283.63.631 0 .348-.281.63-.63.63h-2.752a.63.63 0 0 1-.63-.63V7.868c0-.348.281-.63.63-.63h2.752c.349 0 .63.282.63.63 0 .348-.281.63-.63.63h-2.12v1.365h2.12zm-4.704 3.232c0 .348-.282.63-.63.63a.628.628 0 0 1-.504-.254l-2.023-2.775v2.4c0 .347-.282.629-.63.629a.63.63 0 0 1-.631-.63V7.868c0-.348.282-.63.631-.63a.63.63 0 0 1 .504.254l2.023 2.776V7.868c0-.348.281-.63.63-.63.348 0 .63.282.63.63v5.227zm-5.864 0c0 .348-.282.63-.63.63a.63.63 0 0 1-.631-.63V7.868c0-.348.282-.63.631-.63.348 0 .63.282.63.63v5.227zM6.55 10.494h-2.12v2.601c0 .348-.282.63-.63.63a.63.63 0 0 1-.63-.63V7.868c0-.348.281-.63.63-.63.348 0 .63.282.63.63v2.626h2.12c.349 0 .63.282.63.63 0 .348-.281.63-.63.63zM12 2C6.477 2 2 5.925 2 10.767c0 4.398 3.668 8.082 8.618 8.683.336.073.792.222.908.51.104.258.068.663.033.924l-.145.875c-.044.267-.206 1.043.914.569 1.12-.474 6.046-3.56 8.249-6.096C21.65 14.07 22 12.482 22 10.767 22 5.925 17.523 2 12 2z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { loginWithCredentials, loginWithDemo, refreshMe } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pdpa, setPdpa] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccountSummary[]>(DEFAULT_DEMO_ACCOUNTS);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [unlinkedNotice, setUnlinkedNotice] = useState<{ show: boolean; displayName?: string }>({ show: false });
  const isDemo = process.env.NEXT_PUBLIC_DEMO === 'true';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const lineToken = params.get('line_token');
    const accountId = params.get('account_id');
    const lineStatus = params.get('line_status');
    const lineError = params.get('line_error');
    const displayName = params.get('displayName');

    if (lineError) {
      setError(decodeURIComponent(lineError));
    } else if (lineStatus === 'unlinked') {
      setUnlinkedNotice({
        show: true,
        displayName: displayName ? decodeURIComponent(displayName) : undefined,
      });
    } else if (lineToken && accountId) {
      setSubmitting(true);
      setStoredAuth(lineToken, accountId);
      api
        .me()
        .then((acc) => {
          refreshMe().then(() => {
            router.push(roleHomePath(acc.role));
          });
        })
        .catch((err) => {
          setError(err.message || 'ไม่สามารถดึงข้อมูลบัญชีจาก LINE ได้');
          setSubmitting(false);
        });
    }
  }, [refreshMe, router]);

  useEffect(() => {
    if (!isDemo) return;
    let active = true;
    setLoadingDemo(true);
    api
      .demoAccounts()
      .then((data) => {
        if (active && data && data.length > 0) setDemoAccounts(data);
      })
      .catch((err) => {
        console.warn('Could not fetch demo accounts from API, using fallback list:', err);
      })
      .finally(() => {
        if (active) setLoadingDemo(false);
      });
    return () => {
      active = false;
    };
  }, [isDemo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }
    if (!pdpa) {
      setError('กรุณายินยอมนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA) ก่อนเข้าสู่ระบบ');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const acc = await loginWithCredentials(username.trim(), password);
      router.push(roleHomePath(acc.role));
    } catch (err) {
      setError((err as Error).message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLoginClick = async (accountId: string) => {
    setError('');
    setSubmitting(true);
    try {
      const acc = await loginWithDemo(accountId);
      router.push(roleHomePath(acc.role));
    } catch (err) {
      setError((err as Error).message || 'เข้าสู่ระบบโหมดทดสอบไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLineLogin = () => {
    if (!pdpa) {
      setError('กรุณายินยอมนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA) ก่อนเข้าสู่ระบบ');
      return;
    }
    setError('');
    setSubmitting(true);
    // Direct browser redirect to backend LINE login endpoint
    window.location.href = '/api/auth/line';
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[960px] grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* การ์ดเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน */}
        <form onSubmit={handleLogin} className="jw-card p-6 sm:p-8 flex flex-col justify-center gap-4">
          <div className="flex flex-col items-center text-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="โลโก้จับจอง"
              className="w-20 h-20 rounded-[20px] bg-white p-1.5 object-contain shadow-low border border-line"
            />
            <h1 className="text-[28px] font-bold text-ink">จับจอง</h1>
            <p className="text-[13px] text-ink-mute leading-relaxed">
              ระบบขอใช้สถานที่ ขอใช้อุปกรณ์ และแจ้งซ่อม
              <br />
              องค์การบริหารส่วนตำบล (อบต.)
            </p>
          </div>

          {/* แจ้งเตือนกรณีพยายามล็อกอินด้วย LINE แต่ยังไม่ได้เชื่อมต่อบัญชี */}
          {unlinkedNotice.show && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-[13px] text-amber-900 flex flex-col gap-2">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <Icon name="alert-triangle" className="w-5 h-5 text-amber-600 shrink-0" />
                <span>ยังไม่พบบัญชีจับจองที่เชื่อมต่อกับ LINE</span>
              </div>
              <p className="leading-relaxed">
                บัญชี LINE <b>{unlinkedNotice.displayName || 'ของคุณ'}</b> ยังไม่ได้เชื่อมโยงกับระบบจับจอง
                <br />
                กรุณาเข้าสู่ระบบด้วย <b>ชื่อผู้ใช้และรหัสผ่านเดิม</b> ของท่าน เพื่อเข้าใช้งานระบบ
              </p>
              <div className="text-[11.5px] text-amber-700 bg-amber-100/60 rounded-xl px-3 py-1.5 mt-1">
                💡 เมื่อเข้าสู่ระบบสำเร็จ ท่านจะสามารถเชื่อมต่อบัญชี LINE ได้ที่หน้าตั้งค่าโปรไฟล์
              </div>
            </div>
          )}

          {/* ปุ่ม LINE Login */}
          <button
            type="button"
            disabled={submitting}
            onClick={handleLineLogin}
            className="h-[52px] rounded-full bg-[#06C755] hover:bg-[#05b34c] active:scale-[0.99] text-white font-semibold text-[16px] flex items-center justify-center gap-2.5 shadow-low transition disabled:opacity-50 cursor-pointer"
          >
            <LineIcon className="w-6 h-6" />
            <span>เข้าสู่ระบบด้วย LINE</span>
          </button>

          <div className="flex items-center gap-3 text-[12px] text-ink-mute">
            <span className="flex-1 h-px bg-line" />
            <span>หรือเข้าด้วยชื่อผู้ใช้ / รหัสผ่าน</span>
            <span className="flex-1 h-px bg-line" />
          </div>

          <div>
            <label className="jw-lbl">ชื่อผู้ใช้, อีเมล หรือ เบอร์โทรศัพท์</label>
            <input
              id="login-username-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="กรอกชื่อผู้ใช้ เช่น somchai หรืออีเมล"
              className="jw-in"
            />
          </div>

          <div>
            <label className="jw-lbl">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="กรอกรหัสผ่าน"
              className="jw-in"
            />
          </div>

          <div
            onClick={() => setPdpa((v) => !v)}
            className="jw-card p-3.5 border border-line flex items-start gap-2.5 cursor-pointer select-none"
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
            <div className="rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-3.5 py-2.5 text-[13px] text-[#7a1010] flex items-center gap-2">
              <Icon name="x" className="w-4 h-4 text-status-crit shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={submitting} className="jw-btn w-full">
            {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>

          <div className="text-[13px] text-ink-mute text-center">
            ยังไม่มีบัญชี?{' '}
            <Link href="/register" className="font-bold text-ink hover:underline">
              ลงทะเบียน
            </Link>{' '}
            · ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบ
          </div>
        </form>

        {/* โหมดเดโม: แสดงเฉพาะเมื่อเปิด NEXT_PUBLIC_DEMO=true และดึงจาก /auth/demo-accounts */}
        {isDemo && (
          <div className="jw-card p-6 sm:p-7 flex flex-col gap-3.5">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-[18px] font-bold text-ink">เข้าสู่ระบบแบบคลิกเดียว (Demo)</h2>
                <Chip tone="green">One-Click Demo</Chip>
              </div>
              <p className="text-[13px] text-ink-mute mt-1">
                เลือกบทบาทที่ต้องการเพื่อเข้าใช้งานทันทีโดยไม่ต้องใส่รหัสผ่าน
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              {loadingDemo ? (
                <div className="py-8 text-center text-[13px] text-ink-mute">
                  กำลังโหลดรายชื่อบัญชีสาธิต...
                </div>
              ) : (
                demoAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => handleDemoLoginClick(acc.id)}
                    className="w-full text-left border border-line hover:border-brand hover:bg-brand-mint/30 rounded-2xl p-3 bg-white flex items-center justify-between gap-3 cursor-pointer transition group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-brand-mint text-brand font-bold flex items-center justify-center shrink-0">
                        {acc.initial}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <b className="text-[14px] text-ink truncate">{acc.name}</b>
                          <Chip tone={ROLE_TONE[acc.role]}>{ROLE_LABEL[acc.role]}</Chip>
                        </div>
                        <div className="text-[12px] text-ink-mute truncate">
                          {acc.position} · {acc.department}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 text-[12.5px] font-semibold text-brand inline-flex items-center gap-1 group-hover:translate-x-0.5 transition">
                      เข้าใช้งาน <Icon name="chevron-right" className="w-4 h-4" />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
