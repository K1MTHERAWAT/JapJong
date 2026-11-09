'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Clock,
  Package,
  Search,
  Wrench,
} from 'lucide-react';
import {
  BorrowRequest,
  ROLE_LABEL,
  RequestType,
  RequestWithTimeline,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell, roleHomePath } from '@/components/shell';
import {
  Button,
  Card,
  EmptyState,
  ListRow,
  ServiceCard,
  StatusChip,
  RequestTypeChip,
  Tabs,
} from '@/components/ui';
import { api, formatPeriodRange, formatThaiDate, formatThaiDateTime, getStoredToken } from '@/lib/api';
import { resolveLiffTarget } from '@/lib/liff';

type TabFilter = 'all' | RequestType;

export default function HomePage() {
  const router = useRouter();
  const { account, notifications } = useAuth();
  const [requests, setRequests] = useState<RequestWithTimeline[]>([]);
  const [tab, setTab] = useState<TabFilter>('all');
  const [search, setSearch] = useState('');

  // ดักจับกรณีผู้ใช้เปิดมาจาก LINE LIFF (เช่น Endpoint URL ใน LINE Developers Console ชี้มาที่ '/')
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.location.search;
    if (!query) return;

    if (query.includes('liff.state') || query.includes('target=') || query.includes('redirect=')) {
      const target = resolveLiffTarget(null, query, '');
      const token = getStoredToken();
      if (target && target !== '/') {
        if (token) {
          router.replace(target);
        } else {
          router.replace(`/liff${query}`);
        }
      } else if (query.includes('liff.state') && !token) {
        router.replace(`/liff${query}`);
      }
    }
  }, [router]);

  // หากเป็น STAFF, APPROVER_L2, APPROVER_L1 หรือ ADMIN ให้เด้งไปยังหน้าหลักของบทบาทตนเองทันที
  useEffect(() => {
    if (account && account.role !== 'USER') {
      router.replace(roleHomePath(account.role));
    }
  }, [account, router]);

  useEffect(() => {
    if (account && account.role !== 'USER') return;
    api
      .listRequests({ mine: true })
      .then(setRequests)
      .catch(() => {});
  }, [account?.id, account?.role]);

  const filtered = requests.filter((r) => {
    if (tab !== 'all' && r.type !== tab) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const dueBorrow = requests.find(
    (r): r is RequestWithTimeline & BorrowRequest =>
      r.type === 'borrow' && r.status === 'borrowing',
  );

  if (account && account.role !== 'USER') {
    return (
      <AppShell>
        <div className="jw-card p-12 text-center text-ink-mute">
          กำลังนำคุณไปยังหน้าหลัก {ROLE_LABEL[account.role]}...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-7 w-full">
        {/* Banner if staff/approver/admin viewing citizen home */}
        {account && account.role !== 'USER' && (
          <Card className="bg-brand-tint border-brand/30 flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <div className="text-body font-semibold text-brand-ink">
                คุณกำลังเข้าใช้งานในบทบาท: {account.name} ({ROLE_LABEL[account.role]})
              </div>
              <p className="text-caption text-brand-ink/80 mt-0.5">
                หน้านี้คือหน้าแรกสำหรับประชาชน คุณสามารถสลับไปยังแดชบอร์ดงานของคุณได้ทันที
              </p>
            </div>
            <Link href={roleHomePath(account.role)}>
              <Button variant="primary" className="h-9 px-3.5 text-caption">
                ไปหน้าหลัก {ROLE_LABEL[account.role]} <ArrowRight className="size-4" />
              </Button>
            </Link>
          </Card>
        )}

        {/* Hero & Search Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
          <div>
            <h1 className="text-title md:text-display text-ink font-bold tracking-tight">
              สวัสดี, คุณ{account?.nickname || account?.name.split(' ')[0] || 'ผู้มาติดต่อ'}
            </h1>
            <p className="text-body text-muted mt-1">
              เลือกบริการเทศบาล/อบต. ที่ต้องการดำเนินการ
            </p>
          </div>
          <div className="relative w-full md:w-80 lg:w-96">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
              <Search className="size-5" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารหัสคำขอ หรือรายการ..."
              className="h-11 w-full rounded-control border border-line-input bg-surface pl-10 pr-4 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-brand"
            />
          </div>
        </div>

        {/* 3 Service Cards Grid */}
        <section aria-label="บริการหลัก">
          <div className="grid gap-4 md:grid-cols-3">
            <ServiceCard
              href="/booking"
              title="ขอใช้สถานที่"
              description="ห้องประชุม ศาลา สนามกีฬา และพื้นที่จัดกิจกรรมส่วนกลาง"
              icon={Building2}
            />
            <ServiceCard
              href="/borrow"
              title="ยืม–คืนอุปกรณ์"
              description="เครื่องเสียง โปรเจกเตอร์ เต็นท์ โต๊ะ เก้าอี้ และครุภัณฑ์"
              icon={Package}
            />
            <ServiceCard
              href="/repair"
              title="แจ้งซ่อมและปัญหา"
              description="แจ้งอุปกรณ์ชำรุด อาคารสถานที่เสียหาย และติดตามผลการซ่อม"
              icon={Wrench}
            />
          </div>
        </section>

        {/* 2-Column Dashboard on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-7 items-start">
          {/* Left Column: My Requests */}
          <section aria-label="คำขอของฉัน" className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-heading font-bold text-ink">คำขอของฉัน</h2>
                <span className="text-caption text-muted">({filtered.length})</span>
              </div>
              <Tabs<TabFilter>
                value={tab}
                onChange={setTab}
                className="w-full sm:w-auto"
                options={[
                  { value: 'all', label: 'ทั้งหมด' },
                  { value: 'booking', label: 'สถานที่' },
                  { value: 'borrow', label: 'อุปกรณ์' },
                  { value: 'repair', label: 'แจ้งซ่อม' },
                ]}
              />
            </div>

            <Card padding="none" className="p-2 sm:p-4">
              {filtered.length === 0 ? (
                <EmptyState
                  title="ยังไม่มีคำขอในหมวดนี้"
                  description="คุณสามารถเลือกบริการด้านบนเพื่อสร้างคำขอจองสถานที่ ยืมอุปกรณ์ หรือแจ้งซ่อมได้ทันที"
                  actionLabel="ขอใช้สถานที่"
                  actionHref="/booking"
                />
              ) : (
                <div className="divide-y divide-line-soft">
                  {filtered.map((req) => {
                    const dateText =
                      req.type === 'booking'
                        ? formatPeriodRange(req.periods[0])
                        : req.type === 'borrow'
                        ? `${formatThaiDate(req.pickupDate, false)} – ${formatThaiDate(req.returnDate, true)}`
                        : req.subtitle;

                    const targetHref =
                      req.type === 'repair'
                        ? `/repair?mode=track&id=${req.id}`
                        : `/requests/${req.id}`;

                    if (account && account.role !== 'USER') {
    return (
      <AppShell>
        <div className="jw-card p-12 text-center text-ink-mute">
          กำลังนำคุณไปยังหน้าหลัก {ROLE_LABEL[account.role]}...
        </div>
      </AppShell>
    );
  }

  return (
                      <ListRow
                        key={req.id}
                        href={targetHref}
                        code={<><RequestTypeChip type={req.type} /><span className="font-mono">{req.code}</span></>}
                        title={req.title}
                        subtitle={dateText}
                        chip={<StatusChip status={req.status} />}
                        className="px-2 hover:bg-hover rounded-control transition-colors"
                      />
                    );
                  })}
                </div>
              )}
            </Card>
          </section>

          {/* Right Column: Due Borrows & Recent Notifications */}
          <aside aria-label="ข้อมูลประกอบ" className="flex flex-col gap-6">
            {/* Due Return Box */}
            <div className="flex flex-col gap-2">
              <h2 className="text-heading font-bold text-ink">กำหนดส่งคืนอุปกรณ์</h2>
              {dueBorrow ? (
                <Card className="border-warn-fg/30 bg-warn-bg/50 p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-body font-semibold text-warn-fg">
                      <Clock className="size-4 shrink-0" />
                      <span className="truncate">คืน: {dueBorrow.title}</span>
                    </div>
                    <div className="text-caption text-muted mt-1">
                      กำหนดคืนภายใน {formatThaiDate(dueBorrow.returnDate)}
                    </div>
                  </div>
                  <Link href="/borrow/my" className="shrink-0">
                    <Button variant="secondary" className="h-9 px-3 text-caption">
                      แจ้งคืน
                    </Button>
                  </Link>
                </Card>
              ) : (
                <Card className="p-4 text-center text-body text-muted">
                  ไม่มีอุปกรณ์ที่กำลังยืมหรือครบกำหนดคืน
                </Card>
              )}
            </div>

            {/* Recent Notifications */}
            <div className="flex flex-col gap-2">
              <h2 className="text-heading font-bold text-ink">แจ้งเตือนล่าสุด</h2>
              <Card padding="none" className="p-2 sm:p-3">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-body text-muted">
                    ไม่มีการแจ้งเตือน
                  </div>
                ) : (
                  <div className="divide-y divide-line-soft">
                    {notifications.slice(0, 4).map((n) => (
                      <div
                        key={n.id}
                        onClick={() => n.link && router.push(n.link)}
                        className={`p-3 rounded-control cursor-pointer hover:bg-hover transition-colors ${
                          !n.read ? 'bg-brand-tint/30' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-body font-semibold text-ink truncate">
                            {n.title}
                          </span>
                          <span className="text-[11px] text-muted shrink-0">
                            {formatThaiDateTime(n.at)}
                          </span>
                        </div>
                        <p className="text-caption text-muted mt-1 line-clamp-2">
                          {n.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
