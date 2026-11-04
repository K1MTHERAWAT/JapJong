'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SsoCallbackHandler, type SsoCallbackResult } from 'gov-sso-login';
import { setStoredAuth } from '@/lib/api';
import { roleHomePath } from '@/components/shell';
import { useAuth } from '@/components/auth-context';
import { logGovSsoDiagnostic, ssoConfig } from '@/lib/sso-config';

function CallbackContent() {
  const router = useRouter();
  const { refreshMe } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const savedState = sessionStorage.getItem('gov_sso_state');
    logGovSsoDiagnostic('เข้าสู่หน้า /auth/callback');
    console.group('[GovSSO Trace] 📥 พารามิเตอร์ที่ได้รับกลับมาจาก Gov Center');
    console.log('Full URL:', window.location.href);
    console.log('code:', params.get('code') ? `${params.get('code')?.slice(0, 10)}...` : null);
    console.log('service:', params.get('service'));
    console.log('state (จาก URL):', params.get('state'));
    console.log('state (ใน sessionStorage):', savedState);
    console.log('is_new_user:', params.get('is_new_user'));
    console.log('error:', params.get('error'));
    console.log('API ปลายทางที่จะส่งไปตรวจสอบ:', `${ssoConfig.apiBaseUrl}${ssoConfig.ssoCallbackPath}`);
    console.groupEnd();
  }, []);

  const handleSuccess = async (result: SsoCallbackResult) => {
    console.group('[GovSSO Trace] ✅ ยืนยันตัวตนกับ Backend สำเร็จ (handleSuccess)');
    console.log('Result:', result);
    const token = result.token;
    const accountId = result.account?.id || result.user?.id;
    if (token && accountId) {
      setStoredAuth(token, accountId);
      console.log('บันทึก Token และ Account ID ลง Storage เรียบร้อย:', { accountId });
    }

    try {
      await refreshMe();
    } catch {
      // ไม่ขัดจังหวะ flow หาก refreshMe ช้า
    }

    const role = result.account?.role || result.user?.role;
    const destination = roleHomePath(role as any);
    console.log('กำลังนำทางไปยังหน้า:', destination, `(Role: ${role})`);
    console.groupEnd();
    router.replace(destination);
  };

  const handleError = (error: Error) => {
    console.group('[GovSSO Trace] ❌ เกิดข้อผิดพลาดที่หน้า Callback (handleError)');
    console.error('Error detail:', error);
    console.log('กำลังนำกลับไปหน้า /login ใน 3.5 วินาที...');
    console.groupEnd();
    setTimeout(() => {
      router.replace('/login');
    }, 3500);
  };

  return (
    <SsoCallbackHandler
      onSuccess={handleSuccess}
      onError={handleError}
      loadingMessage="กำลังยืนยันตัวตนกับ Gov Center SSO..."
      successMessage="เข้าสู่ระบบสำเร็จ กำลังนำท่านเข้าสู่ระบบจับจอง..."
      errorMessage="การยืนยันตัวตนกับ Gov Center ไม่สำเร็จ กำลังนำกลับไปหน้าล็อกอิน..."
      theme={{
        primaryColor: '#0F766E',
        borderRadius: '1rem',
      }}
    />
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

