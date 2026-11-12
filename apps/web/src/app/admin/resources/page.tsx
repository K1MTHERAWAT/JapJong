import { redirect } from 'next/navigation';

/**
 * =====================================================================
 * หน้ารีไดเรกต์จัดการทรัพยากรสำหรับแอดมิน (Admin Resources Redirect Page)
 * =====================================================================
 * เปลี่ยนเส้นทางจาก /admin/resources ไปยัง /staff/resources ซึ่งเป็นหน้าศูนย์รวม
 * การจัดการทรัพยากรสถานที่ ครุภัณฑ์ และแบบฟอร์มหลักของระบบ
 */
export default function AdminResourcesRedirectPage() {
  redirect('/staff/resources');
}
