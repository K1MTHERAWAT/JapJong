'use client'; // กำหนดให้คอมโพเนนต์นี้ทำงานในฝั่ง Client (React Client Component)

// นำเข้า React Hooks พื้นฐานสำหรับจัดการ State และ Side Effects
import React, { useEffect, useState } from 'react';
// นำเข้า Link สำหรับการเปลี่ยนหน้าภายในระบบ Next.js
import Link from 'next/link';
// นำเข้าไอคอนจากไลบรารี lucide-react สำหรับหน้าจัดการ LINE
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Eye,
  Layers,
  LayoutGrid,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Smartphone,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
// นำเข้า AppShell คอมโพเนนต์เลย์เอาต์หลักของแอปพลิเคชัน
import { AppShell } from '@/components/shell';
// นำเข้าคอมโพเนนต์ UI พื้นฐาน: Button, Card, Chip, Feedback
import { Button, Card, Chip, Feedback } from '@/components/ui';
// นำเข้า API client SDK และฟังก์ชันจัดรูปแบบวันเวลาภาษาไทย
import { api, formatThaiDateTime } from '@/lib/api';

/**
 * โครงสร้างข้อมูล Action ในแต่ละช่องของ Rich Menu (เช่น ลิงก์ URL, ส่งข้อความ, หรือ Postback)
 */
interface RichMenuAction {
  id: string; // รหัสอ้างอิง Action
  sortOrder: number; // ลำดับช่อง
  label: string; // ข้อความป้ายกำกับของปุ่ม
  actionType: 'URI' | 'MESSAGE' | 'POSTBACK'; // ประเภทการทำงานเมื่อกด
  actionData: string; // ข้อมูลคำสั่ง เช่น URL ปลายทาง หรือข้อความที่ส่ง
  area: { x: number; y: number; width: number; height: number }; // พิกัดสี่เหลี่ยมบนภาพ Rich Menu
}

/**
 * โครงสร้างข้อมูลแบบจำลอง Rich Menu
 */
interface RichMenu {
  id: string; // รหัสประจำตัวในฐานข้อมูลของระบบ
  name: string; // ชื่อเมนู (แสดงในระบบ)
  menuType: 'CITIZEN' | 'STAFF' | 'ADMIN' | 'DEFAULT' | 'CUSTOM'; // กลุ่มผู้ใช้งานเป้าหมาย
  lineRichMenuId: string | null; // รหัส ID ที่ได้รับจาก LINE Messaging API หลังเผยแพร่
  chatBarText: string; // ข้อความบนแถบเปิด/ปิดเมนูด้านล่างห้องแชท
  width: number; // ความกว้างของภาพ (มาตรฐาน 2500px)
  height: number; // ความสูงของภาพ (มาตรฐาน 1686px)
  imageData?: string | null; // ข้อมูลภาพแบบ Base64
  imageMimeType?: string | null; // ประเภทไฟล์ภาพ เช่น image/png
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; // สถานะเมนู
  isDefault: boolean; // เป็นเมนูเริ่มต้นของ LINE OA หรือไม่
  publishedAt: string | null; // วันเวลาที่เผยแพร่ขึ้น LINE
  createdAt: string; // วันที่สร้าง
  updatedAt: string; // วันที่แก้ไขล่าสุด
  actions: RichMenuAction[]; // รายการปุ่ม Action ทั้งหมดบนผังเมนู
}

/**
 * รายการประเภทเหตุการณ์การแจ้งเตือน (Notification Events) แบ่งตามหมวดหมู่
 * สำหรับนำไปใช้เลือกปรับแต่งและทดสอบพรีวิว Flex Message
 */
