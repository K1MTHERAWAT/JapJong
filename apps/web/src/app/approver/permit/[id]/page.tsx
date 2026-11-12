'use client';

/**
 * =====================================================================
 * หน้าแสดงและพิมพ์ใบอนุญาตราชการดิจิทัล (Official Permit PDF / Print Page)
 * =====================================================================
 * แสดงผลแบบฟอร์มเอกสารทางราชการขนาดมาตรฐาน A4 ที่ได้รับการลงนามครบถ้วนทุกฝ่ายแล้ว
 * พร้อม QR Code และ Verification Token สำหรับตรวจสอบความถูกต้องของเอกสาร (Anti-tampering)
 * มีฟังก์ชันสั่งพิมพ์หรือส่งออกเป็น PDF (Clean Print Stylesheet)
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DocumentVerification, RequestWithTimeline } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell, roleHomePath } from '@/components/shell';
import { OfficialGovFormDocument } from '@/components/ui';
import { api } from '@/lib/api';

export default function PermitPdfPage() {
  // รับค่า id คำขอจาก URL parameters
  const params = useParams<{ id: string }>();
  // ดึงข้อมูลบัญชีเพื่อใช้กำหนดเส้นทางกลับหน้าหลักตามสิทธิ์ (roleHomePath)
  const { account } = useAuth();

  // State ข้อมูลคำขอพร้อมข้อมูลการลงนาม 4 ฝ่าย
  const [req, setReq] = useState<RequestWithTimeline | null>(null);
  // State ข้อมูลโทเคนการตรวจสอบความถูกต้องของเอกสารดิจิทัล
  const [verification, setVerification] = useState<DocumentVerification | null>(null);

  // คำนวณ URL หน้าหลักตามสิทธิ์ของผู้ใช้งาน
  const homeHref = roleHomePath(account?.role);

  // ดึงข้อมูลคำขอและสร้าง/ดึง Verification Token เมื่อโหลดหน้าจอ
  useEffect(() => {
    if (!params.id) return;
    api
      .getRequest(params.id)
      .then(setReq)
      .catch(() => {});

    // เรียก API สร้างโทเคนตรวจสอบเอกสาร (เพื่อนำไปสร้าง QR Code บนเอกสาร)
    api
      .createVerification(params.id)
      .then(setVerification)
      .catch(() => {});
  }, [params.id]);

  // ฟังก์ชันสั่งพิมพ์เอกสารผ่านหน้าต่าง Print ของเบราว์เซอร์
  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    const originalTitle = document.title;
    // ล้าง document.title ชั่วคราวเพื่อป้องกันไม่ให้เบราว์เซอร์พิมพ์ชื่อเว็บและวันที่บนหัวกระดาษ
    document.title = '';

    // ฟังก์ชันคืนค่า document.title เดิมหลังพิมพ์เสร็จ
    const restore = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);

    // เปิดหน้าต่างสั่งพิมพ์ของระบบ
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
          {/* ปุ่มสั่งพิมพ์หรือบันทึกเป็น PDF */}
          <button
            type="button"
            onClick={handlePrint}
            className="jw-btn-sec flex-1 sm:w-44 shadow-xs"
          >
            ดาวน์โหลด PDF / พิมพ์
          </button>
          {/* ปุ่มกลับหน้ารายการหลักตามบทบาท */}
          <Link href={homeHref} className="jw-btn flex-1 sm:w-44">
            กลับรายการ
          </Link>
        </div>
      }
    >
      {/* ภาชนะแสดงผลแบบฟอร์มเอกสารราชการ A4 พร้อมระบบตรวจสอบ QR Code */}
      <div className="w-full flex justify-center py-1 sm:py-3 print:block print:p-0">
        <OfficialGovFormDocument req={req} verification={verification} />
      </div>
    </AppShell>
  );
}
