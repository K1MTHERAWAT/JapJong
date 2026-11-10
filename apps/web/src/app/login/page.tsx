'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DemoAccountSummary, ROLE_LABEL, ROLE_TONE } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { useTheme } from '@/components/theme-provider';
import { Moon, Sun } from 'lucide-react';
import { roleHomePath } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip } from '@/components/ui';
import { api, setStoredAuth } from '@/lib/api';
import {
  buildGovCenterLineAuthorizeUrl,
  loginGovCenterWithPassword,
  logGovSsoDiagnostic,
} from '@/lib/sso-config';

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

function GovIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 21h18" />
      <path d="M5 21V10l7-5 7 5v11" />
      <path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
      <line x1="10" y1="10" x2="14" y2="10" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { loginWithCredentials, loginWithDemo, refreshMe } = useAuth();
  const { actualTheme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pdpa, setPdpa] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccountSummary[]>(DEFAULT_DEMO_ACCOUNTS);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [unlinkedNotice, setUnlinkedNotice] = useState<{ show: boolean; displayName?: string }>({ show: false });

  // สถานะสำหรับ Gov Center (SSO) Modal
  const [showGovModal, setShowGovModal] = useState(false);
  const [govEmail, setGovEmail] = useState('');
  const [govPassword, setGovPassword] = useState('');
  const [govError, setGovError] = useState('');
  const [govSubmitting, setGovSubmitting] = useState(false);

  const isDemo = process.env.NEXT_PUBLIC_DEMO === 'true';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    logGovSsoDiagnostic('LoginPage โหลดสำเร็จ');

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
    const trimmedUser = username.trim();
    if (!trimmedUser || !password.trim()) {
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
      const acc = await loginWithCredentials(trimmedUser, password);
      router.push(roleHomePath(acc.role));
    } catch (localErr) {
      // หากกรอกเป็นอีเมล ให้ลองตรวจสอบกับ Gov Center SSO โดยอัตโนมัติ
      if (trimmedUser.includes('@')) {
        try {
          const ssoResult = await loginGovCenterWithPassword(trimmedUser, password);
          const token = ssoResult.token;
          const accountId = ssoResult.account?.id || ssoResult.user?.id;
          if (!token || !accountId) {
            throw new Error('ไม่ได้รับข้อมูลเซสชันจากระบบ');
          }
          setStoredAuth(token, accountId);
          await refreshMe();
          const role = (ssoResult.account?.role || ssoResult.user?.role || 'USER') as any;
          router.push(roleHomePath(role));
          return;
        } catch {
          // ใช้ข้อความจาก localErr ด้านล่าง
        }
      }
      setError((localErr as Error).message || 'เข้าสู่ระบบไม่สำเร็จ');
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

  const handleOpenGovSso = () => {
    if (!pdpa) {
      setError('กรุณายินยอมนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA) ก่อนเข้าสู่ระบบ');
      return;
    }
    setError('');
    setGovError('');
    setShowGovModal(true);
  };

  const handleGovCenterLineRedirect = () => {
    setGovError('');
    setGovSubmitting(true);
    const diag = logGovSsoDiagnostic('ผู้ใช้กดปุ่ม "เข้าสู่ระบบ Gov Center ด้วย LINE" (Direct Flow)');
    const { authorizeUrl, callbackWithState, lineRedirectUri } = buildGovCenterLineAuthorizeUrl();
    console.info('[GovSSO Trace] 🚀 กำลัง Redirect ไปยัง LINE OAuth ของ Gov Center:', {
      authorizeUrl,
      lineRedirectUri,
      callbackWithState,
    });
    try {
      localStorage.setItem(
        'japjong_sso_last_attempt',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          origin: window.location.origin,
          mode: 'gov_line_direct',
          authorizeUrl,
          callbackWithState,
          diagnostic: diag,
        }),
      );
    } catch {
      // ignore storage quota
    }
    window.location.assign(authorizeUrl);
  };

  const handleGovCenterPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!govEmail.trim() || !govPassword) {
      setGovError('กรุณากรอกอีเมลและรหัสผ่านของบัญชี Gov Center');
      return;
    }
    setGovError('');
    setGovSubmitting(true);
    try {
      const result = await loginGovCenterWithPassword(govEmail.trim(), govPassword);
      const token = result.token;
      const accountId = result.account?.id || result.user?.id;
      if (!token || !accountId) {
        throw new Error('ระบบไม่ได้ส่ง Token หรือรหัสบัญชีกลับมา');
      }
      setStoredAuth(token, accountId);
      await refreshMe();
      const role = (result.account?.role || result.user?.role || 'USER') as any;
      setShowGovModal(false);
      router.push(roleHomePath(role));
    } catch (err) {
      setGovError((err as Error).message || 'เข้าสู่ระบบด้วยบัญชี Gov Center ไม่สำเร็จ');
      setGovSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f6f5f0] text-[#14231f] flex flex-col lg:flex-row font-sans relative">
      {/* Floating Theme Toggle (top-right, safe-area aware) */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={actualTheme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
        title={actualTheme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
        className="fixed top-[max(0.75rem,env(safe-area-inset-top,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-50 size-9 sm:size-10 rounded-full bg-white/80 dark:bg-[#182420]/85 backdrop-blur-md border border-[#e3e1d8] dark:border-[#2b3e37] shadow-sm flex items-center justify-center text-ink hover:bg-hover active:scale-95 transition cursor-pointer"
      >
        {actualTheme === 'dark' ? (
          <Sun className="size-4.5 text-amber-400" />
        ) : (
          <Moon className="size-4.5 text-ink-mute" />
        )}
      </button>
      
      {/* ========================================================
          DESKTOP (>= lg): Left Brand Sidebar (แบบ A)
          โทนเขียวลึก #0b4f43 พร้อมลวดลายตาราง โลโก้ และ 3 บริการ
          ======================================================== */}
      <aside className="hidden lg:flex flex-[5_1_500px] min-w-[420px] relative overflow-hidden bg-[#0b4f43] text-white p-12 xl:p-16 flex-col justify-between gap-12">
        {/* ลายตารางจางๆ แบบโมเดิร์น */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* แบรนด์ & โลโก้ของเรา */}
        <div className="relative flex items-center gap-4">
          <div className="w-[56px] h-[56px] rounded-[16px] bg-white p-1 flex items-center justify-center shadow-lg border border-white/30 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="โลโก้จับจอง"
              className="size-full object-contain"
            />
          </div>
          <div>
            <div className="text-[26px] font-bold tracking-tight text-white leading-tight">จับจอง</div>
            <div className="text-[13px] text-[#b9ddd1] font-medium">ระบบบริการดิจิทัลส่วนท้องถิ่น</div>
          </div>
        </div>

        {/* หัวข้อระบบ & รายการ 3 บริการเด่น */}
        <div className="relative flex flex-col gap-9 max-w-[480px]">
          <div className="flex flex-col gap-3">
            <span className="text-[14px] font-semibold text-[#b9ddd1] tracking-wide uppercase">
              องค์การบริหารส่วนตำบล (อบต.)
            </span>
            <h1 className="text-[36px] xl:text-[40px] font-bold leading-[1.25] text-white">
              ระบบขอใช้สถานที่ ขอใช้อุปกรณ์ และแจ้งซ่อม
            </h1>
            <p className="text-[15px] leading-relaxed text-[#d0e7df] mt-1">
              ยื่นคำขอ จองคิวล่วงหน้า ตรวจสอบสถานะการอนุมัติ 3 ระดับ พร้อมเอกสารราชการดิจิทัลที่มีผลถูกต้องครบวงจร
            </p>
          </div>

          {/* 3 การบริการ */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-white">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                  <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                  <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                  <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
                </svg>
              </div>
              <div>
                <div className="text-[16.5px] font-semibold text-white">ขอใช้สถานที่</div>
                <div className="text-[13px] text-[#b9ddd1]">อาคารอเนกประสงค์ สนามกีฬา ห้องประชุม</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-white">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
              </div>
              <div>
                <div className="text-[16.5px] font-semibold text-white">ขอใช้อุปกรณ์</div>
                <div className="text-[13px] text-[#b9ddd1]">เต็นท์ โต๊ะ เก้าอี้ เครื่องเสียง โปรเจกเตอร์</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-white">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              </div>
              <div>
                <div className="text-[16.5px] font-semibold text-white">แจ้งซ่อมแซม</div>
                <div className="text-[13px] text-[#b9ddd1]">ถนน ไฟฟ้าสาธารณะ ประปา รางระบายน้ำ</div>
              </div>
            </div>
          </div>
        </div>

        {/* แถบความปลอดภัยล่าง */}
        <div className="relative flex items-center gap-2.5 text-[13px] text-[#a9cfc2] border-t border-white/15 pt-5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>รับรองการยืนยันตัวตนผ่านระบบราชการ Gov SSO &amp; PDPA Compliant</span>
        </div>
      </aside>

      {/* ========================================================
          RIGHT AREA:
          - Desktop (>= lg): การ์ดขาวลอยตัว สไตล์ A
          - Mobile (< lg): สไตล์ B เรียบ สว่าง มนมน พร้อมโลโก้ตรงกลาง
          ======================================================== */}
      <main className="flex-[7_1_500px] min-w-0 flex items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-[460px] flex flex-col gap-5">
          
          {/* Card Container: บนคอมจะเป็นการ์ดขาวขอบมนเงา บนมือถือจะเป็นการ์ดเรียบโปร่งสว่าง */}
          <div className="bg-transparent lg:bg-white lg:border lg:border-[#e3e1d8] lg:rounded-[24px] p-2 sm:p-4 lg:p-9 lg:shadow-[0_1px_2px_rgba(20,35,31,0.04),0_16px_40px_rgba(20,35,31,0.07)] flex flex-col gap-5">

            {/* MOBILE ONLY HEADER (สไตล์ B: โลโก้กล่อง 64x64 สีขาวตรงกลาง บนพื้นสว่าง) */}
            <div className="flex lg:hidden flex-col items-center text-center gap-2.5 pt-2 pb-1">
              <div className="w-16 h-16 rounded-[20px] bg-white border border-[#e3e1d8] p-1.5 flex items-center justify-center shadow-[0_6px_18px_rgba(20,35,31,0.06)] shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="โลโก้จับจอง"
                  className="size-full object-contain"
                />
              </div>
              <h1 className="text-[28px] font-bold tracking-tight text-[#14231f] leading-tight">จับจอง</h1>
              <p className="text-[13.5px] text-[#4a5853] leading-relaxed">
                ระบบขอใช้สถานที่ ขอใช้อุปกรณ์ และแจ้งซ่อม
                <br />
                องค์การบริหารส่วนตำบล (อบต.)
              </p>
            </div>

            {/* DESKTOP ONLY HEADER (สไตล์ A: หัวเรื่องในการ์ดขวา) */}
            <div className="hidden lg:flex flex-col gap-1.5">
              <h1 className="text-[28px] font-bold tracking-tight text-[#14231f]">เข้าสู่ระบบ</h1>
              <p className="text-[14.5px] text-[#4a5853]">เข้าใช้งานด้วยบัญชีหน่วยงาน หรือชื่อผู้ใช้ของคุณ</p>
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

            {/* ปุ่ม Single Sign-On (Gov Center SSO)
                - บน Desktop: ปุ่มมน 12px สีเขียวอ่อน #e1efe9
                - บน Mobile: ปุ่มมนแคปซูล rounded-full สีขาว ขอบเขียว 1.5px
            */}
            <button
              type="button"
              disabled={submitting}
              onClick={handleOpenGovSso}
              className="h-[52px] w-full rounded-full lg:rounded-[14px] bg-white lg:bg-[#e1efe9] hover:bg-[#f1f5f3] lg:hover:bg-[#d3e8df] active:scale-[0.99] border-[1.5px] border-[#0b6b5c] lg:border-transparent text-[#074d41] font-semibold text-[15.5px] flex items-center justify-center gap-2.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <GovIcon className="w-5 h-5 text-[#074d41]" />
              <span>เข้าสู่ระบบด้วย Gov Center (SSO)</span>
            </button>

            {/* ตัวแบ่งเส้นกลาง */}
            <div className="flex items-center gap-3 text-[12.5px] text-[#56625d]">
              <span className="flex-1 h-px bg-[#d7deda]" />
              <span>หรือเข้าด้วยชื่อผู้ใช้ / รหัสผ่าน</span>
              <span className="flex-1 h-px bg-[#d7deda]" />
            </div>

            {/* ฟอร์มกรอกชื่อผู้ใช้และรหัสผ่าน */}
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              
              {/* ช่องกรอกชื่อผู้ใช้ */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13.5px] font-semibold text-[#1e302a]">
                  ชื่อผู้ใช้, อีเมล หรือ เบอร์โทรศัพท์
                </label>
                <input
                  id="login-username-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="เช่น somchai หรืออีเมล"
                  className="w-full h-[50px] px-5 lg:px-4 rounded-full lg:rounded-[12px] border-[1.5px] border-[#87928d] bg-white text-[#14231f] text-[15px] focus:outline-none focus:border-[#0b6b5c] focus:ring-2 focus:ring-[#0b6b5c]/20 transition"
                  autoComplete="username"
                />
              </div>

              {/* ช่องกรอกรหัสผ่าน พร้อมปุ่มเปิด/ปิดตา */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13.5px] font-semibold text-[#1e302a]">รหัสผ่าน</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่าน"
                    className="w-full h-[50px] pl-5 lg:pl-4 pr-12 rounded-full lg:rounded-[12px] border-[1.5px] border-[#87928d] bg-white text-[#14231f] text-[15px] focus:outline-none focus:border-[#0b6b5c] focus:ring-2 focus:ring-[#0b6b5c]/20 transition"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 -translate-y-1/2 right-2 w-10 h-10 flex items-center justify-center text-[#56625d] hover:text-[#0b6b5c] rounded-full transition cursor-pointer"
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                        <circle cx="12" cy="12" r="3" />
                        <line x1="3" y1="3" x2="21" y2="21" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* ส่วนยินยอม PDPA
                  - บน Desktop: กล่องพื้นหลังเขียวอ่อน #f1f5f3 มน 12px
                  - บน Mobile: บรรทัดคลีนแนวนอน เรียบง่าย
              */}
              <div
                onClick={() => setPdpa((v) => !v)}
                className="lg:bg-[#f1f5f3] lg:rounded-[12px] lg:p-3.5 flex items-start gap-3 cursor-pointer select-none py-1"
              >
                <div
                  className={`w-[22px] h-[22px] rounded-[6px] border-[1.5px] flex items-center justify-center shrink-0 mt-0.5 transition ${
                    pdpa ? 'bg-[#0b6b5c] border-[#0b6b5c] text-white' : 'bg-white border-[#87928d]'
                  }`}
                >
                  {pdpa && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
                </div>
                <div className="text-[13px] text-[#2b3833] leading-relaxed">
                  ยินยอมให้เก็บ ใช้ และเปิดเผยข้อมูลส่วนบุคคลตามนโยบาย PDPA{' '}
                  <span className="text-[#0b6b5c] font-semibold underline underline-offset-2">
                    อ่านประกาศความเป็นส่วนตัว
                  </span>
                </div>
              </div>

              {/* แสดงข้อผิดพลาด */}
              {error && (
                <div className="rounded-xl bg-[#FDE8E8] border border-[#f9b4b4] px-4 py-2.5 text-[13px] text-[#7a1010] flex items-center gap-2">
                  <Icon name="x" className="w-4 h-4 text-status-crit shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* ปุ่มเข้าสู่ระบบ
                  - Desktop: rounded-xl
                  - Mobile: rounded-full
              */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full h-[52px] rounded-full lg:rounded-[14px] bg-[#0b6b5c] hover:bg-[#095a4d] active:scale-[0.99] text-white font-semibold text-[16px] shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>

              {/* แถบลิงก์ล่าง */}
              <div className="text-[13.5px] text-[#4a5853] text-center pt-1">
                ยังไม่มีบัญชี?{' '}
                <Link href="/register" className="font-bold text-[#0b6b5c] hover:underline">
                  ลงทะเบียน
                </Link>{' '}
                · ลืมรหัสผ่าน?{' '}
                <span className="text-[#0b6b5c] font-semibold cursor-pointer hover:underline">
                  ติดต่อผู้ดูแลระบบ
                </span>
              </div>
            </form>

            {/* บัญชีสาธิตสำหรับทดสอบระบบ (Demo Accounts) */}
            {isDemo && (
              <div className="mt-2 pt-4 border-t border-dashed border-[#c8d4cf] flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-[#0b6b5c] uppercase tracking-wide">
                      ⚡ บัญชีทดสอบ (Demo)
                    </span>
                    <Chip tone="green">คลิกเดียวเข้าใช้งาน</Chip>
                  </div>
                  <span className="text-[11px] text-[#697872]">ไม่ต้องกรอกรหัส</span>
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-1">
                  {loadingDemo ? (
                    <div className="py-4 text-center text-[12px] text-ink-mute">
                      กำลังโหลดรายชื่อบัญชีสาธิต...
                    </div>
                  ) : (
                    demoAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        disabled={submitting}
                        onClick={() => handleDemoLoginClick(acc.id)}
                        className="w-full text-left border border-[#d7deda] hover:border-[#0b6b5c] hover:bg-[#f1f8f5] rounded-xl p-2.5 bg-white flex items-center justify-between gap-2.5 cursor-pointer transition group disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#e1efe9] text-[#074d41] font-bold text-[12px] flex items-center justify-center shrink-0">
                            {acc.initial}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <b className="text-[13px] text-[#14231f] truncate">{acc.name}</b>
                              <Chip tone={ROLE_TONE[acc.role]}>{ROLE_LABEL[acc.role]}</Chip>
                            </div>
                            <div className="text-[11.5px] text-[#56625d] truncate">
                              {acc.position} · {acc.department}
                            </div>
                          </div>
                        </div>
                        <span className="shrink-0 text-[12px] font-semibold text-[#0b6b5c] inline-flex items-center gap-0.5 group-hover:translate-x-0.5 transition">
                          เข้าสู่ระบบ <Icon name="chevron-right" className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* ========================================================
          หน้าต่างเข้าสู่ระบบด้วย Gov Center (SSO) แบบ Direct Flow
          ======================================================== */}
      {showGovModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => !govSubmitting && setShowGovModal(false)}
        >
          <div
            className="w-full max-w-[440px] bg-white rounded-[24px] p-6 sm:p-7 shadow-xl border border-line flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#0b6b5c]/10 text-[#0b6b5c] flex items-center justify-center shrink-0">
                  <GovIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-[18px] font-bold text-ink">เข้าสู่ระบบด้วย Gov Center</h2>
                  <p className="text-[12.5px] text-ink-mute">
                    ระบบยืนยันตัวตนกลางภาครัฐท้องถิ่น (IAM-GOV SSO)
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={govSubmitting}
                onClick={() => setShowGovModal(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-ink-mute cursor-pointer"
                aria-label="ปิดหน้าต่าง"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={govSubmitting}
              onClick={handleGovCenterLineRedirect}
              className="h-[50px] w-full rounded-full bg-[#06C755] hover:bg-[#05b34c] active:scale-[0.99] text-white font-semibold text-[15px] flex items-center justify-center gap-2.5 shadow-low transition disabled:opacity-50 cursor-pointer"
            >
              <LineIcon className="w-5 h-5" />
              <span>ดำเนินการต่อด้วย LINE (Gov Center)</span>
            </button>

            <div className="flex items-center gap-3 text-[12px] text-ink-mute">
              <span className="flex-1 h-px bg-line" />
              <span>หรือใช้อีเมลและรหัสผ่าน Gov Center</span>
              <span className="flex-1 h-px bg-line" />
            </div>

            <form onSubmit={handleGovCenterPasswordSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="jw-lbl">อีเมลบัญชี Gov Center</label>
                <input
                  type="email"
                  value={govEmail}
                  onChange={(e) => setGovEmail(e.target.value)}
                  placeholder="เช่น citizen@govcenter.co"
                  className="jw-in"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="jw-lbl">รหัสผ่าน Gov Center</label>
                <input
                  type="password"
                  value={govPassword}
                  onChange={(e) => setGovPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่าน Gov Center"
                  className="jw-in"
                  autoComplete="current-password"
                />
              </div>

              {govError && (
                <div className="rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-3.5 py-2.5 text-[13px] text-[#7a1010] flex items-center gap-2">
                  <Icon name="x" className="w-4 h-4 text-status-crit shrink-0" />
                  <span>{govError}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={govSubmitting}
                  onClick={() => setShowGovModal(false)}
                  className="h-[46px] px-4 rounded-full border border-line text-[14px] font-medium text-ink hover:bg-gray-50 transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={govSubmitting}
                  className="h-[46px] flex-1 rounded-full bg-[#0b6b5c] hover:bg-[#095a4d] text-white font-semibold text-[14.5px] transition disabled:opacity-50 cursor-pointer"
                >
                  {govSubmitting ? 'กำลังยืนยันตัวตน...' : 'เข้าสู่ระบบ Gov Center'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
