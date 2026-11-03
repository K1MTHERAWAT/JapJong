'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ExternalLink,
  Info,
  MessageSquare,
  QrCode,
  Send,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  LineNotificationStatusResponse,
  NotificationCategory,
  NotificationChannel,
  UserNotificationPreference,
} from '@jongwen/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Feedback } from '@/components/ui';
import { api } from '@/lib/api';

const CATEGORIES: {
  key: NotificationCategory;
  title: string;
  desc: string;
}[] = [
  {
    key: 'BOOKING_STATUS',
    title: 'สถานะคำขอจองสถานที่',
    desc: 'แจ้งเมื่อส่งคำขอ, อยู่ระหว่างตรวจสอบ, ได้รับอนุมัติ, ไม่ผ่าน หรือแจ้งเตือนก่อนถึงวันใช้งาน',
  },
  {
    key: 'BORROW_STATUS',
    title: 'สถานะคำขอยืมอุปกรณ์',
    desc: 'แจ้งเมื่อส่งคำขอยืม, ตรวจสอบสต็อก, ผลการอนุมัติ และเอกสารพร้อมดาวน์โหลด',
  },
  {
    key: 'BORROW_RETURN',
    title: 'แจ้งเตือนการคืนอุปกรณ์',
    desc: 'แจ้งเตือนก่อนถึงวันรับอุปกรณ์, เตือนกำหนดส่งคืน และเมื่อเลยกำหนดส่งคืน',
  },
  {
    key: 'REPAIR_STATUS',
    title: 'สถานะการซ่อมบำรุง / แจ้งปัญหา',
    desc: 'แจ้งเมื่อเจ้าหน้าที่รับเรื่อง, เริ่มดำเนินการ, ซ่อมเสร็จ และรอตรวจรับงาน',
  },
  {
    key: 'DOCUMENT_SIGNING',
    title: 'แจ้งเตือนเอกสารลงนาม',
    desc: 'แจ้งเมื่อมีเอกสารรอลงนามตามลำดับขั้น, ลงนามสำเร็จ และเอกสารได้รับการอนุมัติครบถ้วน',
  },
];

