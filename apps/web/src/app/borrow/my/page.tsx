'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BorrowRequest, RequestWithTimeline } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, StatusChip, Tabs } from '@/components/ui';
import { api, formatThaiDate } from '@/lib/api';

type BorrowTab = 'borrowing' | 'inspect' | 'history';

export default function MyBorrowsPage() {
  const { account } = useAuth();
  const [items, setItems] = useState<(RequestWithTimeline & BorrowRequest)[]>([]);
  const [tab, setTab] = useState<BorrowTab>('borrowing');

  const load = useCallback(() => {
    api
      .listRequests({ mine: true, type: 'borrow' })
      .then((list) => setItems(list as (RequestWithTimeline & BorrowRequest)[]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load, account?.id]);

  const handleReturn = async (id: string) => {
    await api.returnRequest(id);
    load();
  };

  const filtered = items.filter((r) => {
    if (tab === 'borrowing') return r.status === 'borrowing' || r.status === 'approved' || r.status.startsWith('pending');
    if (tab === 'inspect') return r.status === 'return_inspect';
    return r.status === 'returned' || r.status === 'cancelled' || r.status === 'rejected';
  });

  return (
    <AppShell title="อุปกรณ์" backHref="/" maxWidth="max-w-[960px]">
      <div className="flex flex-col gap-4">
        <Tabs<BorrowTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'borrowing', label: 'กำลังใช้งาน' },
            { value: 'inspect', label: 'รอตรวจสภาพ' },
            { value: 'history', label: 'ประวัติ' },
          ]}
        />

        <div className="flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="jw-card p-8 text-center text-[14px] text-ink-mute">ไม่มีรายการในหมวดนี้</div>
          ) : (
            filtered.map((r) => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const isSoon = r.returnDate <= todayStr && r.status === 'borrowing';
              return (
                <div key={r.id} className="jw-card p-4 flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-brand-mint text-brand flex items-center justify-center shrink-0">
                    <Icon name="package" className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <b className="text-[15px] text-ink truncate">{r.title}</b>
                    <span className="text-[13px] text-ink-mute">
                      กำหนดคืน {formatThaiDate(r.returnDate)} · {r.code}
                    </span>
                    <div>
                      {isSoon ? <Chip tone="amber">ครบกำหนดพรุ่งนี้</Chip> : <StatusChip status={r.status} />}
                    </div>
                  </div>
                  {r.status === 'borrowing' && (
                    <button
                      type="button"
                      onClick={() => handleReturn(r.id)}
                      className="jw-btn jw-btn-sm shrink-0"
                    >
                      แจ้งคืน
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <p className="text-[13px] text-ink-mute">
          ระบบแจ้งเตือนผ่าน LINE ล่วงหน้า 1 วันก่อนครบกำหนดคืน
        </p>

        <Link href="/borrow" className="jw-btn-sec w-full">
          + ยื่นขอใช้อุปกรณ์เพิ่ม
        </Link>
      </div>
    </AppShell>
  );
}
