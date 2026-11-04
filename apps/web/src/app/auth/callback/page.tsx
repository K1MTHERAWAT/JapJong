'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setStoredAuth } from '@/lib/api';
import { roleHomePath } from '@/components/shell';
import { useAuth } from '@/components/auth-context';
import {
  exchangeGovSsoCallback,
  GOV_SSO_STATE_KEY,
  logGovSsoDiagnostic,
  ssoConfig,
} from '@/lib/sso-config';

function CallbackContent() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const processedRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [detailMessage, setDetailMessage] = useState<string>(
    'กำลังยืนยันตัวตนกับ Gov Center SSO...',
  );

  useEffect(() => {
    if (typeof window === 'undefined' || processedRef.current) return;
    processedRef.current = true;

    const runCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code')?.trim() || '';
      const ticket = params.get('ticket')?.trim() || '';
      const urlState = params.get('state')?.trim() || '';
      const errorParam = params.get('error')?.trim() || '';
      const errorDescription = params.get('error_description')?.trim() || '';
      const savedState = sessionStorage.getItem(GOV_SSO_STATE_KEY);

      logGovSsoDiagnostic('เข้าสู่หน้า /auth/callback');
      console.group('[GovSSO Trace] 📥 พารามิเตอร์ที่ได้รับกลับมาจาก Gov Center');
      console.log('Full URL:', window.location.href);
      console.log('code:', code ? `${code.slice(0, 10)}...` : null);
      console.log('ticket:', ticket ? `${ticket.slice(0, 10)}...` : null);
      console.log('service:', params.get('service'));
      console.log('state (จาก URL):', urlState || null);
      console.log('state (ใน sessionStorage):', savedState);
      console.log('is_new_user:', params.get('is_new_user'));
      console.log('error:', errorParam || null);
      console.log(
        'API ปลายทางที่จะส่งไปตรวจสอบ:',
        `${ssoConfig.apiBaseUrl}${ssoConfig.ssoCallbackPath}`,
      );
      console.groupEnd();

      try {
        if (errorParam) {
          throw new Error(
            errorDescription
              ? decodeURIComponent(errorDescription)
              : `Gov Center ปฏิเสธการเข้าสู่ระบบ (${decodeURIComponent(errorParam)})`,
          );
        }

        if (savedState) {
          sessionStorage.removeItem(GOV_SSO_STATE_KEY);
          if (urlState && urlState !== savedState) {
            throw new Error('รหัสตรวจสอบความปลอดภัย (CSRF State) ไม่ตรงกัน กรุณาลองใหม่อีกครั้ง');
          }
        }

        if (!code && !ticket) {
          throw new Error('ไม่พบรหัสยืนยันตัวตน (Authorization Code) จาก Gov Center');
        }

        const result = await exchangeGovSsoCallback({
          code: code || undefined,
          ticket: ticket || undefined,
          state: urlState || undefined,
        });

        const token = result?.token;
        const accountId = result?.account?.id || result?.user?.id;
        if (!token || !accountId) {
          throw new Error('ระบบไม่ได้ส่งข้อมูลเซสชัน (Token / Account ID) กลับมา');
        }

        console.group('[GovSSO Trace] ✅ ยืนยันตัวตนกับ Backend สำเร็จ');
        console.log('Account ID:', accountId);
        setStoredAuth(token, accountId);

        try {
          await refreshMe();
        } catch {
          // ไม่ขัดจังหวะ flow หาก refreshMe ช้า
        }

        const role = result.account?.role || result.user?.role;
        const destination = roleHomePath(role as any);
        console.log('กำลังนำทางไปยังหน้า:', destination, `(Role: ${role})`);
        console.groupEnd();

        setStatus('success');
        setDetailMessage('เข้าสู่ระบบสำเร็จ กำลังนำท่านเข้าสู่ระบบจับจอง...');
        router.replace(destination);
      } catch (err) {
        const message =
          (err as Error)?.message || 'การยืนยันตัวตนกับ Gov Center ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
        console.group('[GovSSO Trace] ❌ เกิดข้อผิดพลาดที่หน้า Callback');
        console.error('Error detail:', err);
        console.log('กำลังนำกลับไปหน้า /login ใน 3.5 วินาที...');
        console.groupEnd();

        setStatus('error');
        setDetailMessage(message);
        setTimeout(() => {
          router.replace('/login');
        }, 3500);
      }
    };

    void runCallback();
  }, [refreshMe, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4 text-ink">
      <div className="w-full max-w-[420px] jw-card p-7 flex flex-col items-center text-center gap-4">
        {status === 'loading' && (
          <div className="w-12 h-12 border-4 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
        )}
        {status === 'success' && (
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl font-bold">
            ✓
          </div>
        )}
        {status === 'error' && (
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-2xl font-bold">
            ✕
          </div>
        )}

        <h1 className="text-[19px] font-bold text-ink">
          {status === 'loading' && 'กำลังตรวจสอบข้อมูล Gov Center SSO'}
          {status === 'success' && 'เข้าสู่ระบบสำเร็จ'}
          {status === 'error' && 'เข้าสู่ระบบไม่สำเร็จ'}
        </h1>

        <p className="text-[13.5px] text-ink-mute leading-relaxed">{detailMessage}</p>

        {status === 'error' && (
          <button
            type="button"
            onClick={() => router.replace('/login')}
            className="mt-2 h-[42px] px-5 rounded-full bg-[#0F766E] hover:bg-[#0D6860] text-white text-[13.5px] font-semibold transition cursor-pointer"
          >
            กลับไปหน้าเข้าสู่ระบบทันที
          </button>
        )}
      </div>
    </div>
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bg text-ink">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-ink-mute">กำลังโหลดหน้ายืนยันตัวตน Gov Center...</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
