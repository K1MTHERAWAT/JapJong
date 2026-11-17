'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, MessageSquare, QrCode, ShieldCheck } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';

/**
 * Highlights LINE OA/LIFF integration and provides a real interactive
 * QR Verification entry point backed by /verify/[token] and GET /public/verify/:token.
 */
export function LandingTechAndVerify() {
  const router = useRouter();
  const [tokenInput, setTokenInput] = useState('');
  const [inputError, setInputError] = useState('');

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tokenInput.trim();
    const match = /\/verify\/([a-zA-Z0-9_-]+)/.exec(cleaned);
    const token = match ? match[1] : cleaned;

    if (!token) {
      setInputError('กรุณากรอกรหัสยืนยัน เลขที่เอกสาร หรือวางลิงก์จาก QR Code');
      return;
    }

    setInputError('');
    router.push(`/verify/${encodeURIComponent(token)}`);
  };

  return (
    <section
      id="tech"
      className="px-4 py-12 sm:px-6 md:py-16 bg-ground border-t border-line"
    >
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-5">
        {/* LINE OA & LIFF Card */}
        <ScrollReveal direction="left">
          <div className="landing-sleek-card h-full rounded-card bg-surface border border-line p-6 flex flex-col justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 shrink-0 rounded-control bg-ok-bg text-ok-fg flex items-center justify-center">
                <MessageSquare className="size-6" />
              </div>
              <div className="space-y-1.5">
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-brand-tint text-brand-ink text-caption font-semibold">
                  LINE OA &amp; LIFF
                </span>
                <h3 className="text-heading font-bold text-ink">
                  เชื่อมต่อ LINE OA &amp; LIFF เต็มรูปแบบ
                </h3>
                <p className="text-caption text-ink-mute leading-relaxed">
                  ประชาชนเปิดใช้งานผ่าน Rich Menu ในแชท LINE ได้ทันที
                  ไม่ต้องติดตั้งแอปใหม่ พร้อมรับ Flex Message
                  แจ้งเตือนทุกสถานะตั้งแต่ส่งคำขอ อนุมัติ จนถึงกำหนดคืนครุภัณฑ์
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-line flex items-center justify-between">
              <span className="text-caption text-ink-mute">
                รองรับการเข้าสู่ระบบผ่าน LINE และ Gov Center SSO
              </span>
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-caption font-bold text-brand-ink hover:underline shrink-0"
              >
                <span>เข้าสู่ระบบ</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </ScrollReveal>

        {/* Real QR Verification Card */}
        <ScrollReveal direction="right">
          <div className="landing-sleek-card h-full rounded-card bg-surface border border-line p-6 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-ok-bg text-ok-fg text-caption font-semibold">
                  <ShieldCheck className="size-3.5" />
                  <span>QR Verification</span>
                </span>
                <h3 className="text-heading font-bold text-ink">
                  เอกสารราชการ &amp; สแกนยืนยันทันที
                </h3>
                <p className="text-caption text-ink-mute leading-relaxed">
                  ตรวจสอบความถูกต้องของใบอนุญาตจริงจากฐานข้อมูลกลางและลายพิมพ์ดิจิทัล
                  SHA-256 ป้องกันการปลอมแปลงเอกสาร
                </p>
              </div>

              {/* Animated QR Scanner Box */}
              <div
                aria-hidden="true"
                className="relative shrink-0 w-24 h-24 rounded-card border-2 border-brand/50 bg-surface-muted flex items-center justify-center overflow-hidden shadow-inner"
              >
                <QrCode className="size-11 text-ink/75" />
                <div className="landing-qr-laser absolute left-2 right-2 h-0.5 bg-brand shadow-[0_0_8px_rgb(var(--rgb-brand))]" />
              </div>
            </div>

            {/* Quick Public Verification Form */}
            <form onSubmit={handleVerifySubmit} className="space-y-2 pt-2 border-t border-line">
              <div className="flex flex-col sm:flex-row gap-2">
                <label htmlFor="landing-qr-token" className="sr-only">
                  รหัสยืนยัน หรือลิงก์จาก QR Code
                </label>
                <input
                  id="landing-qr-token"
                  type="text"
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    if (inputError) setInputError('');
                  }}
                  placeholder="วางลิงก์ QR หรือกรอกรหัสยืนยันเอกสาร..."
                  className="jw-in flex-1 h-10 text-caption"
                />
                <button
                  type="submit"
                  className="px-4 h-10 rounded-control bg-brand text-white text-caption font-semibold hover:bg-brand-ink transition-colors cursor-pointer shrink-0"
                >
                  ตรวจสอบเอกสาร
                </button>
              </div>
              {inputError && (
                <p className="text-caption text-danger-fg">{inputError}</p>
              )}
              <div className="flex items-center justify-between text-caption">
                <span className="text-ink-mute">
                  ตรวจสอบแบบสาธารณะ ไม่ต้องเข้าสู่ระบบ
                </span>
                <Link
                  href="/verify"
                  className="font-bold text-brand-ink hover:underline"
                >
                  อัปโหลดรูปภาพ QR →
                </Link>
              </div>
            </form>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
