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

  return (
    <AppShell
      title="ลงนามครบทุกฝ่ายแล้ว"
      backHref={homeHref}
      maxWidth="max-w-[900px]"
      footer={
        <div className="flex w-full sm:w-auto gap-2.5">
          <button
            type="button"
            onClick={() => typeof window !== 'undefined' && window.print()}
            className="jw-btn-sec flex-1 sm:w-44"
          >
            ดาวน์โหลด PDF
          </button>
          <Link href={homeHref} className="jw-btn flex-1 sm:w-44">
            กลับรายการ
          </Link>
        </div>
      }
    >
      <div className="print:block">
        <OfficialGovFormDocument req={req} verification={verification} />
      </div>
    </AppShell>
  );
}
