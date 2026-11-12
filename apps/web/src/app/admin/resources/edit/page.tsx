import { redirect } from 'next/navigation';

/**
 * =====================================================================
 * หน้ารีไดเรกต์แก้ไขทรัพยากร (Admin Edit Resource Redirect Page)
 * =====================================================================
 * เปลี่ยนเส้นทางไปยัง /staff/resources/edit เพื่อเปิดฟอร์มแก้ไขข้อมูลทรัพยากร
 */
export default function AdminResourcesEditRedirectPage() {
  redirect('/staff/resources/edit');
}
