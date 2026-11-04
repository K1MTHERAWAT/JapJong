'use client';

import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { SsoCallbackHandler, type SsoCallbackResult } from 'gov-sso-login';
import { setStoredAuth } from '@/lib/api';
import { roleHomePath } from '@/components/shell';
import { useAuth } from '@/components/auth-context';

function CallbackContent() {
  const router = useRouter();
  const { refreshMe } = useAuth();

  const handleSuccess = async (result: SsoCallbackResult) => {
    const token = result.token;
    const accountId = result.account?.id || result.user?.id;
    if (token && accountId) {
      setStoredAuth(token, accountId);
    }

    try {
      await refreshMe();
    } catch {
      // ไม่ขัดจังหวะ flow หาก refreshMe ช้า
    }

    const role = result.account?.role || result.user?.role;
    const destination = roleHomePath(role as any);
    router.replace(destination);
  };

  const handleError = (error: Error) => {
    console.error('Gov SSO callback error:', error);
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

