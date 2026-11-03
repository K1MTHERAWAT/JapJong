'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth-context';
import { roleHomePath } from '@/components/shell';
import { Icon } from '@/components/icons';
import { api, setStoredAuth } from '@/lib/api';

function LineRegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticket = searchParams.get('ticket') || '';
  const { refreshMe } = useAuth();

  const [loading, setLoading] = useState(true);
  const [ticketError, setTicketError] = useState('');
  const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string | null } | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // PDPA Consents (Unchecked by default)
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);

  const [showPrivacyDetail, setShowPrivacyDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ticket) {
      setTicketError('ไม่พบ Registration Ticket กรุณาเข้าสู่ระบบด้วย LINE ใหม่อีกครั้ง');
      setLoading(false);
      return;
    }

    api
      .getLineRegistrationStatus(ticket)
      .then((res) => {
        if (!res.valid) {
          setTicketError(res.error || 'Registration Ticket หมดอายุหรือไม่ถูกต้อง');
        } else {
          setLineProfile(res.lineProfile || null);
          if (res.lineProfile?.displayName) {
            setName(res.lineProfile.displayName);
          }
        }
      })
      .catch((err) => {
        setTicketError(err.message || 'ไม่สามารถตรวจสอบสถานะการลงทะเบียนได้');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [ticket]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรุณากรอกชื่อ-นามสกุล');
      return;
    }
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (!/^0[689]\d{8}$/.test(cleanPhone)) {
      setError('เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 06, 08 หรือ 09 และมีความยาว 10 หลัก');
      return;
    }
    if (!consentTerms || !consentPrivacy) {
      setError('กรุณายินยอมข้อกำหนดและนโยบายความเป็นส่วนตัว (PDPA) ที่จำเป็นก่อนลงทะเบียน');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const res = await api.registerWithLine({
        ticket,
        name: name.trim(),
        phone: cleanPhone,
        consents: [
          {
            consentType: 'TERMS_OF_SERVICE',
            consentVersion: '1.0.0',
            agreed: consentTerms,
          },
          {
            consentType: 'PRIVACY_POLICY',
            consentVersion: '1.0.0',
            agreed: consentPrivacy,
          },
          {
            consentType: 'MARKETING',
            consentVersion: '1.0.0',
            agreed: consentMarketing,
          },
        ],
      });

      setStoredAuth(res.token, res.account.id);
      await refreshMe();
      router.push(roleHomePath(res.account.role));
    } catch (err) {
      setError((err as Error).message || 'การลงทะเบียนไม่สำเร็จ');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="jw-card p-8 text-center max-w-md w-full flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-[14px] text-ink-mute">กำลังตรวจสอบข้อมูลบัญชี LINE...</p>
        </div>
      </div>
    );
  }

  if (ticketError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="jw-card p-8 text-center max-w-md w-full flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-status-crit/15 flex items-center justify-center text-status-crit">
            <Icon name="alert-triangle" className="w-6 h-6" />
          </div>
          <h2 className="text-[18px] font-bold text-ink">ไม่สามารถดำเนินการต่อได้</h2>
          <p className="text-[13.5px] text-ink-mute leading-relaxed">{ticketError}</p>
          <Link href="/login" className="jw-btn w-full mt-2">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[620px] flex flex-col gap-5">
        {/* หัวข้อและข้อมูลโปรไฟล์ LINE */}
        <div className="jw-card p-6 sm:p-7 flex flex-col gap-4">
          <div className="flex items-center gap-3.5 pb-4 border-b border-line">
            {lineProfile?.pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lineProfile.pictureUrl}
                alt="LINE Profile"
                className="w-14 h-14 rounded-full border border-line object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#06C755]/15 text-[#06C755] flex items-center justify-center font-bold text-[18px]">
                {lineProfile?.displayName?.slice(0, 2) || 'LINE'}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[#06C755] bg-[#06C755]/10 px-2 py-0.5 rounded-full">
                  LINE Verified
                </span>
                <span className="text-[12px] text-ink-mute">ลงทะเบียนครั้งแรก</span>
              </div>
              <h1 className="text-[20px] font-bold text-ink mt-0.5">
                ยินดีต้อนรับ, {lineProfile?.displayName || 'ผู้ใช้งาน LINE'}
              </h1>
              <p className="text-[13px] text-ink-mute">
                กรุณาระบุข้อมูลเพิ่มเติมและให้ความยินยอมเพื่อเริ่มใช้งานระบบ Jongwen
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="jw-lbl">
                ชื่อ - นามสกุลจริง <span className="text-status-crit">*</span>
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
              <label className="jw-lbl">
                เบอร์โทรศัพท์มือถือ <span className="text-status-crit">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="เช่น 0812345678"
                maxLength={10}
                className="jw-in"
                required
              />
              <span className="text-[12px] text-ink-mute mt-1 block">
                ใช้สำหรับติดต่อประสานงานเกี่ยวกับการขอใช้สถานที่หรืออุปกรณ์
              </span>
            </div>

            {/* ส่วน PDPA Consent */}
            <div className="rounded-2xl border border-line p-4 bg-paper/50 flex flex-col gap-3 mt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="shield-check" className="w-5 h-5 text-brand" />
                  <span className="text-[14px] font-bold text-ink">
                    นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrivacyDetail((v) => !v)}
                  className="text-[12px] text-brand hover:underline font-semibold"
                >
                  {showPrivacyDetail ? 'ซ่อนรายละเอียด' : 'อ่านรายละเอียด'}
                </button>
              </div>

              {showPrivacyDetail && (
                <div className="text-[12.5px] text-ink-mute leading-relaxed bg-white p-3.5 rounded-xl border border-line flex flex-col gap-2 max-h-[160px] overflow-y-auto">
                  <b className="text-ink">วัตถุประสงค์การเก็บรวบรวมและใช้ข้อมูลส่วนบุคคล:</b>
                  <p>
                    1. องค์การบริหารส่วนตำบลน้ำชำ จัดเก็บข้อมูล ชื่อ-นามสกุล เบอร์โทรศัพท์ และข้อมูลโปรไฟล์ LINE ของท่านเพื่อวัตถุประสงค์ในการยืนยันตัวบุคคลในการขอใช้สถานที่ การยืม-คืนอุปกรณ์ และการแจ้งซ่อมแซม
                  </p>
                  <p>
                    2. การประมวลผลข้อมูลดำเนินการภายใต้ฐานความยินยอมและฐานการปฏิบัติหน้าที่ตามภารกิจของหน่วยงานรัฐ (Public Task)
                  </p>
                  <p>
                    3. ท่านมีสิทธิตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 ในการเข้าถึง แก้ไข ลบ หรือถอนความยินยอมที่ให้ไว้
                  </p>
                </div>
              )}

              {/* ข้อกำหนดจำเป็น 1 */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none text-[13px] text-ink pt-1">
                <input
                  type="checkbox"
                  checked={consentTerms}
                  onChange={(e) => setConsentTerms(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-line text-brand focus:ring-brand accent-brand"
                />
                <span className="leading-snug">
                  <span className="text-status-crit font-bold">[จำเป็น]</span> ข้าพเจ้ายอมรับ{' '}
                  <span className="font-semibold underline">ข้อกำหนดและเงื่อนไขการให้บริการ</span> ของระบบ Jongwen
                </span>
              </label>

              {/* ข้อกำหนดจำเป็น 2 */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none text-[13px] text-ink">
                <input
                  type="checkbox"
                  checked={consentPrivacy}
                  onChange={(e) => setConsentPrivacy(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-line text-brand focus:ring-brand accent-brand"
                />
                <span className="leading-snug">
                  <span className="text-status-crit font-bold">[จำเป็น]</span> ข้าพเจ้ายินยอมให้จัดเก็บ ใช้ และเปิดเผยข้อมูลส่วนบุคคลตาม{' '}
                  <span className="font-semibold underline">ประกาศความเป็นส่วนตัว (Privacy Notice)</span>
                </span>
              </label>

              {/* ข้อกำหนดเพิ่มเติม (ไม่บังคับ) */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none text-[13px] text-ink-mute">
                <input
                  type="checkbox"
                  checked={consentMarketing}
                  onChange={(e) => setConsentMarketing(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-line text-brand focus:ring-brand accent-brand"
                />
                <span className="leading-snug">
                  [เพิ่มเติม] ยินยอมให้รับข้อมูลข่าวสาร ประชาสัมพันธ์กิจกรรม และการแจ้งเตือนจากทางหน่วยงาน
                </span>
              </label>
            </div>

            {error && (
              <div className="rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-3.5 py-2.5 text-[13px] text-[#7a1010] flex items-center gap-2">
                <Icon name="x" className="w-4 h-4 text-status-crit shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !consentTerms || !consentPrivacy || !name.trim() || !phone.trim()}
              className="jw-btn w-full h-[48px] text-[15px] font-bold disabled:opacity-50 mt-1 cursor-pointer"
            >
              {submitting ? 'กำลังบันทึกข้อมูล...' : 'ยืนยันการลงทะเบียน'}
            </button>
          </form>
        </div>

        <div className="text-center text-[12.5px] text-ink-mute">
          มีบัญชีเดิมอยู่แล้ว?{' '}
          <Link href="/login" className="font-bold text-ink hover:underline">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LineRegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LineRegisterContent />
    </Suspense>
  );
}

