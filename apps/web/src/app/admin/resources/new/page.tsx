import { redirect } from 'next/navigation';

/**
 * =====================================================================
 * หน้ารีไดเรกต์เพิ่มทรัพยากรใหม่ (Admin New Resource Redirect Page)
 * =====================================================================
 * เปลี่ยนเส้นทางไปยัง /staff/resources/new เพื่อเปิดฟอร์มเพิ่มสถานที่หรืออุปกรณ์ใหม่
 */
export default function AdminResourcesNewRedirectPage() {
  redirect('/staff/resources/new');
}
