'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getStoredToken, setStoredAuth } from '../../lib/api';
import { getLiffIdToken, initLiff, loginWithLiff, resolveLiffTarget } from '../../lib/liff';
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, LogIn } from 'lucide-react';

function LiffAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [target, setTarget] = useState(() =>
    resolveLiffTarget(searchParams, typeof window !== 'undefined' ? window.location.href : null),
  );

  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('กำลังเชื่อมต่อระบบจับจอง (JapJong)...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function handleLiffAuth() {
      try {
        // ดึงค่า target ที่ถูกต้องที่สุดเสมอ (รองรับทั้ง target, redirect, และ liff.state)
        let effectiveTarget = resolveLiffTarget(
          searchParams,
          typeof window !== 'undefined' ? window.location.href : null,
        );
        if (effectiveTarget !== '/' && isMounted) {
          setTarget(effectiveTarget);
        }

        // 1. ถ้ามี Session ในเครื่องอยู่แล้ว ให้เดินทางไปยังหน้าเป้าหมายได้ทันที
        const existingToken = getStoredToken();
        if (existingToken) {
          if (isMounted) {
            setStatusMessage('พบเซสชันการใช้งานเดิม กำลังนำท่านเข้าสู่ระบบ...');
            setTimeout(() => {
              router.replace(effectiveTarget);
            }, 300);
          }
          return;
        }

        // 2. ดึงค่า Config ของ LIFF จาก Backend (เผื่อ Frontend ยังไม่มีค่าใน env)
        let liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          try {
            const config = await api.getLiffConfig();
            if (config.liffId) {
              liffId = config.liffId;
            }
          } catch {
            // ignore network error for config
          }
        }

        setStatusMessage('กำลังเริ่มต้นการเชื่อมต่อ LINE Front-end Framework (LIFF)...');
        const liffRes = await initLiff(liffId || undefined);

        // ตรวจสอบ target อีกครั้งหลัง initLiff (เผื่อ LIFF SDK ได้ unpack liff.state ลงใน window.location แล้ว)
        const postInitTarget = resolveLiffTarget(
          null,
          typeof window !== 'undefined' ? window.location.href : null,
        );
        if (postInitTarget !== '/') {
          effectiveTarget = postInitTarget;
          if (isMounted) setTarget(postInitTarget);
        }

        if (!liffRes.ok) {
          if (isMounted) {
            setErrorMessage(
              liffRes.error ||
                'ไม่สามารถเริ่มต้นระบบ LIFF ได้ กรุณาเปิดผ่าน LINE Application หรือเข้าสู่ระบบผ่านเว็บปกติ',
            );
            setLoading(false);
          }
          return;
        }

        // 3. ตรวจสอบสถานะการเข้าสู่ระบบใน LINE
        if (!liffRes.isLoggedIn) {
          if (isMounted) {
            setStatusMessage('กำลังนำท่านไปยังหน้ายืนยันตัวตน LINE...');
          }
          loginWithLiff(window.location.href);
          return;
        }

        // 4. ดึง LINE ID Token
        setStatusMessage('กำลังตรวจสอบสิทธิ์ความปลอดภัยกับเซิร์ฟเวอร์...');
        const idToken = await getLiffIdToken();

        if (!idToken) {
          if (isMounted) {
            setErrorMessage('ไม่สามารถดึงข้อมูล ID Token จาก LINE ได้ กรุณาลองใหม่อีกครั้ง');
            setLoading(false);
          }
          return;
        }

        // 5. ส่ง ID Token ไปยัง Backend เพื่อ Verify และสร้าง Session
        const authRes = await api.authLiff(idToken);

        if (authRes.status === 'AUTHENTICATED' && authRes.token && authRes.account) {
          setStoredAuth(authRes.token, authRes.account.id);
          if (isMounted) {
            setStatusMessage(`ยินดีต้อนรับคุณ ${authRes.account.name || 'ผู้ใช้งาน'}`);
            setTimeout(() => {
              router.replace(effectiveTarget);
            }, 400);
          }
        } else if (authRes.status === 'NEW_USER' && authRes.ticket) {
          if (isMounted) {
            setIsNewUser(true);
            setTicket(authRes.ticket);
            setStatusMessage('พบว่าท่านเข้าใช้งานครั้งแรก กำลังนำท่านไปยังหน้าลงทะเบียน...');
            setTimeout(() => {
              router.replace(
                `/register/line?ticket=${encodeURIComponent(authRes.ticket!)}&target=${encodeURIComponent(effectiveTarget)}`,
              );
            }, 600);
          }
        } else {
          if (isMounted) {
            setErrorMessage('การยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
            setLoading(false);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          const msg =
            err?.message ||
            err?.error ||
            'เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง';
          setErrorMessage(msg);
          setLoading(false);
        }
      }
    }

    handleLiffAuth();

    return () => {
      isMounted = false;
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 sm:p-8 text-center">
        {/* Brand Header */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            จ
          </div>
          <div className="text-left">
            <h1 className="text-xl font-bold text-slate-800 leading-tight">จับจอง</h1>
            <p className="text-xs text-slate-500">ระบบบริการดิจิทัล (JapJong LIFF)</p>
          </div>
        </div>

        {/* State Displays */}
        {loading && (
          <div className="py-8 flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
            <p className="text-sm font-medium text-slate-700">{statusMessage}</p>
            <p className="text-xs text-slate-400 mt-2">โปรดรอสักครู่ ระบบกำลังจัดเตรียมข้อมูล...</p>
          </div>
        )}

        {!loading && isNewUser && ticket && (
          <div className="py-6 flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-1">ยินดีต้อนรับผู้ใช้งานใหม่</h2>
            <p className="text-sm text-slate-600 mb-6">
              กำลังนำท่านไปยังหน้ากรอกข้อมูลและยอมรับนโยบายความเป็นส่วนตัว (PDPA)
            </p>
            <a
              href={`/register/line?ticket=${encodeURIComponent(ticket)}&target=${encodeURIComponent(target)}`}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              ดำเนินการต่อ <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}

        {!loading && errorMessage && (
          <div className="py-6 flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="text-base font-semibold text-slate-800 mb-2">ไม่สามารถเข้าสู่ระบบผ่าน LIFF ได้</h2>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              {errorMessage}
            </p>

            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm transition-colors shadow-sm"
              >
                ลองใหม่อีกครั้ง
              </button>

              <a
                href={`/login?redirect=${encodeURIComponent(target)}`}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <LogIn className="w-4 h-4" /> เข้าสู่ระบบผ่านหน้าเว็บทั่วไป
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <p className="text-xs text-slate-400 mt-6 text-center">
        ระบบบริหารจัดการขอใช้สถานที่ ขอใช้อุปกรณ์ และแจ้งซ่อมบำรุง
      </p>
    </div>
  );
}

export default function LiffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      }
    >
      <LiffAuthContent />
    </Suspense>
  );
}

