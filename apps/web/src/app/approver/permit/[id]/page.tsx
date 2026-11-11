'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DocumentVerification, RequestWithTimeline } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell, roleHomePath } from '@/components/shell';
import { OfficialGovFormDocument } from '@/components/ui';
import { api } from '@/lib/api';

export default function PermitPdfPage() {
  const params = useParams<{ id: string }>();
  const { account } = useAuth();
  const [req, setReq] = useState<RequestWithTimeline | null>(null);
  const [verification, setVerification] = useState<DocumentVerification | null>(null);
  const homeHref = roleHomePath(account?.role);

  useEffect(() => {
    if (!params.id) return;
    api
      .getRequest(params.id)
      .then(setReq)
      .catch(() => {});

    api
      .createVerification(params.id)
      .then(setVerification)
      .catch(() => {});
  }, [params.id]);

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    const originalTitle = document.title;
    // ล้าง document.title ชั่วคราวเพื่อป้องกันไม่ให้เบราว์เซอร์พิมพ์ชื่อเว็บและวันที่บนหัวกระดาษ
    document.title = '';

    const restore = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);

    window.print();

    // Fallback ในกรณีที่ afterprint ไม่ทำงานบนบางเบราว์เซอร์
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  return (
    <AppShell
      title="ลงนามครบทุกฝ่ายแล้ว"
      backHref={homeHref}
      maxWidth="max-w-[900px]"
      footer={
        <div className="flex w-full sm:w-auto gap-2.5">
          <button
            type="button"
            onClick={handlePrint}
            className="jw-btn-sec flex-1 sm:w-44 shadow-xs"
          >
            ดาวน์โหลด PDF / พิมพ์
          </button>
          <Link href={homeHref} className="jw-btn flex-1 sm:w-44">
            กลับรายการ
          </Link>
        </div>
      }
    >
      <div className="w-full flex justify-center py-1 sm:py-3 print:block print:p-0">
        <OfficialGovFormDocument req={req} verification={verification} />
      </div>
    </AppShell>
  );
}
