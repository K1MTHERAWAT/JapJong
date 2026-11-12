'use client';

/**
 * =====================================================================
 * ศูนย์การแจ้งเตือน (Notification Center Page) - ระบบจับจอง
 * =====================================================================
 * ศูนย์กลางรวบรวมและติดตามการแจ้งเตือนทั้งหมดของผู้ใช้:
 * 1. แสดงรายการแจ้งเตือนแบบเรียลไทม์ พร้อมจำแนกตามสีและไอคอนของประเภทบริการ
 * 2. ตัวกรองหมวดหมู่ (Pill Filters): ทั้งหมด, ยังไม่อ่าน, จองสถานที่, ยืม-คืน, แจ้งซ่อม, และเอกสารลงนาม
 * 3. ปุ่มทำเครื่องหมายว่าอ่านทั้งหมด (Mark All as Read)
 * 4. คลิกเพื่ออ่านและนำทางตรงไปยังหน้าคำขอหรือเอกสารที่เกี่ยวข้อง (Deep Link)
 * 5. ปุ่มทางลัดไปยังหน้าตั้งค่าช่องทางรับการแจ้งเตือน (/notifications/settings)
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
// ไอคอนสำหรับสถานะ ประเภทบริการ และปุ่มคำสั่ง
import {
  Bell,
  Building2,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  Filter,
  Package,
  Settings,
  Wrench,
} from 'lucide-react';
import { AppNotification } from '@japjong/shared';
// Context ระบบยืนยันตัวตนและการแจ้งเตือน
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Button, Card, Chip } from '@/components/ui';
// ฟังก์ชันจัดรูปแบบวัน-เวลาภาษาไทย
import { formatThaiDateTime } from '@/lib/api';

/** ประเภทตัวกรองการแจ้งเตือน */
type NotificationFilter = 'all' | 'unread' | 'booking' | 'borrow' | 'repair' | 'signing';