const EVENT_CATEGORIES = [
  {
    category: 'Booking (ขอใช้สถานที่)',
    events: [
      { id: 'BOOKING_SUBMITTED', label: 'ยื่นคำขอจองสำเร็จ' },
      { id: 'BOOKING_IN_REVIEW', label: 'เจ้าหน้าที่รับเรื่องแล้ว' },
      { id: 'BOOKING_NEED_MORE_INFO', label: 'ขอข้อมูลเพิ่มเติม' },
      { id: 'BOOKING_APPROVED', label: 'คำขอได้รับการอนุมัติ' },
      { id: 'BOOKING_REJECTED', label: 'คำขอถูกปฏิเสธ' },
      { id: 'BOOKING_REMINDER', label: 'แจ้งเตือนก่อนวันใช้งาน' },
      { id: 'SIGNING_PENDING', label: 'เอกสารรอลงนาม' },
      { id: 'SIGNING_COMPLETED', label: 'ลงนามเรียบร้อย' },
      { id: 'SIGNING_FULLY_APPROVED', label: 'เอกสารพร้อมดาวน์โหลด' },
    ],
  },
  {
    category: 'Borrow (ยืม-คืนอุปกรณ์)',
    events: [
      { id: 'BORROW_SUBMITTED', label: 'ยื่นคำขอยืมอุปกรณ์สำเร็จ' },
      { id: 'BORROW_IN_REVIEW', label: 'เจ้าหน้าที่รับเรื่องตรวจสอบ' },
      { id: 'BORROW_APPROVED', label: 'คำขอยืมได้รับการอนุมัติ' },
      { id: 'BORROW_REJECTED', label: 'คำขอยืมถูกปฏิเสธ' },
      { id: 'BORROW_PICKUP_REMINDER', label: 'แจ้งเตือนวันรับอุปกรณ์' },
      { id: 'BORROW_RETURN_REMINDER', label: 'แจ้งเตือนกำหนดคืนอุปกรณ์' },
      { id: 'BORROW_OVERDUE', label: 'แจ้งเตือนเกินกำหนดคืน' },
      { id: 'BORROW_RETURNED', label: 'ยืนยันการคืนอุปกรณ์เรียบร้อย' },
    ],
  },
  {
    category: 'Maintenance (แจ้งซ่อมบำรุง)',
    events: [
      { id: 'REPAIR_SUBMITTED', label: 'รับแจ้งปัญหาเรียบร้อย' },
      { id: 'REPAIR_ACCEPTED', label: 'เจ้าหน้าที่รับเรื่องซ่อม' },
      { id: 'REPAIR_IN_PROGRESS', label: 'อยู่ระหว่างดำเนินการซ่อม' },
      { id: 'REPAIR_NEED_MORE_INFO', label: 'ขอข้อมูลเพิ่มเติม' },
      { id: 'REPAIR_FINISHED', label: 'ซ่อมบำรุงเสร็จสิ้น' },
      { id: 'REPAIR_DONE', label: 'ประชาชนตรวจรับงานซ่อมแล้ว' },
      { id: 'REPAIR_REJECTED', label: 'ไม่สามารถดำเนินการซ่อมได้' },
    ],
  },
  {
    category: 'Staff Operations (งานเจ้าหน้าที่)',
    events: [
      { id: 'STAFF_NEW_BOOKING', label: 'มีคำขอจองสถานที่ใหม่' },
      { id: 'STAFF_NEW_BORROW', label: 'มีคำขอยืมอุปกรณ์ใหม่' },
      { id: 'STAFF_NEW_REPAIR', label: 'มีแจ้งซ่อมบำรุงใหม่' },
      { id: 'STAFF_SIGNING_REQUIRED', label: 'มีเอกสารรอลงนามอนุมัติ' },
      { id: 'STAFF_BORROW_OVERDUE', label: 'มีอุปกรณ์เกินกำหนดคืน' },
    ],
  },
];

/**
 * หน้าจอจัดการ LINE Official Account, Rich Menu และ Flex Message สำหรับผู้ดูแลระบบ
 * รองรับการจัดการ Rich Menu แบบแยกร่างตามบทบาทผู้ใช้, ปรับแต่ง Flex Message พร้อมพรีวิวสด, และทดสอบระบบสลับเมนู
 */
