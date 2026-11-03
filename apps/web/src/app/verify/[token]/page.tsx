'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  PublicVerificationResult,
  VERIFICATION_DOC_TYPE_LABEL,
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_STATUS_TONE,
} from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip } from '@/components/ui';
import { api, formatThaiDateTime } from '@/lib/api';

export default function PublicVerifyPage() {
  const params = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<PublicVerificationResult | null>(null);

  useEffect(() => {
    if (!params.token) return;
    setLoading(true);
    api
      .publicVerify(params.token)
      .then(setResult)
      .catch(() => {
        setResult({
          status: 'INVALID',
          message: 'เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์ตรวจสอบเอกสาร',
        });
      })
      .finally(() => setLoading(false));
  }, [params.token]);

  const status = result?.status || 'NOT_FOUND';
  const tone = VERIFICATION_STATUS_TONE[status];

  return (
    <AppShell
      title="ตรวจสอบเอกสารทางราชการ"
      backHref="/"
      maxWidth="max-w-[720px]"
    >
      <div className="flex flex-col gap-5">
        {/* หัวกระดาษตรารับรองทางการ */}
        <div className="jw-card p-6 sm:p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-mint text-brand flex items-center justify-center mb-3 shadow-xs">
            <Icon name="shield-check" className="w-8 h-8" />
          </div>
          <h2 className="text-[19px] sm:text-[21px] font-bold text-ink">
            ระบบตรวจสอบความถูกต้องเอกสาร (QR Code Verification)
          </h2>
          <p className="text-[13.5px] text-ink-mute mt-1">
            องค์การบริหารส่วนตำบล (อบต.)
          </p>
        </div>

        {/* แสดงผลการตรวจสอบ */}
        {loading ? (
          <div className="jw-card p-10 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[14px] text-ink-mute">กำลังตรวจสอบลายมือชื่อและรหัสเอกสารดิจิทัล...</span>
          </div>
        ) : (
          <div className="jw-card p-6 sm:p-8 flex flex-col gap-6">
            {/* ป้ายสถานะหลัก */}
            <div
              className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                status === 'VALID'
                  ? 'bg-[#F2FBF6] border-[#A3E5C1]'
                  : status === 'REVOKED'
                  ? 'bg-[#FFF9EC] border-[#FDE3A7]'
                  : 'bg-[#FFF2F2] border-[#F9C2C2]'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    status === 'VALID'
                      ? 'bg-status-act text-white'
                      : status === 'REVOKED'
                      ? 'bg-status-amber text-white'
                      : 'bg-status-crit text-white'
                  }`}
                >
                  <Icon
                    name={status === 'VALID' ? 'check' : status === 'REVOKED' ? 'clock' : 'x'}
                    className="w-6 h-6"
                  />
                </div>
                <div>
                  <b className="text-[17px] text-ink block">
                    {VERIFICATION_STATUS_LABEL[status]}
                  </b>
                  <span className="text-[13px] text-ink-mute">
                    {result?.message || 'ผลการตรวจสอบจากฐานข้อมูลระบบราชการ'}
                  </span>
                </div>
              </div>

              <div className="shrink-0">
                <Chip tone={tone}>
                  {status === 'VALID'
                    ? 'เอกสารสมบูรณ์'
                    : status === 'REVOKED'
                    ? 'ยกเลิกแล้ว'
                    : 'ไม่ถูกต้อง'}
                </Chip>
              </div>
            </div>

            {/* รายละเอียดเอกสาร */}
            {status !== 'NOT_FOUND' && result?.documentNumber && (
              <div className="flex flex-col gap-3 text-[14px]">
                <h3 className="font-bold text-ink border-b border-line pb-2">
                  ข้อมูลเอกสารที่ตรวจสอบ
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="bg-soft/70 p-3.5 rounded-xl flex flex-col gap-1">
                    <span className="text-[12px] text-ink-mute font-medium">เลขที่เอกสาร</span>
                    <b className="text-[15px] text-ink font-mono">{result.documentNumber}</b>
                  </div>

                  <div className="bg-soft/70 p-3.5 rounded-xl flex flex-col gap-1">
                    <span className="text-[12px] text-ink-mute font-medium">ประเภทเอกสาร</span>
                    <b className="text-[15px] text-ink">
                      {result.documentType ? VERIFICATION_DOC_TYPE_LABEL[result.documentType] : result.title}
                    </b>
                  </div>

                  <div className="bg-soft/70 p-3.5 rounded-xl flex flex-col gap-1">
                    <span className="text-[12px] text-ink-mute font-medium">หน่วยงานผู้ออกเอกสาร</span>
                    <b className="text-[15px] text-ink">{result.issuingOrg || 'องค์การบริหารส่วนตำบล (อบต.)'}</b>
                  </div>

                  <div className="bg-soft/70 p-3.5 rounded-xl flex flex-col gap-1">
                    <span className="text-[12px] text-ink-mute font-medium">วันที่ออกเอกสาร</span>
                    <b className="text-[15px] text-ink">{formatThaiDateTime(result.issuedAt, true)}</b>
                  </div>

                  {result.revokedAt && (
                    <div className="bg-[#FFF4E8] p-3.5 rounded-xl flex flex-col gap-1 sm:col-span-2">
                      <span className="text-[12px] text-status-amber font-semibold">วัน-เวลาที่ยกเลิกเอกสาร</span>
                      <b className="text-[14px] text-ink">{formatThaiDateTime(result.revokedAt, true)}</b>
                    </div>
                  )}

                  {result.documentHash && (
                    <div className="bg-soft/70 p-3.5 rounded-xl flex flex-col gap-1 sm:col-span-2">
                      <span className="text-[12px] text-ink-mute font-medium">รหัสลายพิมพ์ดิจิทัล (SHA-256 Hash)</span>
                      <code className="text-[11px] font-mono break-all text-ink-ph bg-white px-2 py-1.5 rounded-lg border border-line">
                        {result.documentHash}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ข้อความกำกับความปลอดภัย */}
            <div className="p-4 rounded-xl bg-soft text-[12.5px] text-ink-mute leading-relaxed border border-line flex items-start gap-2.5">
              <Icon name="shield-check" className="w-4 h-4 text-brand shrink-0 mt-0.5" />
              <span>
                ข้อมูลนี้ดึงสดจากระบบฐานข้อมูลกลาง อบต. เพื่อคุ้มครองข้อมูลส่วนบุคคล (PDPA)
                ระบบจะไม่แสดงเลขประจำตัวประชาชนหรือเบอร์โทรศัพท์ผ่านหน้าตรวจสอบสาธารณะนี้
              </span>
            </div>

            <div className="pt-2 flex justify-center">
              <Link href="/" className="jw-btn w-full sm:w-auto px-8">
                กลับสู่หน้าหลักระบบ
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