export default function NotificationCenterPage() {
  const router = useRouter();
  // ดึงรายการแจ้งเตือน จำนวนที่ยังไม่อ่าน และฟังก์ชันทำเครื่องหมายอ่านแล้ว
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useAuth();
  // สถานะตัวกรองปัจจุบัน (ค่าเริ่มต้นคือ 'all')
  const [filter, setFilter] = useState<NotificationFilter>('all');
  // สถานะการบันทึกเมื่อกดปุ่มอ่านทั้งหมด
  const [markingAll, setMarkingAll] = useState(false);

  /**
   * กรองรายการแจ้งเตือนตามหมวดหมู่ที่ผู้ใช้เลือก
   */
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      // กรองเฉพาะที่ยังไม่ได้อ่าน
      if (filter === 'unread') return !n.read;
      // กรองเฉพาะบริการขอใช้สถานที่
      if (filter === 'booking') {
        return (
          n.referenceType === 'booking' ||
          n.notificationType === 'BOOKING_STATUS' ||
          n.title?.includes('จอง')
        );
      }
      // กรองเฉพาะบริการขอยืม-คืนอุปกรณ์
      if (filter === 'borrow') {
        return (
          n.referenceType === 'borrow' ||
          n.notificationType === 'BORROW_STATUS' ||
          n.notificationType === 'BORROW_RETURN' ||
          n.title?.includes('ยืม') ||
          n.title?.includes('คืน')
        );
      }
      // กรองเฉพาะบริการแจ้งซ่อมบำรุง
      if (filter === 'repair') {
        return (
          n.referenceType === 'repair' ||
          n.notificationType === 'REPAIR_STATUS' ||
          n.title?.includes('ซ่อม')
        );
      }
      // กรองเฉพาะเอกสารราชการและการลงนามอนุมัติ
      if (filter === 'signing') {
        return (
          n.referenceType === 'signing' ||
          n.notificationType === 'DOCUMENT_SIGNING' ||
          n.title?.includes('ลงนาม') ||
          n.title?.includes('อนุมัติ')
        );
      }
      return true;
    });
  }, [notifications, filter]);

  /**
   * จัดการทำเครื่องหมายว่าอ่านข้อความแจ้งเตือนทั้งหมด
   */
  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
    } finally {
      setMarkingAll(false);
    }
  };

  /**
   * เมื่อคลิกรายการแจ้งเตือน: ทำเครื่องหมายอ่านแล้ว และเปิดลิงก์ปลายทาง
   */
  const handleClickItem = async (n: AppNotification) => {
    if (!n.read) {
      await markNotificationRead(n.id);
    }
    if (n.link) {
      router.push(n.link);
    }
  };

  /**
   * เลือกไอคอนประจำประเภทบริการเพื่อแสดงในกล่องแจ้งเตือน
   */
  const getCategoryIcon = (n: AppNotification) => {
    if (n.referenceType === 'booking' || n.notificationType === 'BOOKING_STATUS') {
      return <Building2 className="size-5 text-brand" />;
    }
    if (
      n.referenceType === 'borrow' ||
      n.notificationType === 'BORROW_STATUS' ||
      n.notificationType === 'BORROW_RETURN'
    ) {
      return <Package className="size-5 text-amber-600" />;
    }
    if (n.referenceType === 'repair' || n.notificationType === 'REPAIR_STATUS') {
      return <Wrench className="size-5 text-sky-600" />;
    }
    if (n.referenceType === 'signing' || n.notificationType === 'DOCUMENT_SIGNING') {
      return <FileCheck className="size-5 text-emerald-600" />;
    }
    return <Bell className="size-5 text-ink-mute" />;
  };

  return (
    <AppShell maxWidth="max-w-[960px]">
      <div className="flex flex-col gap-6">
        {/* แถบส่วนหัวแสดงชื่อหน้าและปุ่มคำสั่ง */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-display font-bold text-ink">ศูนย์แจ้งเตือน</h1>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-status-crit text-white text-[12px] font-bold">
                  {unreadCount} ข้อความใหม่
                </span>
              )}
            </div>
            <p className="text-body text-muted mt-1">
              ติดตามสถานะคำขอ การอนุมัติ และกำหนดการสำคัญทั้งหมด
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* ปุ่มไปหน้าตั้งค่าช่องทางแจ้งเตือน */}
            <Link href="/notifications/settings">
              <Button variant="secondary" className="gap-2">
                <Settings className="size-4" />
                <span>ตั้งค่าการแจ้งเตือน</span>
              </Button>
            </Link>
            {/* ปุ่มอ่านทั้งหมด (แสดงเมื่อมีข้อความที่ยังไม่ได้อ่าน) */}
            {unreadCount > 0 && (
              <Button
                variant="primary"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="gap-2"
              >
                <CheckCheck className="size-4" />
                <span>{markingAll ? 'กำลังบันทึก...' : 'อ่านทั้งหมด'}</span>
              </Button>
            )}
          </div>
        </div>

        {/* แถบปุ่มแคปซูลเลือกตัวกรองหมวดหมู่ (Filter Pills) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {/* ตัวกรอง: ทั้งหมด */}
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 rounded-full text-caption font-medium transition-colors shrink-0 ${
              filter === 'all'
                ? 'bg-ink text-white'
                : 'bg-surface border border-line text-ink-soft hover:bg-hover'
            }`}
          >
            ทั้งหมด ({notifications.length})
          </button>
          {/* ตัวกรอง: ยังไม่อ่าน */}
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`px-3.5 py-1.5 rounded-full text-caption font-medium transition-colors shrink-0 ${
              filter === 'unread'
                ? 'bg-status-crit text-white'
                : 'bg-surface border border-line text-ink-soft hover:bg-hover'
            }`}
          >
            ยังไม่อ่าน ({unreadCount})
          </button>
          {/* ตัวกรอง: ขอใช้สถานที่ */}
          <button
            type="button"
            onClick={() => setFilter('booking')}
            className={`px-3.5 py-1.5 rounded-full text-caption font-medium transition-colors shrink-0 ${
              filter === 'booking'
                ? 'bg-brand text-white'
                : 'bg-surface border border-line text-ink-soft hover:bg-hover'
            }`}
          >
            จองสถานที่
          </button>
          {/* ตัวกรอง: ยืม-คืนอุปกรณ์ */}
          <button
            type="button"
            onClick={() => setFilter('borrow')}
            className={`px-3.5 py-1.5 rounded-full text-caption font-medium transition-colors shrink-0 ${
              filter === 'borrow'
                ? 'bg-amber-600 text-white'
                : 'bg-surface border border-line text-ink-soft hover:bg-hover'
            }`}
          >
            ยืม-คืนอุปกรณ์
          </button>
          {/* ตัวกรอง: งานแจ้งซ่อม */}
          <button
            type="button"
            onClick={() => setFilter('repair')}
            className={`px-3.5 py-1.5 rounded-full text-caption font-medium transition-colors shrink-0 ${
              filter === 'repair'
                ? 'bg-sky-600 text-white'
                : 'bg-surface border border-line text-ink-soft hover:bg-hover'
            }`}
          >
            งานแจ้งซ่อม
          </button>
          {/* ตัวกรอง: ลงนามเอกสาร */}
          <button
            type="button"
            onClick={() => setFilter('signing')}
            className={`px-3.5 py-1.5 rounded-full text-caption font-medium transition-colors shrink-0 ${
              filter === 'signing'
                ? 'bg-emerald-600 text-white'
                : 'bg-surface border border-line text-ink-soft hover:bg-hover'
            }`}
          >
            เอกสาร & ลงนาม
          </button>
        </div>

        {/* รายการแจ้งเตือน (Notifications List Card) */}
        <Card padding="none" className="overflow-hidden divide-y divide-line-soft">
          {filteredNotifications.length === 0 ? (
            // กรณีไม่มีรายการแจ้งเตือนตามตัวกรอง
            <div className="py-16 text-center text-body text-muted flex flex-col items-center justify-center gap-3">
              <div className="size-12 rounded-full bg-surface-muted flex items-center justify-center text-ink-mute">
                <Bell className="size-6" />
              </div>
              <div className="font-semibold text-ink">ไม่มีรายการแจ้งเตือนในหมวดหมู่นี้</div>
              <p className="text-caption text-muted max-w-sm">
                เมื่อมีสถานะคำขอใหม่ หรือความคืบหน้าของงาน ระบบจะแสดงรายการแจ้งเตือนที่นี่โดยอัตโนมัติ
              </p>
            </div>
          ) : (
            filteredNotifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleClickItem(n)}
                className={`p-4 sm:p-5 flex items-start gap-4 cursor-pointer transition-colors ${
                  !n.read ? 'bg-[#F2F7F4]/60 hover:bg-[#E8F1EC]' : 'bg-white hover:bg-surface-muted/60'
                }`}
              >
                {/* ไอคอนประจำประเภทบริการ */}
                <div
                  className={`size-11 rounded-control flex items-center justify-center shrink-0 border ${
                    !n.read
                      ? 'bg-white border-brand/20 shadow-xs'
                      : 'bg-surface-muted border-line-soft'
                  }`}
                >
                  {getCategoryIcon(n)}
                </div>

                {/* รายละเอียดข้อความแจ้งเตือน */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <b
                      className={`text-[15px] truncate ${
                        !n.read ? 'text-ink font-bold' : 'text-ink-soft font-medium'
                      }`}
                    >
                      {n.title}
                    </b>
                    {/* เวลาที่ส่งแจ้งเตือน */}
                    <span className="text-[12px] text-ink-mute shrink-0 flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatThaiDateTime(n.createdAt || n.at)}
                    </span>
                  </div>

                  <p className="text-body text-muted mt-1 leading-relaxed break-words">
                    {n.message || n.body}
                  </p>

                  {/* แถบลิงก์และรหัสอ้างอิงคำขอ */}
                  <div className="flex items-center gap-3 mt-3">
                    {n.referenceId && (
                      <span className="text-[12px] font-mono font-medium px-2 py-0.5 rounded bg-surface-muted border border-line text-ink-soft">
                        #{n.referenceId}
                      </span>
                    )}
                    {n.link && (
                      <span className="text-[13px] text-brand font-medium inline-flex items-center gap-1 hover:underline">
                        <span>ดูรายละเอียดคำขอ</span>
                        <ExternalLink className="size-3" />
                      </span>
                    )}
                    {/* จุดและข้อความระบุว่ายังไม่ได้อ่าน */}
                    {!n.read && (
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-brand font-semibold">
                        <span className="size-2 rounded-full bg-brand" />
                        ยังไม่ได้อ่าน
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </AppShell>
  );
}


