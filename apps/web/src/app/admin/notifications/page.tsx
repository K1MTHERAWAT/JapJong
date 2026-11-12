'use client';

/**
 * =====================================================================
 * หน้าตรวจสอบประวัติการส่ง LINE Notification & งานค้าง (Admin Notification Logs)
 * =====================================================================
 * ระบบแดชบอร์ดสำหรับตรวจสอบการจัดส่งข้อความผ่าน LINE Messaging API:
 * 1. KPI สรุปผลการส่ง: ทั้งหมด, สำเร็จ (SENT), ล้มเหลว (FAILED), รอคิว (PENDING), ข้าม (SKIPPED)
 * 2. ตัวกรองสถานะ และช่องค้นหาผู้รับ / รหัสคำขอ / ข้อผิดพลาด
 * 3. ตารางประวัติ Log การส่ง พร้อมจำนวนรอบความพยายาม (Attempt Count)
 * 4. ปุ่มสั่งส่งซ้ำ (Retry Button) สำหรับรายการที่ส่งไม่สำเร็จ
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  RefreshCw,
  RotateCw,
  Search,
  XCircle,
} from 'lucide-react';
import {
  AdminNotificationDashboardSummary,
  LineDeliveryStatus,
} from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Feedback } from '@/components/ui';
import { api, formatThaiDateTime } from '@/lib/api';

export default function AdminNotificationDashboardPage() {
  // State สถานะกำลังโหลดข้อมูล
  const [loading, setLoading] = useState(true);
  // State ข้อมูลสรุปสถิติและรายการล็อก
  const [data, setData] = useState<AdminNotificationDashboardSummary | null>(null);
  // State ตัวกรองสถานะการส่ง
  const [statusFilter, setStatusFilter] = useState<LineDeliveryStatus | 'ALL'>('ALL');
  // State ข้อความค้นหา
  const [search, setSearch] = useState('');
  // State เก็บ ID ของรายการที่กำลังกดส่งซ้ำ
  const [retryingId, setRetryingId] = useState<string | null>(null);
  // State ข้อความแจ้งเตือนผลการดำเนินงาน
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ฟังก์ชันดึงข้อมูลบันทึกประวัติการส่งจาก API
  const fetchLogs = async () => {
    try {
      const res = await api.getAdminNotificationLogs(
        statusFilter === 'ALL' ? undefined : statusFilter,
        150,
      );
      setData(res);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: (err as Error).message || 'ไม่สามารถโหลดประวัติการแจ้งเตือนได้',
      });
    } finally {
      setLoading(false);
    }
  };

  // โหลดข้อมูลใหม่เมื่อเปลี่ยนแท็บตัวกรองสถานะ
  useEffect(() => {
    fetchLogs();
  }, [statusFilter]);

  // ฟังก์ชันสั่งส่งข้อความแจ้งเตือนซ้ำ (Retry Notification)
  const handleRetry = async (logId: string) => {
    setRetryingId(logId);
    setFeedback(null);
    try {
      const res = await api.retryNotification(logId);
      if (res.ok) {
        setFeedback({
          type: 'success',
          message: 'สั่งส่งแจ้งเตือนซ้ำสำเร็จเรียบร้อยแล้ว',
        });
        await fetchLogs();
      } else {
        setFeedback({
          type: 'error',
          message: res.log?.errorMessage || 'การส่งซ้ำล้มเหลว กรุณาตรวจสอบสถานะ LINE OA',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: (err as Error).message || 'เกิดข้อผิดพลาดในการส่งซ้ำ',
      });
    } finally {
      setRetryingId(null);
    }
  };

  // กรองรายการ Log ตามคำค้นหา (ชื่อผู้รับ, user ID, รหัสคำขอ, ประเภท, หรือ Error Code)
  const filteredLogs = (data?.logs || []).filter((l) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (l.userName && l.userName.toLowerCase().includes(s)) ||
      l.userId.toLowerCase().includes(s) ||
      (l.referenceId && l.referenceId.toLowerCase().includes(s)) ||
      (l.notificationType && l.notificationType.toLowerCase().includes(s)) ||
      (l.errorCode && l.errorCode.toLowerCase().includes(s))
    );
  });

  // ฟังก์ชันแสดงชิปสถานะพร้อมไอคอน
  const getStatusChip = (status: LineDeliveryStatus) => {
    switch (status) {
      case 'SENT':
        return (
          <Chip tone="green" className="gap-1">
            <CheckCircle2 className="size-3" />
            <span>สำเร็จ (SENT)</span>
          </Chip>
        );
      case 'FAILED':
        return (
          <Chip tone="red" className="gap-1">
            <XCircle className="size-3" />
            <span>ล้มเหลว (FAILED)</span>
          </Chip>
        );
      case 'PROCESSING':
      case 'PENDING':
        return (
          <Chip tone="amber" className="gap-1">
            <Clock className="size-3" />
            <span>{status === 'PROCESSING' ? 'กำลังส่ง' : 'รอคิว'}</span>
          </Chip>
        );
      case 'SKIPPED':
      default:
        return (
          <Chip tone="gray" className="gap-1">
            <span>ข้าม (SKIPPED)</span>
          </Chip>
        );
    }
  };

  return (
    <AppShell maxWidth="max-w-[1200px]">
      <div className="flex flex-col gap-6">
        {/* ส่วนหัวหน้าจอ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-1.5 -ml-1.5 rounded-full hover:bg-hover text-ink-soft transition-colors"
            >
              <ArrowLeft className="size-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-display font-bold text-ink">บันทึกการส่ง LINE & งานค้าง</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-brand-tint text-brand text-[12px] font-bold">
                  Admin Dashboard
                </span>
              </div>
              <p className="text-body text-muted mt-0.5">
                ตรวจสอบประวัติการแจ้งเตือน อัตราการส่งสำเร็จ และสั่งส่งซ้ำ (Retry) รายการที่มีปัญหา
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            onClick={() => {
              setLoading(true);
              fetchLogs();
            }}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span>รีเฟรชข้อมูล</span>
          </Button>
        </div>

        {/* แถบแจ้งเตือน Feedback แจ้งผลการทำงาน */}
        {feedback && (
          <Feedback tone={feedback.type === 'error' ? 'crit' : 'brand'}>
            {feedback.message}
          </Feedback>
        )}

        {/* การ์ดสถิติ Metric รวม 5 ด้าน */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          <Card className="p-4 flex flex-col gap-1">
            <div className="text-[12px] text-muted font-medium">แจ้งเตือนทั้งหมด</div>
            <b className="text-[24px] text-ink">{data?.total ?? 0}</b>
            <div className="text-[11px] text-ink-mute">รายการในระบบ</div>
          </Card>
          <Card className="p-4 flex flex-col gap-1 border-emerald-200 bg-emerald-50/30">
            <div className="text-[12px] text-emerald-800 font-medium">ส่งสำเร็จ (SENT)</div>
            <b className="text-[24px] text-emerald-700">{data?.sent ?? 0}</b>
            <div className="text-[11px] text-emerald-600">ผ่าน LINE Messaging API</div>
          </Card>
          <Card className="p-4 flex flex-col gap-1 border-rose-200 bg-rose-50/30">
            <div className="text-[12px] text-rose-800 font-medium">ส่งไม่สำเร็จ (FAILED)</div>
            <b className="text-[24px] text-rose-700">{data?.failed ?? 0}</b>
            <div className="text-[11px] text-rose-600">ต้องตรวจสอบหรือ Retry</div>
          </Card>
          <Card className="p-4 flex flex-col gap-1 border-amber-200 bg-amber-50/30">
            <div className="text-[12px] text-amber-800 font-medium">รอส่ง / กำลังส่ง</div>
            <b className="text-[24px] text-amber-700">{data?.pending ?? 0}</b>
            <div className="text-[11px] text-amber-600">ใน Notification Queue</div>
          </Card>
          <Card className="p-4 flex flex-col gap-1 border-line-soft">
            <div className="text-[12px] text-muted font-medium">ข้ามการส่ง (SKIPPED)</div>
            <b className="text-[24px] text-ink-mute">{data?.skipped ?? 0}</b>
            <div className="text-[11px] text-ink-mute">ไม่มี LINE หรือปิดรับ</div>
          </Card>
        </div>

        {/* แถบตัวกรองสถานะ และช่องค้นหาข้อความ */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface p-3 rounded-control border border-line">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
            {(['ALL', 'SENT', 'FAILED', 'PENDING', 'SKIPPED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-full text-caption font-medium transition-colors shrink-0 ${
                  statusFilter === st
                    ? 'bg-brand text-white'
                    : 'bg-surface-muted text-ink-soft hover:bg-hover'
                }`}
              >
                {st === 'ALL'
                  ? 'ทั้งหมด'
                  : st === 'SENT'
                  ? 'สำเร็จ'
                  : st === 'FAILED'
                  ? 'ล้มเหลว'
                  : st === 'PENDING'
                  ? 'รอคิว'
                  : 'ข้าม'}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, รหัสคำขอ, Error..."
              className="w-full pl-9 pr-3 py-1.5 rounded-control bg-surface-muted border border-line text-caption text-ink placeholder:text-muted focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        {/* ตารางแสดงรายการประวัติ Log */}
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-caption">
              <thead>
                <tr className="border-b border-line bg-surface-muted text-muted font-semibold text-[12px]">
                  <th className="py-3 px-4">วัน-เวลา</th>
                  <th className="py-3 px-4">ผู้รับ</th>
                  <th className="py-3 px-4">ประเภทการแจ้งเตือน</th>
                  <th className="py-3 px-4">รหัสอ้างอิง</th>
                  <th className="py-3 px-4">สถานะการส่ง</th>
                  <th className="py-3 px-4">จำนวนรอบ</th>
                  <th className="py-3 px-4">รายละเอียด / ข้อผิดพลาด</th>
                  <th className="py-3 px-4 text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted">
                      ไม่พบประวัติการแจ้งเตือนตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-muted/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-ink-soft">
                        {formatThaiDateTime(log.sentAt || log.createdAt, true)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-ink">{log.userName || log.userId}</div>
                        <div className="text-[11px] text-muted font-mono">{log.userId}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[12px]">{log.notificationType}</span>
                      </td>
                      <td className="py-3 px-4">
                        {log.referenceId ? (
                          <span className="font-mono px-1.5 py-0.5 rounded bg-surface-muted border border-line text-brand font-semibold">
                            #{log.referenceId}
                          </span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{getStatusChip(log.status)}</td>
                      <td className="py-3 px-4 text-center font-mono font-medium">
                        {log.attemptCount}
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        {log.errorMessage ? (
                          <div className="text-rose-700 text-[12px] font-medium truncate" title={log.errorMessage}>
                            {log.errorCode && <span className="font-bold">[{log.errorCode}] </span>}
                            {log.errorMessage}
                          </div>
                        ) : log.providerMessageId ? (
                          <div className="text-muted text-[11px] font-mono truncate" title={log.providerMessageId}>
                            msgId: {log.providerMessageId}
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {log.status === 'FAILED' ? (
                          <Button
                            variant="secondary"
                            onClick={() => handleRetry(log.id)}
                            disabled={retryingId === log.id}
                            className="gap-1.5 py-1 px-2.5 text-[12px] border-rose-300 text-rose-800 hover:bg-rose-50"
                          >
                            <RotateCw className={`size-3.5 ${retryingId === log.id ? 'animate-spin' : ''}`} />
                            <span>{retryingId === log.id ? 'กำลังส่ง...' : 'ส่งซ้ำ'}</span>
                          </Button>
                        ) : (
                          <span className="text-muted text-[12px]">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