export default function NotificationSettingsPage() {
  const { account } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lineStatus, setLineStatus] = useState<LineNotificationStatusResponse | null>(null);
  const [preferences, setPreferences] = useState<UserNotificationPreference[]>([]);
  const [saving, setSaving] = useState(false);
  const [testingLine, setTestingLine] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.getLineNotificationStatus(), api.getNotificationPreferences()])
      .then(([statusRes, prefRes]) => {
        if (!active) return;
        setLineStatus(statusRes);
        setPreferences(prefRes.preferences || []);
      })
      .catch((err) => {
        if (!active) return;
        setFeedback({
          type: 'error',
          message: err.message || 'ไม่สามารถโหลดข้อมูลการตั้งค่าการแจ้งเตือนได้',
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const isEnabled = (channel: NotificationChannel, type: NotificationCategory): boolean => {
    const item = preferences.find((p) => p.channel === channel && p.notificationType === type);
    return item ? item.isEnabled : channel === 'IN_APP';
  };

  const handleToggle = (channel: NotificationChannel, type: NotificationCategory) => {
    setPreferences((prev) => {
      const idx = prev.findIndex((p) => p.channel === channel && p.notificationType === type);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], isEnabled: !next[idx].isEnabled };
        return next;
      }
      return [
        ...prev,
        {
          id: `tmp-${channel}-${type}`,
          userId: account?.id || '',
          channel,
          notificationType: type,
          isEnabled: channel === 'LINE', // toggle from default
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const payload = preferences.map((p) => ({
        channel: p.channel,
        notificationType: p.notificationType,
        isEnabled: p.isEnabled,
      }));
      const res = await api.updateNotificationPreferences(payload);
      setPreferences(res.preferences);
      setFeedback({
        type: 'success',
        message: 'บันทึกการตั้งค่าช่องทางแจ้งเตือนเรียบร้อยแล้ว',
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: (err as Error).message || 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestLine = async () => {
    setTestingLine(true);
    setFeedback(null);
    try {
      const res = await api.testLineNotification({ useFlex: true });
      if (res.ok) {
        setFeedback({
          type: 'success',
          message: 'ส่งข้อความทดสอบไปยัง LINE เรียบร้อยแล้ว กรุณาตรวจสอบในแอป LINE ของคุณ',
        });
      } else {
        const errorDetail = res.lineLog?.errorMessage || 'กรุณาตรวจสอบว่าได้เพิ่มเพื่อน LINE OA หรือยัง';
        setFeedback({
          type: 'error',
          message: `ไม่สามารถส่งแจ้งเตือนผ่าน LINE ได้: ${errorDetail}`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: (err as Error).message || 'เกิดข้อผิดพลาดในการทดสอบส่งข้อความ',
      });
    } finally {
      setTestingLine(false);
    }
  };

  return (
    <AppShell maxWidth="max-w-[960px]">
      <div className="flex flex-col gap-6">
        {/* Top Back Link */}
        <div className="flex items-center gap-3">
          <Link
            href="/notifications"
            className="p-1.5 -ml-1.5 rounded-full hover:bg-hover text-ink-soft transition-colors"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-display font-bold text-ink">ตั้งค่าการแจ้งเตือน</h1>
            <p className="text-body text-muted">
              กำหนดช่องทางการรับข่าวสารผ่านเว็บไซต์ (In-App) และ LINE Official Account
            </p>
          </div>
        </div>

        {feedback && (
          <Feedback tone={feedback.type === 'error' ? 'crit' : feedback.type === 'success' ? 'brand' : 'neutral'}>
            {feedback.message}
          </Feedback>
        )}

        {/* Card 1: LINE OA Connection & Friendship Status */}
        <Card className="p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-4">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-control bg-[#06C755]/10 text-[#06C755] flex items-center justify-center shrink-0">
                <MessageSquare className="size-6" />
              </div>
              <div>
                <b className="text-[16px] text-ink">LINE Official Account (LINE OA)</b>
                <div className="text-caption text-muted">
                  รับการแจ้งเตือนสถานะคำขออัตโนมัติส่งตรงถึงสมาร์ตโฟนของคุณ
                </div>
              </div>
            </div>

            {lineStatus?.isLinked ? (
              <Chip tone="green" className="gap-1.5">
                <CheckCircle2 className="size-3.5" />
                <span>เชื่อมต่อ LINE แล้ว</span>
              </Chip>
            ) : (
              <Chip tone="amber" className="gap-1.5">
                <AlertTriangle className="size-3.5" />
                <span>ยังไม่ได้เชื่อมต่อ LINE</span>
              </Chip>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Left: Account details */}
            <div className="rounded-control bg-surface-muted border border-line-soft p-4 flex flex-col justify-between gap-3">
              <div className="flex items-center gap-3">
                {lineStatus?.lineAccount?.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={lineStatus.lineAccount.pictureUrl}
                    alt={lineStatus.lineAccount.displayName}
                    className="size-12 rounded-full border border-line object-cover"
                  />
                ) : (
                  <div className="size-12 rounded-full bg-brand-tint text-brand font-bold flex items-center justify-center text-[18px]">
                    {account?.name?.charAt(0) || 'L'}
                  </div>
                )}
                <div>
                  <div className="text-caption text-muted">บัญชี LINE ที่เชื่อมต่อ:</div>
                  <b className="text-[15px] text-ink">{lineStatus?.lineAccount?.displayName || account?.lineName || 'LINE User'}</b>
                  <div className="text-[12px] text-ink-mute flex items-center gap-1.5 mt-0.5">
                    <span>สถานะความสัมพันธ์กับ OA:</span>
                    {lineStatus?.lineAccount?.friendshipStatus === 'FRIEND' ? (
                      <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                        <UserCheck className="size-3.5" /> เป็นเพื่อนกับ OA แล้ว
                      </span>
                    ) : lineStatus?.lineAccount?.friendshipStatus === 'BLOCKED' ? (
                      <span className="text-rose-700 font-semibold inline-flex items-center gap-1">
                        <XCircle className="size-3.5" /> บล็อก OA
                      </span>
                    ) : (
                      <span className="text-amber-700 font-semibold">ยังไม่ทราบสถานะเพื่อน</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-[12px] text-muted leading-relaxed border-t border-line-soft pt-2.5">
                💡 <b>คำแนะนำ:</b> เพื่อให้ได้รับข้อความแจ้งเตือน กรุณาเพิ่มเพื่อน LINE OA ของ Jongwen และหลีกเลี่ยงการบล็อกบัญชี
              </div>
            </div>

            {/* Right: Actions */}
            <div className="rounded-control bg-surface-muted border border-line-soft p-4 flex flex-col justify-between gap-3">
              <div>
                <b className="text-caption font-semibold text-ink">การเพิ่มเพื่อนและการทดสอบ</b>
                <p className="text-[12px] text-muted mt-1 leading-relaxed">
                  หากยังไม่ได้เพิ่มเพื่อน สามารถกดเพิ่มเพื่อนผ่านปุ่มด้านล่าง จากนั้นกดทดสอบส่งข้อความแจ้งเตือน
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                {lineStatus?.addFriendUrl ? (
                  <a
                    href={lineStatus.addFriendUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1"
                  >
                    <Button variant="secondary" className="w-full gap-2 text-emerald-800 border-emerald-300 hover:bg-emerald-50">
                      <ExternalLink className="size-4" />
                      <span>เพิ่มเพื่อน LINE OA</span>
                    </Button>
                  </a>
                ) : (
                  <div className="text-[12px] text-ink-mute py-1">
                    LINE OA Basic ID: {lineStatus?.oaBasicId || 'ติดต่อผู้ดูแลระบบเพื่อขอ QR Code'}
                  </div>
                )}

                <Button
                  variant="primary"
                  onClick={handleTestLine}
                  disabled={testingLine || !lineStatus?.isLinked}
                  className="flex-1 gap-2"
                >
                  <Send className="size-4" />
                  <span>{testingLine ? 'กำลังส่ง...' : 'ทดสอบส่งแจ้งเตือน'}</span>
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Card 2: Notification Preferences Matrix */}
        <Card className="p-5 sm:p-6 flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line-soft pb-4">
            <div>
              <b className="text-[16px] text-ink">ประเภทการแจ้งเตือนที่ต้องการรับ</b>
              <p className="text-caption text-muted mt-0.5">
                เลือกเปิดหรือปิดช่องทางการแจ้งเตือนสำหรับแต่ละกิจกรรมได้อย่างอิสระ
              </p>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-ink-mute">
              <span className="size-2 rounded-full bg-brand" />
              <span>In-App (เว็บไซต์)</span>
              <span className="mx-1">·</span>
              <span className="size-2 rounded-full bg-[#06C755]" />
              <span>LINE OA</span>
            </div>
          </div>

          {/* Preferences Table */}
          <div className="divide-y divide-line-soft">
            {CATEGORIES.map((cat) => {
              const inAppActive = isEnabled('IN_APP', cat.key);
              const lineActive = isEnabled('LINE', cat.key);

              return (
                <div key={cat.key} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1 pr-4">
                    <b className="text-[15px] text-ink">{cat.title}</b>
                    <p className="text-[13px] text-muted mt-0.5 leading-relaxed">{cat.desc}</p>
                  </div>

                  <div className="flex items-center gap-6 shrink-0 self-end sm:self-center">
                    {/* In-App Toggle */}
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <span className="text-[13px] font-medium text-ink-soft">เว็บไซต์</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={inAppActive}
                        onClick={() => handleToggle('IN_APP', cat.key)}
                        className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none ${
                          inAppActive ? 'bg-brand' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`size-4 bg-white rounded-full transition-transform absolute top-1 left-1 ${
                            inAppActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </label>

                    {/* LINE Toggle */}
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <span className="text-[13px] font-medium text-ink-soft">LINE</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={lineActive}
                        onClick={() => handleToggle('LINE', cat.key)}
                        className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none ${
                          lineActive ? 'bg-[#06C755]' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`size-4 bg-white rounded-full transition-transform absolute top-1 left-1 ${
                            lineActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Privacy & Policy Note */}
          <div className="rounded-control bg-sky-50/70 border border-sky-200 p-3.5 flex items-start gap-2.5 text-[12px] text-sky-900 leading-relaxed">
            <Info className="size-4 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <b>นโยบายความเป็นส่วนตัว (PDPA) และความปลอดภัย:</b>
              <div className="mt-0.5 text-sky-800">
                การปิดรับการแจ้งเตือนทาง LINE จะไม่มีผลกระทบต่อการแจ้งเตือนภายในเว็บไซต์ (In-App)
                และข้อความที่ส่งผ่าน LINE จะไม่เปิดเผยข้อมูลส่วนบุคคลหรือเอกสารสำคัญที่เป็นความลับ
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <Button
              variant="primary"
              onClick={handleSavePreferences}
              disabled={saving}
              className="px-8"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