export default function AdminLinePage() {
  // State แท็บหลัก: 'menus' (จัดการ Rich Menu), 'flex' (ปรับแต่ง Flex Message), 'switching' (ทดสอบสลับเมนู)
  const [activeTab, setActiveTab] = useState<'menus' | 'flex' | 'switching'>('menus');
  // State รายการ Rich Menu ทั้งหมดในระบบ
  const [menus, setMenus] = useState<RichMenu[]>([]);
  // State Rich Menu ที่กำลังถูกเลือกดูรายละเอียดและพรีวิว
  const [selectedMenu, setSelectedMenu] = useState<RichMenu | null>(null);
  // State กำลังโหลดข้อมูลเริ่มต้น
  const [loading, setLoading] = useState(true);
  // State กำลังประมวลผลคำสั่ง (เช่น เผยแพร่, อัปโหลดภาพ)
  const [actionLoading, setActionLoading] = useState(false);
  // State แสดงข้อความแจ้งเตือนผลลัพธ์ (สำเร็จ/ล้มเหลว)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // --- Flex Message State: การปรับแต่งและการพรีวิว Flex Message Card ---
  const [selectedEvent, setSelectedEvent] = useState<string>('BOOKING_APPROVED'); // เหตุการณ์ที่เลือกปรับแต่ง
  const [previewData, setPreviewData] = useState<any>(null); // ข้อมูลจำลองสำหรับแสดงตัวอย่าง
  const [flexHeadline, setFlexHeadline] = useState(''); // ข้อความหัวเรื่องหลักที่กำหนดเอง
  const [flexFooter, setFlexFooter] = useState(''); // ข้อความหมายเหตุท้ายการ์ด
  const [flexHeaderColor, setFlexHeaderColor] = useState('#0F4C81'); // รหัสสี Hex ของแถบหัวการ์ด
  const [flexButtonLabel, setFlexButtonLabel] = useState('ดูรายละเอียดในระบบ'); // ข้อความบนปุ่มกด

  // --- Switching State: ทดสอบการสลับเมนูตาม LINE User ID และ Role ---
  const [testLineUserId, setTestLineUserId] = useState(''); // LINE User ID ที่ต้องการทดสอบ
  const [testRole, setTestRole] = useState<'USER' | 'STAFF' | 'ADMIN' | 'GUEST'>('USER'); // บทบาทที่ต้องการจำลอง

  /**
   * ฟังก์ชันดึงรายการ Rich Menus ทั้งหมดจาก Backend API
   */
  const fetchMenus = async () => {
    try {
      const data = await api.getRichMenus();
      setMenus(data);
      // หากยังไม่ได้เลือกเมนู ให้เลือกเมนูแรกโดยอัตโนมัติ
      if (data.length > 0 && !selectedMenu) {
        setSelectedMenu(data[0]);
      } else if (selectedMenu) {
        // หากมีเมนูที่เลือกอยู่แล้ว ให้อัปเดตข้อมูลล่าสุดของเมนูนั้น
        const refreshed = data.find((m: any) => m.id === selectedMenu.id);
        if (refreshed) setSelectedMenu(refreshed);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'ไม่สามารถโหลด Rich Menus ได้' });
    } finally {
      setLoading(false);
    }
  };

  /**
   * ฟังก์ชันดึงข้อมูลจำลองสำหรับพรีวิว Flex Card ตามประเภท Event
   * @param eventKey - รหัสประเภทเหตุการณ์แจ้งเตือน
   */
  const loadFlexPreview = async (eventKey: string) => {
    try {
      const res = await api.previewFlexTemplate(eventKey);
      setPreviewData(res);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'ไม่สามารถโหลดตัวอย่าง Flex Card ได้' });
    }
  };

  // โหลดรายการเมนูและตัวอย่าง Flex Card เมื่อเปิดหน้าจอครั้งแรก
  useEffect(() => {
    fetchMenus();
    loadFlexPreview(selectedEvent);
  }, []);

  // โหลดพรีวิวใหม่เมื่อเปลี่ยนประเภท Event
  useEffect(() => {
    loadFlexPreview(selectedEvent);
  }, [selectedEvent]);

  /**
   * ฟังก์ชันเผยแพร่ Rich Menu ขึ้นไปยัง LINE Official Account ผ่าน Messaging API
   * @param id - รหัส Rich Menu ในระบบ
   */
  const handlePublish = async (id: string) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const updated = await api.publishRichMenu(id);
      setFeedback({ type: 'success', message: `เผยแพร่ Rich Menu ขึ้น LINE OA สำเร็จ (ID: ${updated.lineRichMenuId})` });
      await fetchMenus();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการเผยแพร่' });
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * ฟังก์ชันกำหนดให้ Rich Menu นี้เป็นเมนูหลักเริ่มต้น (Default) ของ LINE OA
   * @param id - รหัส Rich Menu
   */
  const handleSetDefault = async (id: string) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      await api.setDefaultRichMenu(id);
      setFeedback({ type: 'success', message: 'กำหนดเป็น Rich Menu หลักเริ่มต้น (Default) บน LINE OA สำเร็จ' });
      await fetchMenus();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการตั้งค่า Default' });
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * ฟังก์ชันสร้างชุด Rich Menu เริ่มต้นอัตโนมัติครบ 4 ประเภท (Citizen, Staff, Admin, Guest)
   */
  const handleInitDefaults = async () => {
    if (!confirm('ยืนยันสร้างชุดเมนูเริ่มต้น (Citizen, Staff, Admin, Guest)?')) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      await api.initDefaultRichMenus();
      setFeedback({ type: 'success', message: 'สร้างชุดเมนูเริ่มต้นสำหรับ JapJong ครบทั้ง 4 ประเภทเรียบร้อยแล้ว' });
      await fetchMenus();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการสร้างเมนูเริ่มต้น' });
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * ฟังก์ชันลบ Rich Menu ออกจากระบบและจากเซิร์ฟเวอร์ LINE
   * @param id - รหัส Rich Menu
   */
  const handleDelete = async (id: string) => {
    if (!confirm('ยืนยันลบ Rich Menu นี้? ระบบจะลบออกจาก LINE Messaging API ด้วย')) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      await api.deleteRichMenu(id);
      setFeedback({ type: 'success', message: 'ลบ Rich Menu เรียบร้อยแล้ว' });
      setSelectedMenu(null);
      await fetchMenus();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการลบ' });
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * ฟังก์ชันอัปโหลดไฟล์ภาพกราฟิก Rich Menu ขนาด 2500x1686 px (ไม่เกิน 1MB)
   */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedMenu || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    // ตรวจสอบขนาดไฟล์ไม่ให้เกิน 1 MB ตามข้อกำหนดของ LINE
    if (file.size > 1048576) {
      setFeedback({ type: 'error', message: 'ไฟล์ภาพต้องมีขนาดไม่เกิน 1 MB ตามเกณฑ์ของ LINE' });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setActionLoading(true);
      setFeedback(null);
      try {
        const res = await api.uploadRichMenuImage(selectedMenu.id, base64, file.type);
        setFeedback({
          type: 'success',
          message: `อัปโหลดภาพสำเร็จ (ขนาด ${res.width}x${res.height} px ตรงตามเกณฑ์ของ LINE)`,
        });
        await fetchMenus();
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการอัปโหลดภาพ' });
      } finally {
        setActionLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  /**
   * ฟังก์ชันบันทึกการปรับแต่งแม่แบบ Flex Message ของ Event ที่เลือก
   */
  const handleSaveFlexOverride = async () => {
    setActionLoading(true);
    setFeedback(null);
    try {
      await api.upsertFlexTemplate({
        name: `แม่แบบ: ${selectedEvent}`,
        eventType: selectedEvent,
        templateType: 'FLEX',
        status: 'ACTIVE',
        content: {
          headline: flexHeadline || undefined,
          footerNote: flexFooter || undefined,
          headerColor: flexHeaderColor || undefined,
          buttonLabel: flexButtonLabel || undefined,
        },
      });
      setFeedback({ type: 'success', message: 'บันทึกการปรับแต่งแม่แบบ Flex Message สำเร็จ' });
      await loadFlexPreview(selectedEvent);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึกแม่แบบ' });
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * ฟังก์ชันทดสอบการสลับ Rich Menu ของผู้ใช้รายบุคคลผ่าน LINE User ID
   */
  const handleTestSwitch = async () => {
    if (!testLineUserId.trim()) {
      setFeedback({ type: 'error', message: 'กรุณากรอก LINE User ID (เช่น U1111222233334444)' });
      return;
    }
    setActionLoading(true);
    setFeedback(null);
    try {
      const roleParam = testRole === 'GUEST' ? undefined : testRole;
      const res = await api.switchUserRole(testLineUserId.trim(), roleParam);
      setFeedback({
        type: 'success',
        message: `สลับ Rich Menu สำหรับ ${testLineUserId} ไปเป็นประเภท "${res.menuType}" สำเร็จ`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการสลับเมนู' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    // โครงเลย์เอาต์หลักของแอปพลิเคชัน
    <AppShell>
      <div className="w-full space-y-6">
        {/* แถบส่วนหัว Breadcrumb และปุ่มดำเนินการส่วนกลาง */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Link href="/admin" className="flex items-center gap-1 hover:text-slate-800">
                <ArrowLeft className="h-4 w-4" /> แดชบอร์ดผู้ดูแลระบบ
              </Link>
              <span>/</span>
              <span className="font-medium text-slate-900">LINE Official Account & Rich Menu</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              จัดการ LINE Rich Menu & Flex Messages
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              ออกแบบ เมนูตามสิทธิ์ (Citizen, Staff, Admin) และตั้งค่าข้อความ Flex Message สำหรับ JapJong
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* ปุ่มรีเฟรชข้อมูล */}
            <Button
              variant="secondary"
              onClick={fetchMenus}
              disabled={loading || actionLoading}
              className="text-xs h-9 px-3 gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </Button>
            {/* ปุ่มสร้างชุดเมนูเริ่มต้น 4 ประเภท */}
            <Button
              variant="primary"
              onClick={handleInitDefaults}
              disabled={actionLoading}
              className="text-xs h-9 px-3 gap-1.5"
            >
              <Layers className="h-4 w-4" />
              สร้างชุดเมนูเริ่มต้น 4 ประเภท
            </Button>
          </div>
        </div>

        {/* แถบแจ้งเตือน Feedback การทำงาน */}
        {feedback && (
          <div className="mb-6">
            <Feedback tone={feedback.type === 'success' ? 'brand' : 'crit'}>
              <div className="flex items-center justify-between w-full">
                <span>{feedback.message}</span>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="text-xs underline ml-4 hover:opacity-80"
                >
                  ปิด
                </button>
              </div>
            </Feedback>
          </div>
        )}

        {/* แถบนำทางแท็บเมนูหลัก 3 แท็บ */}
        <div className="mb-6 border-b border-slate-200">
          <nav className="-mb-px flex space-x-6">
            <button
              onClick={() => setActiveTab('menus')}
              className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-semibold transition-colors ${
                activeTab === 'menus'
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              จัดการ Rich Menu ({menus.length})
            </button>
            <button
              onClick={() => setActiveTab('flex')}
              className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-semibold transition-colors ${
                activeTab === 'flex'
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              Flex Message Templates & Preview
            </button>
            <button
              onClick={() => setActiveTab('switching')}
              className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-semibold transition-colors ${
                activeTab === 'switching'
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <UserCheck className="h-4 w-4" />
              Role Switching & Link User
            </button>
          </nav>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: RICH MENUS MANAGEMENT (จัดการ Rich Menu) */}
        {/* ========================================================= */}
        {activeTab === 'menus' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* คอลัมน์ซ้าย: รายการ Rich Menu ทั้งหมด */}
            <div className="lg:col-span-4 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                รายการ Rich Menu ในระบบ
              </h2>
              {menus.length === 0 ? (
                <Card className="p-8 text-center text-slate-500">
                  <Smartphone className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                  <p>ยังไม่มี Rich Menu ในระบบ</p>
                  <Button variant="secondary" className="mt-3 text-xs" onClick={handleInitDefaults}>
                    สร้างเมนูเริ่มต้นทันที
                  </Button>
                </Card>
              ) : (
                menus.map((m) => {
                  const isSelected = selectedMenu?.id === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMenu(m)}
                      className={`cursor-pointer rounded-xl border p-4 transition-all ${
                        isSelected
                          ? 'border-brand-600 bg-brand-50/40 shadow-sm ring-1 ring-brand-600'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{m.name}</span>
                            {m.isDefault && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">แถบแชท: &quot;{m.chatBarText}&quot;</p>
                        </div>
                        <Chip
                          tone={
                            m.status === 'PUBLISHED' ? 'ok' : m.status === 'DRAFT' ? 'warn' : 'gray'
                          }
                        >
                          {m.status}
                        </Chip>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5 text-slate-400" />
                          ประเภท: <strong>{m.menuType}</strong>
                        </span>
                        <span>{m.actions.length} ช่องเมนู</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* คอลัมน์ขวา: รายละเอียดเมนูที่เลือก และ Live Smartphone Mockup */}
            <div className="lg:col-span-8">
              {selectedMenu ? (
                <div className="space-y-6">
                  {/* แถบ Action Bar จัดการเมนู */}
                  <Card className="p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-900">{selectedMenu.name}</h3>
                          <Chip
                            tone={
                              selectedMenu.status === 'PUBLISHED'
                                ? 'ok'
                                : selectedMenu.status === 'DRAFT'
                                  ? 'warn'
                                  : 'gray'
                            }
                          >
                            {selectedMenu.status}
                          </Chip>
                          {selectedMenu.isDefault && (
                            <Chip tone="warn">เมนูหลัก (Default)</Chip>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          LINE Rich Menu ID:{' '}
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">
                            {selectedMenu.lineRichMenuId || 'ยังไม่ได้เผยแพร่ขึ้น LINE OA'}
                          </code>
                        </p>
                      </div>

                      {/* ปุ่มคำสั่ง: เผยแพร่, ตั้ง Default, อัปโหลดภาพ, ลบ */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="primary"
                          onClick={() => handlePublish(selectedMenu.id)}
                          disabled={actionLoading}
                          className="text-xs h-9 px-3 gap-1.5"
                        >
                          <Send className="h-4 w-4" />
                          {selectedMenu.lineRichMenuId ? 'อัปเดตขึ้น LINE' : 'เผยแพร่ขึ้น LINE (Publish)'}
                        </Button>
                        {!selectedMenu.isDefault && (
                          <Button
                            variant="secondary"
                            onClick={() => handleSetDefault(selectedMenu.id)}
                            disabled={actionLoading}
                            className="text-xs h-9 px-3 gap-1.5"
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ตั้งเป็น Default
                          </Button>
                        )}
                        <label className="inline-flex items-center">
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="hidden"
                            onChange={handleImageUpload}
                            disabled={actionLoading}
                          />
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer">
                            <Upload className="h-3.5 w-3.5 text-slate-500" />
                            อัปโหลดภาพ (1MB)
                          </span>
                        </label>
                        <Button
                          variant="ghost"
                          onClick={() => handleDelete(selectedMenu.id)}
                          disabled={actionLoading}
                          className="text-red-600 hover:bg-red-50 text-xs h-9 px-3 gap-1.5"
                        >
                          <Trash2 className="h-4 w-4" />
                          ลบ
                        </Button>
                      </div>
                    </div>
                  </Card>

                  {/* ผังจำลองเมนู 6 ช่องบนหน้าจอสมาร์ตโฟน (Interactive Smartphone Mockup) */}
                  <Card className="p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                          <LayoutGrid className="h-4 w-4 text-brand-600" />
                          ผังจำลองการกดเมนู (Interactive Tile Preview)
                        </h4>
                        <p className="text-xs text-slate-500">
                          ขนาดมาตรฐาน 2500 x 1686 px (อัตราส่วน 1.48:1 สำหรับ LINE Messaging API)
                        </p>
                      </div>
                      <span className="text-xs font-medium text-slate-400">
                        {selectedMenu.width} x {selectedMenu.height} px
                      </span>
                    </div>

                    {/* กล่องกรอบสมาร์ตโฟนจำลอง */}
                    <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border-4 border-slate-800 bg-slate-900 shadow-2xl">
                      {/* ส่วนหัวห้องแชทจำลอง */}
                      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800 px-4 py-2.5 text-xs text-slate-300">
                        <span className="font-semibold text-white flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block"></span>
                          จับจอง Official Account
                        </span>
                        <span className="rounded bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                          {selectedMenu.menuType}
                        </span>
                      </div>

                      {/* ข้อความในห้องแชทจำลอง */}
                      <div className="bg-slate-100 p-4 text-center text-xs text-slate-400 min-h-[140px] flex flex-col justify-end">
                        <div className="mx-auto mb-2 max-w-xs rounded-lg bg-white p-2.5 text-left text-xs text-slate-700 shadow-sm border border-slate-200">
                          👋 สวัสดีครับ ยินดีต้อนรับสู่ระบบจับจอง กรุณาเลือกรายการบริการจากเมนูด้านล่างนี้
                        </div>
                      </div>

                      {/* พื้นที่แสดงภาพ Rich Menu และผังช่องกด Hotspots */}
                      <div className="relative aspect-[2500/1686] w-full border-t border-slate-700 bg-slate-800">
                        {selectedMenu.imageData ? (
                          <img
                            src={`data:${selectedMenu.imageMimeType || 'image/png'};base64,${selectedMenu.imageData}`}
                            alt={selectedMenu.name}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : null}

                        {/* เลเยอร์ Overlay ช่องกด 6 ช่อง */}
                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-1 p-1">
                          {selectedMenu.actions.map((act, idx) => (
                            <div
                              key={act.id}
                              className="group relative flex flex-col items-center justify-center rounded-lg border border-dashed border-white/60 bg-black/35 p-2 text-center text-white backdrop-blur-[2px] transition hover:bg-black/60 hover:border-white"
                              title={`${act.label} (${act.actionType}: ${act.actionData})`}
                            >
                              <span className="mb-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-mono">
                                #{idx + 1}
                              </span>
                              <span className="text-xs font-bold drop-shadow leading-tight">{act.label}</span>
                              <span className="mt-1 text-[10px] text-slate-200 opacity-90 truncate max-w-full px-1">
                                {act.actionType === 'URI' ? `LIFF: ${act.actionData}` : act.actionData}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* แถบแชทบาร์จำลองด้านล่าง */}
                      <div className="flex items-center justify-between border-t border-slate-800 bg-white px-4 py-2.5 text-xs text-slate-600">
                        <span className="font-medium text-slate-800">
                          ▼ {selectedMenu.chatBarText}
                        </span>
                        <span className="text-slate-400">⌨️ แป้นพิมพ์</span>
                      </div>
                    </div>
                  </Card>

                  {/* ตารางแสดงข้อมูลรายละเอียด Action ทั้งหมด */}
                  <Card className="overflow-hidden">
                    <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
                      <h4 className="font-semibold text-slate-800 text-sm">
                        รายละเอียดการตั้งค่า Action ทั้ง {selectedMenu.actions.length} ช่อง
                      </h4>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {selectedMenu.actions.map((act, i) => (
                        <div key={act.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between text-sm">
                          <div className="flex items-center gap-3">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                              {i + 1}
                            </span>
                            <div>
                              <span className="font-semibold text-slate-900">{act.label}</span>
                              <p className="text-xs text-slate-500 font-mono">
                                พิกัด: x={act.area.x}, y={act.area.y}, w={act.area.width}, h={act.area.height}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {act.actionType}
                            </span>
                            <span className="text-xs text-slate-600 truncate max-w-xs font-mono bg-slate-50 px-2 py-1 rounded border border-slate-200">
                              {act.actionData}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              ) : (
                <Card className="p-12 text-center text-slate-500">
                  <Smartphone className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                  <p className="font-medium">กรุณาเลือก Rich Menu จากรายการทางซ้ายมือ</p>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: FLEX MESSAGE TEMPLATES & LIVE PREVIEW */}
        {/* ========================================================= */}
        {activeTab === 'flex' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* รายการเหตุการณ์แจ้งเตือนสำหรับเลือกปรับแต่ง */}
            <div className="lg:col-span-4 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                เลือกประเภทการแจ้งเตือน (Notification Events)
              </h2>
              <div className="space-y-4 max-h-[750px] overflow-y-auto pr-1">
                {EVENT_CATEGORIES.map((cat) => (
                  <div key={cat.category} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <h3 className="mb-2 font-bold text-xs text-slate-800 uppercase tracking-wide border-b pb-1">
                      {cat.category}
                    </h3>
                    <div className="space-y-1">
                      {cat.events.map((ev) => {
                        const isSelected = selectedEvent === ev.id;
                        return (
                          <button
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev.id)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-between ${
                              isSelected
                                ? 'bg-brand text-white font-semibold'
                                : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span>{ev.label}</span>
                            <code className={`text-[10px] ${isSelected ? 'text-brand-light' : 'text-slate-400'}`}>
                              {ev.id}
                            </code>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ส่วนปรับแต่งเนื้อหา และจำลองการแสดงผล Flex Card */}
            <div className="lg:col-span-8 space-y-6">
              {/* การ์ดฟอร์มปรับแต่งข้อความ */}
              <Card className="p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-brand" />
                  ปรับแต่งเนื้อหา Flex Message สำหรับ: <code className="text-brand font-mono">{selectedEvent}</code>
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      หัวข้อหลัก (Headline Override)
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                      placeholder="ใช้ค่าเริ่มต้นของระบบ"
                      value={flexHeadline}
                      onChange={(e) => setFlexHeadline(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ข้อความปุ่มเปิดบริการ (Button Label)
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                      placeholder="ดูรายละเอียดในระบบ"
                      value={flexButtonLabel}
                      onChange={(e) => setFlexButtonLabel(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      หมายเหตุท้ายการ์ด (Footer Note)
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                      placeholder="สอบถามข้อมูลเพิ่มเติมติดต่อสำนักงาน อบต."
                      value={flexFooter}
                      onChange={(e) => setFlexFooter(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      โทนสีแถบหัวการ์ด (Header Color Hex)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={flexHeaderColor}
                        onChange={(e) => setFlexHeaderColor(e.target.value)}
                        className="h-9 w-12 rounded border border-slate-300 p-0.5 cursor-pointer"
                      />
                      <input
                        type="text"
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-brand focus:outline-none"
                        value={flexHeaderColor}
                        onChange={(e) => setFlexHeaderColor(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2 border-t pt-4">
                  <Button
                    variant="primary"
                    onClick={handleSaveFlexOverride}
                    disabled={actionLoading}
                    className="text-xs h-9 px-4"
                  >
                    บันทึกการปรับแต่งแม่แบบ
                  </Button>
                </div>
              </Card>

              {/* การ์ดจำลองข้อความ LINE Flex Message บนแชทมือถือ */}
              <Card className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                    <Eye className="h-4 w-4 text-emerald-600" />
                    ตัวอย่างการแสดงผลบน LINE (Live Flex Card Preview)
                  </h4>
                  <span className="text-xs text-slate-400">JapJong Clean & Minimal Design</span>
                </div>

                {/* กรอบแชทมือถือจำลอง */}
                <div className="mx-auto max-w-sm rounded-2xl border-4 border-slate-800 bg-slate-900 p-3 shadow-2xl">
                  {/* แถบหัวแชท */}
                  <div className="mb-3 flex items-center justify-between text-[11px] text-slate-300 border-b border-slate-800 pb-2">
                    <span className="font-bold text-white">ระบบจับจอง (JapJong)</span>
                    <span>10:30 น.</span>
                  </div>

                  {/* กล่องการ์ด LINE Flex Message */}
                  <div className="overflow-hidden rounded-xl bg-white shadow-lg text-slate-800">
                    {/* แถบหัวการ์ด */}
                    <div
                      className="px-4 py-3 text-white flex items-center justify-between"
                      style={{ backgroundColor: flexHeaderColor || '#0F4C81' }}
                    >
                      <span className="text-xs font-bold tracking-wide uppercase">
                        จับจอง · ระบบบริการภาครัฐ
                      </span>
                      <span className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
                        OFFICIAL
                      </span>
                    </div>

                    {/* ข้อความหัวเรื่องและคำอธิบาย */}
                    <div className="p-4 border-b border-slate-100">
                      <h5 className="font-bold text-base text-slate-900 leading-snug">
                        {flexHeadline || previewData?.inAppTitle || 'คำขอได้รับการอนุมัติเรียบร้อยแล้ว'}
                      </h5>
                      <p className="mt-1 text-xs text-slate-500">
                        {previewData?.inAppMessage || 'คำขอใช้สถานที่ราชการได้รับการอนุมัติจากผู้มีอำนาจแล้ว'}
                      </p>
                    </div>

                    {/* รายละเอียดคำขอจำลอง */}
                    <div className="bg-slate-50/70 p-4 text-xs space-y-2 border-b border-slate-100">
                      <div className="flex justify-between">
                        <span className="text-slate-500">เลขที่คำขอ</span>
                        <strong className="text-slate-800 font-mono">BK-20261104-001</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">บริการ</span>
                        <span className="text-slate-800 font-medium">จองสถานที่ราชการ</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">สถานที่</span>
                        <span className="text-slate-800 font-medium text-right max-w-[180px] truncate">
                          ห้องประชุมสภาเทศบาล (ชั้น 2)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">วันที่ใช้งาน</span>
                        <span className="text-slate-800 font-medium text-right">
                          10 พ.ย. 2569 (09:00 - 12:00)
                        </span>
                      </div>
                    </div>

                    {/* ท้ายการ์ดและปุ่ม Call-to-Action */}
                    <div className="p-4 bg-white">
                      <p className="text-[11px] text-slate-400 text-center mb-3">
                        {flexFooter || 'ท่านสามารถเปิดดูเอกสารหรือติดตามสถานะผ่านลิงก์ด้านล่าง'}
                      </p>
                      <button
                        className="w-full rounded-lg py-2.5 px-4 text-center text-xs font-bold text-white transition shadow-sm hover:opacity-95"
                        style={{ backgroundColor: flexHeaderColor || '#0F4C81' }}
                      >
                        {flexButtonLabel || 'ดูรายละเอียดในระบบ'} →
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: ROLE SWITCHING & LINE USER LINK */}
        {/* ========================================================= */}
        {activeTab === 'switching' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* คำอธิบายสถาปัตยกรรม Rich Menu Switching */}
            <div className="lg:col-span-6 space-y-6">
              <Card className="p-6">
                <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-brand" />
                  สถาปัตยกรรม Rich Menu Switching ตามสิทธิ์
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  ระบบจับจองผูก Rich Menu เข้ากับ Role ของบัญชีในระบบที่ผ่านการยืนยันตัวตนเท่านั้น
                  และปฏิบัติตามมาตรฐานความปลอดภัยอย่างเคร่งครัด
                </p>

                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-light text-[10px] font-bold text-brand">
                      1
                    </span>
                    <div>
                      <strong className="text-slate-800">ประชาชน (Citizen - Role: USER):</strong>
                      <p className="text-slate-500 mt-0.5">
                        แสดงเมนู 6 ช่อง: จองสถานที่, ยืมอุปกรณ์, แจ้งซ่อม, คำขอของฉัน, เอกสาร, ติดต่อเจ้าหน้าที่
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-700">
                      2
                    </span>
                    <div>
                      <strong className="text-slate-800">เจ้าหน้าที่ (Staff / Approver):</strong>
                      <p className="text-slate-500 mt-0.5">
                        แสดงเมนู 6 ช่อง: งานที่ต้องดำเนินการ, ตรวจสอบคำขอ, อนุมัติคำขอ, ลงนามเอกสาร, แจ้งเตือน, หน้าหลัก
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-700">
                      3
                    </span>
                    <div>
                      <strong className="text-slate-800">ผู้ดูแลระบบ (Admin - Role: ADMIN):</strong>
                      <p className="text-slate-500 mt-0.5">
                        แสดงเมนู 6 ช่อง: แดชบอร์ด, จัดการผู้ใช้, จัดการทรัพยากร, Rich Menu, บันทึกแจ้งเตือน, ตั้งค่า
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                      4
                    </span>
                    <div>
                      <strong className="text-slate-800">ผู้ใช้ทั่วไป / ยังไม่ได้เข้าสู่ระบบ (Default / Guest):</strong>
                      <p className="text-slate-500 mt-0.5">
                        แสดง Default Rich Menu ของ LINE OA แนะนำการเข้าสู่ระบบและผูกบัญชี
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* กล่องทดสอบจำลองคำสั่งสลับเมนูรายบุคคล */}
            <div className="lg:col-span-6 space-y-6">
              <Card className="p-6">
                <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-emerald-600" />
                  ทดสอบการสลับ Rich Menu รายบุคคล (Switching Simulation)
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  ทดสอบสั่ง LINE Messaging API สลับเมนูตาม LINE User ID
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      LINE User ID ของผู้ทดสอบ
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-brand focus:outline-none"
                      placeholder="U1111222233334444..."
                      value={testLineUserId}
                      onChange={(e) => setTestLineUserId(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      จำลองบทบาทผู้ใช้งาน (Simulated Role)
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(['USER', 'STAFF', 'ADMIN', 'GUEST'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setTestRole(r)}
                          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                            testRole === r
                              ? 'border-brand bg-brand-light text-brand ring-1 ring-brand'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      variant="primary"
                      className="w-full gap-1.5"
                      onClick={handleTestSwitch}
                      disabled={actionLoading || !testLineUserId.trim()}
                    >
                      <Send className="h-4 w-4" />
                      สั่งสลับเมนูบน LINE ทันที
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
