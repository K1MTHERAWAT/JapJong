'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { AppNotification } from '@jongwen/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Button, Card, Chip } from '@/components/ui';
import { formatThaiDateTime } from '@/lib/api';

type NotificationFilter = 'all' | 'unread' | 'booking' | 'borrow' | 'repair' | 'signing';

export default function NotificationCenterPage() {
  const router = useRouter();
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useAuth();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === 'unread') return !n.read;
      if (filter === 'booking') {
        return (
          n.referenceType === 'booking' ||
          n.notificationType === 'BOOKING_STATUS' ||
          n.title?.includes('จอง')
        );
      }
      if (filter === 'borrow') {
        return (
          n.referenceType === 'borrow' ||
          n.notificationType === 'BORROW_STATUS' ||
          n.notificationType === 'BORROW_RETURN' ||
          n.title?.includes('ยืม') ||
          n.title?.includes('คืน')
        );
      }
      if (filter === 'repair') {
        return (
          n.referenceType === 'repair' ||
          n.notificationType === 'REPAIR_STATUS' ||
          n.title?.includes('ซ่อม')
        );
      }
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

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
    } finally {
      setMarkingAll(false);
    }
  };

  const handleClickItem = async (n: AppNotification) => {
    if (!n.read) {
      await markNotificationRead(n.id);
    }
    if (n.link) {
      router.push(n.link);
    }
  };

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
        {/* Header Bar */}
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
            <Link href="/notifications/settings">
              <Button variant="secondary" className="gap-2">
                <Settings className="size-4" />
                <span>ตั้งค่าการแจ้งเตือน</span>
              </Button>
            </Link>
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

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
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

        {/* Notifications List */}
        <Card padding="none" className="overflow-hidden divide-y divide-line-soft">
          {filteredNotifications.length === 0 ? (
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
                <div
                  className={`size-11 rounded-control flex items-center justify-center shrink-0 border ${
                    !n.read
                      ? 'bg-white border-brand/20 shadow-xs'
                      : 'bg-surface-muted border-line-soft'
                  }`}
                >
                  {getCategoryIcon(n)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <b
                      className={`text-[15px] truncate ${
                        !n.read ? 'text-ink font-bold' : 'text-ink-soft font-medium'
                      }`}
                    >
                      {n.title}
                    </b>
                    <span className="text-[12px] text-ink-mute shrink-0 flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatThaiDateTime(n.createdAt || n.at)}
                    </span>
                  </div>

                  <p className="text-body text-muted mt-1 leading-relaxed break-words">
                    {n.message || n.body}
                  </p>

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

