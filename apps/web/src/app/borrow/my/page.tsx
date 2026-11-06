'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BorrowRequest, Equipment, RequestWithTimeline } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, StatusChip, Tabs } from '@/components/ui';
import { api, formatThaiDate, formatThaiDateTime, readAndCompressImages } from '@/lib/api';

type BorrowTab = 'borrowing' | 'inspect' | 'history';

type ExtendedBorrowRequest = RequestWithTimeline & BorrowRequest;

export default function MyBorrowsPage() {
  const { account } = useAuth();
  const [items, setItems] = useState<ExtendedBorrowRequest[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [tab, setTab] = useState<BorrowTab>('borrowing');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals state
  const [receiveModalTarget, setReceiveModalTarget] = useState<ExtendedBorrowRequest | null>(null);
  const [returnModalTarget, setReturnModalTarget] = useState<ExtendedBorrowRequest | null>(null);
  const [inspectModalTarget, setInspectModalTarget] = useState<ExtendedBorrowRequest | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Form states for modals
  const [formPhotos, setFormPhotos] = useState<string[]>([]);
  const [formNote, setFormNote] = useState('');
  const [inspectResult, setInspectResult] = useState<'normal' | 'damaged' | 'incomplete'>('normal');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStaffOrAdmin =
    account?.role === 'STAFF' || account?.role === 'ADMIN' || Boolean(account?.permissions?.review);

  // Load equipment & borrow requests
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eqs, reqs] = await Promise.all([
        api.equipment().catch(() => [] as Equipment[]),
        api.listRequests({ mine: true, type: 'borrow' }).catch(() => []),
      ]);
      setEquipmentList(eqs);
      setItems(reqs as ExtendedBorrowRequest[]);
    } catch {
      // silently keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, account?.id]);

  // Helper to find equipment metadata
  const getEquipmentInfo = (r: ExtendedBorrowRequest) => {
    const firstItem = r.items?.[0];
    const eq = equipmentList.find((e) => e.id === firstItem?.equipmentId);
    const totalQty = r.items?.reduce((sum, i) => sum + (i.qty || 0), 0) || 1;
    const name = eq?.name || r.title || 'อุปกรณ์';
    const code = eq?.id || firstItem?.equipmentId || '-';
    const photo = eq?.images?.[0] || null;
    return { name, code, totalQty, photo };
  };

  // Helper to extract approval date
  const getApprovalDate = (r: ExtendedBorrowRequest) => {
    const l1Sig = r.signatures?.find((s) => s.decision === 'approve' && s.level === 'l1');
    return l1Sig?.at || r.updatedAt;
  };

  // Handle Photo selection inside modals
  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    try {
      const maxRemaining = Math.max(0, 6 - formPhotos.length);
      if (maxRemaining === 0) return;
      const compressed = await readAndCompressImages(e.target.files, maxRemaining);
      if (compressed.length > 0) {
        setFormPhotos((prev) => [...prev, ...compressed].slice(0, 6));
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'ไม่สามารถโหลดรูปภาพได้');
    } finally {
      e.target.value = '';
    }
  };

  const removePhoto = (idx: number) => {
    setFormPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // 1. Confirm Receipt of Equipment
  const handleConfirmReceive = async () => {
    if (!receiveModalTarget) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      await api.receiveEquipment(receiveModalTarget.id, {
        photos: formPhotos,
        note: formNote.trim(),
      });
      setSuccessMsg('บันทึกการรับมอบอุปกรณ์เรียบร้อยแล้ว สถานะเปลี่ยนเป็น "กำลังใช้งาน"');
      setReceiveModalTarget(null);
      setFormPhotos([]);
      setFormNote('');
      await load();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'เกิดข้อผิดพลาดในการยืนยันรับมอบอุปกรณ์');
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Submit Return of Equipment
  const handleConfirmReturn = async () => {
    if (!returnModalTarget) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      await api.submitReturnEquipment(returnModalTarget.id, {
        photos: formPhotos,
        note: formNote.trim(),
      });
      setSuccessMsg('บันทึกข้อมูลการส่งคืนเรียบร้อยแล้ว รายการย้ายไปที่ Tab "รอตรวจสภาพ"');
      setReturnModalTarget(null);
      setFormPhotos([]);
      setFormNote('');
      setTab('inspect'); // switch to inspect tab
      await load();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'เกิดข้อผิดพลาดในการส่งคืนอุปกรณ์');
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Staff Inspect Return
  const handleConfirmInspect = async () => {
    if (!inspectModalTarget) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      await api.inspectReturnEquipment(inspectModalTarget.id, {
        result: inspectResult,
        note: formNote.trim(),
        photos: formPhotos,
      });
      setSuccessMsg('ตรวจสอบและตรวจรับคืนอุปกรณ์เรียบร้อยแล้ว รายการย้ายไปที่ Tab "ประวัติ"');
      setInspectModalTarget(null);
      setFormPhotos([]);
      setFormNote('');
      setTab('history'); // switch to history tab
      await load();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'เกิดข้อผิดพลาดในการบันทึกผลการตรวจสอบ');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter items by tab
  const filtered = items.filter((r) => {
    if (tab === 'borrowing') {
      // ดึงรายการคำขอยืมที่ผ่านการลงนามครบทุกลำดับ และมีสถานะเอกสารเป็น "เสร็จสิ้น"
      // คือ approved (ยังไม่ได้รับมอบ) หรือ borrowing (รับมอบแล้ว / กำลังใช้งาน)
      return r.status === 'approved' || r.status === 'borrowing';
    }
    if (tab === 'inspect') {
      // รอเจ้าหน้าที่ตรวจสอบสภาพ
      return r.status === 'return_inspect';
    }
    // ประวัติ: เสร็จสิ้น หรือ ยกเลิก/ไม่อนุมัติ
    return r.status === 'returned' || r.status === 'cancelled' || r.status === 'rejected';
  });

  return (
    <AppShell title="อุปกรณ์" backHref="/" maxWidth="max-w-[1000px]">
      <div className="flex flex-col gap-5">
        {/* Header Title & Description */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-heading font-bold text-ink">รายการยืม–คืนอุปกรณ์ของฉัน</h1>
            <p className="text-body text-ink-mute mt-0.5">
              ติดตามสถานะการรับมอบ ใช้งาน ส่งคืน และตรวจสอบสภาพอุปกรณ์
            </p>
          </div>
          <Link href="/borrow" className="jw-btn shrink-0 self-start sm:self-auto flex items-center gap-1.5">
            <Icon name="plus" className="w-4 h-4" />
            <span>ยื่นขอยืมอุปกรณ์ใหม่</span>
          </Link>
        </div>

        {/* Success / Error Alerts */}
        {successMsg && (
          <div className="jw-card bg-brand-soft/40 border-brand/40 p-4 flex items-center justify-between gap-3 text-brand-ink text-body rounded-2xl animate-fade-in">
            <div className="flex items-center gap-2.5">
              <Icon name="check" className="w-5 h-5 text-brand shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg('')}
              className="text-ink-mute hover:text-ink text-caption"
            >
              ปิด
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="jw-card bg-red-50 border-red-200 p-4 flex items-center justify-between gap-3 text-red-700 text-body rounded-2xl">
            <div className="flex items-center gap-2.5">
              <Icon name="alert-triangle" className="w-5 h-5 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              className="text-red-500 hover:text-red-800 text-caption"
            >
              ปิด
            </button>
          </div>
        )}

        {/* 3 Main Tabs */}
        <Tabs<BorrowTab>
          value={tab}
          onChange={(t) => {
            setTab(t);
            setErrorMsg('');
            setSuccessMsg('');
          }}
          options={[
            {
              value: 'borrowing',
              label: `ที่กำลังใช้งาน (${items.filter((r) => r.status === 'approved' || r.status === 'borrowing').length})`,
            },
            {
              value: 'inspect',
              label: `รอตรวจสภาพ (${items.filter((r) => r.status === 'return_inspect').length})`,
            },
            {
              value: 'history',
              label: `ประวัติ (${items.filter((r) => r.status === 'returned' || r.status === 'cancelled' || r.status === 'rejected').length})`,
            },
          ]}
        />

        {/* Content Area */}
        {loading ? (
          <div className="jw-card p-12 text-center text-body text-ink-mute flex flex-col items-center justify-center gap-3">
            <div className="size-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <span>กำลังโหลดรายการยืม–คืนอุปกรณ์...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="jw-card p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-soft text-ink-mute flex items-center justify-center">
              <Icon name="package" className="w-7 h-7" />
            </div>
            <b className="text-body font-semibold text-ink">ไม่มีรายการในหมวดนี้</b>
            <p className="text-caption text-ink-mute max-w-sm">
              {tab === 'borrowing'
                ? 'ไม่มีรายการที่ผ่านการอนุมัติหรือกำลังใช้งานในขณะนี้'
                : tab === 'inspect'
                ? 'ไม่มีรายการที่ส่งคืนและกำลังรอเจ้าหน้าที่ตรวจสอบสภาพ'
                : 'ยังไม่มีประวัติการยืม–คืนที่เสร็จสิ้น'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((r) => {
              const eqInfo = getEquipmentInfo(r);
              const approvalDate = getApprovalDate(r);
              const todayStr = new Date().toISOString().slice(0, 10);
              const isOverdue = r.returnDate < todayStr && r.status === 'borrowing';
              const isDueToday = r.returnDate === todayStr && r.status === 'borrowing';

              return (
                <div
                  key={r.id}
                  className="jw-card p-5 sm:p-6 flex flex-col gap-4 border border-line hover:border-brand/30 transition-all shadow-xs"
                >
                  {/* Top Row: Equipment info & Request Number */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      {/* Equipment Photo or Icon */}
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-brand-soft/50 border border-line-soft overflow-hidden shrink-0 flex items-center justify-center">
                        {eqInfo.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={eqInfo.photo}
                            alt={eqInfo.name}
                            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                            onClick={() => setPreviewImage(eqInfo.photo)}
                          />
                        ) : (
                          <Icon name="package" className="w-8 h-8 text-brand" />
                        )}
                      </div>

                      {/* Equipment & Request Info */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <b className="text-[17px] font-bold text-ink leading-tight truncate">
                            {eqInfo.name}
                          </b>
                          <span className="text-[12px] font-mono px-2 py-0.5 rounded-md bg-soft text-ink-mute border border-line">
                            รหัส: {eqInfo.code}
                          </span>
                        </div>

                        <div className="text-[13px] text-ink-mute flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>
                            เลขที่คำขอ: <b className="text-ink font-semibold">{r.code}</b>
                          </span>
                          <span>·</span>
                          <span>
                            จำนวน: <b className="text-ink font-semibold">{eqInfo.totalQty} ชิ้น</b>
                          </span>
                        </div>

                        <div className="text-[12px] text-ink-mute flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                          <span>วันที่อนุมัติ: {formatThaiDate(approvalDate)}</span>
                          <span>·</span>
                          <span className={isOverdue ? 'text-danger font-semibold' : ''}>
                            กำหนดส่งคืน: {formatThaiDate(r.returnDate)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center sm:flex-col sm:items-end gap-2 shrink-0">
                      {r.status === 'approved' && (
                        <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          ยังไม่ได้รับมอบ
                        </span>
                      )}
                      {r.status === 'borrowing' && (
                        <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          กำลังใช้งาน
                        </span>
                      )}
                      {r.status === 'return_inspect' && (
                        <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          รอตรวจสภาพ
                        </span>
                      )}
                      {r.status === 'returned' && (
                        <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          เสร็จสิ้น (คืนแล้ว)
                        </span>
                      )}
                      {isOverdue && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-100 text-red-700">
                          เกินกำหนดส่งคืน
                        </span>
                      )}
                      {isDueToday && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-800">
                          ครบกำหนดวันนี้
                        </span>
                      )}
                    </div>
                  </div>

                  {/* -------------------- TAB 1: ที่กำลังใช้งาน -------------------- */}
                  {tab === 'borrowing' && (
                    <div className="border-t border-line-soft pt-3.5 flex flex-col gap-3">
                      {/* กรณีที่ 1: ยังไม่ได้รับมอบอุปกรณ์ (status === approved) */}
                      {r.status === 'approved' && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/50 p-3.5 rounded-2xl border border-amber-200/60">
                          <div className="text-[13px] text-amber-900 flex items-center gap-2">
                            <Icon name="alert-triangle" className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              เอกสารอนุมัติครบเรียบร้อยแล้ว กรุณาตรวจสอบสภาพอุปกรณ์และกดยืนยันรับมอบ
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setReceiveModalTarget(r);
                              setFormPhotos([]);
                              setFormNote('');
                            }}
                            className="jw-btn jw-btn-sm shrink-0 self-end sm:self-auto bg-brand hover:bg-brand-hover text-white flex items-center gap-1.5"
                          >
                            <Icon name="check" className="w-4 h-4" />
                            <span>ยืนยันรับมอบอุปกรณ์</span>
                          </button>
                        </div>
                      )}

                      {/* กรณีที่ 2: รับมอบอุปกรณ์แล้ว (status === borrowing) */}
                      {r.status === 'borrowing' && (
                        <div className="flex flex-col gap-3 bg-soft/40 p-3.5 sm:p-4 rounded-2xl border border-line-soft">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                            <div>
                              <span className="text-ink-mute">วันที่รับมอบ: </span>
                              <b className="text-ink font-semibold">
                                {r.receivedAt ? formatThaiDateTime(r.receivedAt) : 'รับมอบแล้ว'}
                              </b>
                            </div>
                            <div>
                              <span className="text-ink-mute">กำหนดส่งคืน: </span>
                              <b className="text-ink font-semibold">
                                {formatThaiDate(r.returnDate)}
                              </b>
                            </div>
                          </div>

                          {/* รายละเอียดที่บันทึกไว้ตอนรับมอบ */}
                          {r.receiveNote && (
                            <div className="text-[13px] bg-white p-2.5 rounded-xl border border-line-soft">
                              <span className="text-ink-mute font-medium">บันทึกตอนรับมอบ: </span>
                              <span className="text-ink">{r.receiveNote}</span>
                            </div>
                          )}

                          {/* รูปภาพก่อนรับมอบ */}
                          {r.receivePhotos && r.receivePhotos.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[12px] text-ink-mute font-medium">
                                รูปภาพสภาพอุปกรณ์ก่อนรับมอบ ({r.receivePhotos.length} รูป):
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {r.receivePhotos.map((src, idx) => (
                                  <div
                                    key={idx}
                                    className="w-16 h-16 rounded-xl border border-line overflow-hidden cursor-pointer hover:opacity-90 transition shrink-0"
                                    onClick={() => setPreviewImage(src)}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={src}
                                      alt={`สภาพก่อนรับมอบ ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ปุ่มยืนยันส่งคืนอุปกรณ์ */}
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setReturnModalTarget(r);
                                setFormPhotos([]);
                                setFormNote('');
                              }}
                              className="jw-btn jw-btn-sm shrink-0 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
                            >
                              <Icon name="package" className="w-4 h-4" />
                              <span>ยืนยันส่งคืนอุปกรณ์</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* -------------------- TAB 2: รอตรวจสภาพ -------------------- */}
                  {tab === 'inspect' && (
                    <div className="border-t border-line-soft pt-3.5 flex flex-col gap-4">
                      {/* Notice Banner */}
                      <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-purple-50 text-purple-900 border border-purple-200 text-[13px]">
                        <div className="size-2 rounded-full bg-purple-600 animate-pulse shrink-0" />
                        <span className="font-semibold">เจ้าหน้าที่กำลังตรวจสอบสภาพอุปกรณ์</span>
                        <span className="text-purple-700 hidden sm:inline">
                          — อุปกรณ์ส่งคืนเรียบร้อยแล้ว รอเจ้าหน้าที่ตรวจความสมบูรณ์
                        </span>
                      </div>

                      {/* รายละเอียดวันที่รับมอบและส่งคืน */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px] bg-soft/30 p-3 rounded-xl border border-line-soft">
                        <div>
                          <span className="text-ink-mute">วันที่รับมอบ: </span>
                          <b className="text-ink font-semibold">
                            {r.receivedAt ? formatThaiDateTime(r.receivedAt) : '-'}
                          </b>
                        </div>
                        <div>
                          <span className="text-ink-mute">วันที่ส่งคืน: </span>
                          <b className="text-ink font-semibold">
                            {r.returnSubmittedAt
                              ? formatThaiDateTime(r.returnSubmittedAt)
                              : r.returnRequestedAt
                              ? formatThaiDateTime(r.returnRequestedAt)
                              : '-'}
                          </b>
                        </div>
                      </div>

                      {/* เปรียบเทียบรูปภาพ: ก่อนรับมอบ vs ก่อนส่งคืน */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* ฝั่งรูปภาพก่อนรับมอบ */}
                        <div className="flex flex-col gap-2 p-3 rounded-xl border border-line-soft bg-white">
                          <b className="text-[13px] text-ink font-semibold flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-emerald-500" />
                            รูปภาพก่อนรับมอบ
                          </b>
                          {r.receiveNote && (
                            <p className="text-[12px] text-ink-mute bg-soft/60 p-2 rounded-lg">
                              {r.receiveNote}
                            </p>
                          )}
                          {r.receivePhotos && r.receivePhotos.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {r.receivePhotos.map((src, i) => (
                                <div
                                  key={i}
                                  className="w-16 h-16 rounded-lg border border-line overflow-hidden cursor-pointer hover:opacity-80"
                                  onClick={() => setPreviewImage(src)}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={src}
                                    alt={`ก่อนรับมอบ ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[12px] text-ink-mute italic">ไม่มีรูปภาพ</span>
                          )}
                        </div>

                        {/* ฝั่งรูปภาพก่อนส่งคืน */}
                        <div className="flex flex-col gap-2 p-3 rounded-xl border border-line-soft bg-white">
                          <b className="text-[13px] text-ink font-semibold flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-blue-500" />
                            รูปภาพก่อนส่งคืน
                          </b>
                          {r.returnNote && (
                            <p className="text-[12px] text-ink-mute bg-soft/60 p-2 rounded-lg">
                              {r.returnNote}
                            </p>
                          )}
                          {r.returnPhotos && r.returnPhotos.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {r.returnPhotos.map((src, i) => (
                                <div
                                  key={i}
                                  className="w-16 h-16 rounded-lg border border-line overflow-hidden cursor-pointer hover:opacity-80"
                                  onClick={() => setPreviewImage(src)}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={src}
                                    alt={`ก่อนส่งคืน ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[12px] text-ink-mute italic">ไม่มีรูปภาพ</span>
                          )}
                        </div>
                      </div>

                      {/* ส่วนปฏิบัติการของเจ้าหน้าที่ (Staff / Admin Action) */}
                      {isStaffOrAdmin && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-soft/30 p-3.5 rounded-2xl border border-brand/30 mt-1">
                          <div className="text-[13px] text-brand-ink">
                            <b className="font-semibold">สำหรับเจ้าหน้าที่:</b> สามารถตรวจสอบความสมบูรณ์และกดตรวจรับคืนได้ที่นี่
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setInspectModalTarget(r);
                              setInspectResult('normal');
                              setFormPhotos([]);
                              setFormNote('');
                            }}
                            className="jw-btn jw-btn-sm shrink-0 bg-brand hover:bg-brand-hover text-white flex items-center gap-1.5"
                          >
                            <Icon name="check" className="w-4 h-4" />
                            <span>ยืนยันรับคืนอุปกรณ์</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* -------------------- TAB 3: ประวัติ -------------------- */}
                  {tab === 'history' && (
                    <div className="border-t border-line-soft pt-3.5 flex flex-col gap-3">
                      {/* Dates Summary Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px] bg-soft/40 p-3 rounded-xl border border-line-soft">
                        <div>
                          <span className="text-ink-mute block">วันที่อนุมัติ:</span>
                          <b className="text-ink font-semibold">{formatThaiDate(approvalDate)}</b>
                        </div>
                        <div>
                          <span className="text-ink-mute block">วันที่รับมอบ:</span>
                          <b className="text-ink font-semibold">
                            {r.receivedAt ? formatThaiDate(r.receivedAt) : '-'}
                          </b>
                        </div>
                        <div>
                          <span className="text-ink-mute block">วันที่ส่งคืน:</span>
                          <b className="text-ink font-semibold">
                            {r.returnedAt
                              ? formatThaiDate(r.returnedAt)
                              : r.returnSubmittedAt
                              ? formatThaiDate(r.returnSubmittedAt)
                              : '-'}
                          </b>
                        </div>
                        <div>
                          <span className="text-ink-mute block">วันที่ตรวจสอบ:</span>
                          <b className="text-ink font-semibold">
                            {r.inspectedAt ? formatThaiDate(r.inspectedAt) : '-'}
                          </b>
                        </div>
                      </div>

                      {/* Inspection Result Box */}
                      {r.status === 'returned' && (
                        <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-white border border-line-soft">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-ink">ผลการตรวจสอบ:</span>
                              {r.inspectResult === 'normal' || !r.inspectResult ? (
                                <span className="px-2.5 py-0.5 rounded-md text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  ✓ สภาพปกติ ครบถ้วน
                                </span>
                              ) : r.inspectResult === 'damaged' ? (
                                <span className="px-2.5 py-0.5 rounded-md text-[12px] font-semibold bg-red-50 text-red-700 border border-red-200">
                                  ⚠ ชำรุดเสียหาย
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-md text-[12px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  ✕ อุปกรณ์ไม่ครบถ้วน
                                </span>
                              )}
                            </div>
                            {r.inspectorName && (
                              <span className="text-[12px] text-ink-mute">
                                ผู้ตรวจสอบ: <b className="text-ink">{r.inspectorName}</b>
                              </span>
                            )}
                          </div>

                          {r.inspectNote && (
                            <div className="text-[13px] text-ink bg-soft/50 p-2.5 rounded-lg border border-line-soft mt-1">
                              <b className="text-ink-mute font-medium">หมายเหตุจากเจ้าหน้าที่: </b>
                              {r.inspectNote}
                            </div>
                          )}

                          {/* Photos from all stages */}
                          <div className="flex flex-col gap-1.5 mt-1">
                            <span className="text-[12px] text-ink-mute font-medium">รูปภาพประวัติ:</span>
                            <div className="flex flex-wrap gap-2">
                              {(r.receivePhotos || []).map((src, i) => (
                                <div
                                  key={`rec-${i}`}
                                  className="relative w-14 h-14 rounded-lg border border-line overflow-hidden cursor-pointer hover:opacity-85"
                                  onClick={() => setPreviewImage(src)}
                                  title="รูปตอนรับมอบ"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={src} alt="รับมอบ" className="w-full h-full object-cover" />
                                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] text-center">
                                    รับมอบ
                                  </span>
                                </div>
                              ))}
                              {(r.returnPhotos || []).map((src, i) => (
                                <div
                                  key={`ret-${i}`}
                                  className="relative w-14 h-14 rounded-lg border border-line overflow-hidden cursor-pointer hover:opacity-85"
                                  onClick={() => setPreviewImage(src)}
                                  title="รูปตอนส่งคืน"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={src} alt="ส่งคืน" className="w-full h-full object-cover" />
                                  <span className="absolute bottom-0 inset-x-0 bg-blue-900/70 text-white text-[9px] text-center">
                                    ส่งคืน
                                  </span>
                                </div>
                              ))}
                              {(r.inspectPhotos || []).map((src, i) => (
                                <div
                                  key={`ins-${i}`}
                                  className="relative w-14 h-14 rounded-lg border border-line overflow-hidden cursor-pointer hover:opacity-85"
                                  onClick={() => setPreviewImage(src)}
                                  title="รูปผลตรวจ"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={src} alt="ผลตรวจ" className="w-full h-full object-cover" />
                                  <span className="absolute bottom-0 inset-x-0 bg-emerald-900/70 text-white text-[9px] text-center">
                                    ผลตรวจ
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Request Detail Link */}
                  <div className="flex justify-end pt-1">
                    <Link
                      href={`/requests/${r.id}`}
                      className="text-[13px] text-brand hover:text-brand-hover font-semibold flex items-center gap-1"
                    >
                      <span>ดูรายละเอียดคำขอและไทม์ไลน์</span>
                      <Icon name="chevron-right" className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer info tip */}
        <p className="text-[13px] text-ink-mute flex items-center gap-2 mt-2">
          <Icon name="bell" className="w-4 h-4 text-brand shrink-0" />
          <span>ระบบแจ้งเตือนผ่าน LINE ล่วงหน้า 1 วันก่อนครบกำหนดคืนอุปกรณ์</span>
        </p>
      </div>

      {/* ==================== MODAL 1: ยืนยันรับมอบอุปกรณ์ ==================== */}
      {receiveModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line-soft">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand flex items-center justify-center">
                  <Icon name="check" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[17px] font-bold text-ink">ยืนยันรับมอบอุปกรณ์</h3>
                  <p className="text-[12px] text-ink-mute">
                    คำขอ {receiveModalTarget.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceiveModalTarget(null)}
                className="w-8 h-8 rounded-full hover:bg-soft text-ink-mute flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* 1. ข้อมูลอุปกรณ์ที่ได้รับ */}
            <div className="bg-soft/40 p-4 rounded-2xl border border-line-soft flex flex-col gap-1.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-ink-mute">ชื่ออุปกรณ์:</span>
                <b className="text-ink font-semibold">
                  {getEquipmentInfo(receiveModalTarget).name}
                </b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mute">รหัสอุปกรณ์:</span>
                <span className="font-mono text-ink">
                  {getEquipmentInfo(receiveModalTarget).code}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mute">จำนวนที่ยืม:</span>
                <b className="text-ink">
                  {getEquipmentInfo(receiveModalTarget).totalQty} ชิ้น
                </b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mute">กำหนดส่งคืน:</span>
                <span className="text-ink font-medium">
                  {formatThaiDate(receiveModalTarget.returnDate)}
                </span>
              </div>
            </div>

            {/* 2. อัปโหลดรูปภาพสภาพอุปกรณ์ก่อนรับมอบ */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-bold text-ink">
                  อัปโหลดรูปภาพสภาพอุปกรณ์ก่อนรับมอบ
                </label>
                <span className="text-[11px] text-ink-mute">
                  ({formPhotos.length}/6 รูป)
                </span>
              </div>
              <p className="text-[12px] text-ink-mute">
                ถ่ายภาพสภาพอุปกรณ์ทุกมุม เช่น รอยตำหนิเดิม สายไฟ หรืออุปกรณ์เสริม เพื่อเป็นหลักฐานก่อนรับมอบ
              </p>

              <div className="flex flex-wrap gap-2.5 pt-1">
                {formPhotos.map((src, i) => (
                  <div
                    key={i}
                    className="relative w-20 h-20 rounded-2xl overflow-hidden border border-line group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`รูปที่ ${i + 1}`}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setPreviewImage(src)}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="w-6 h-6 rounded-full bg-black/70 text-white absolute top-1 right-1 flex items-center justify-center text-[11px] hover:bg-black transition"
                    >
                      <Icon name="x" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {formPhotos.length < 6 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-line hover:border-brand flex flex-col items-center justify-center gap-1 text-[11px] text-ink-mute hover:text-brand transition bg-soft/40"
                  >
                    <Icon name="upload" className="w-5 h-5" />
                    <span>เพิ่มรูปภาพ</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleSelectFiles}
                className="hidden"
              />
            </div>

            {/* 3. ช่องรายละเอียดจากผู้ยืม */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-bold text-ink">
                รายละเอียดเพิ่มเติมจากผู้ยืม (ถ้ามี)
              </label>
              <textarea
                rows={3}
                placeholder="เช่น ทดสอบเปิดติด อุปกรณ์เสริมครบ มีรอยถลอกที่ขอบด้านขวา ฯลฯ"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="jw-in text-[13px] rounded-2xl p-3 resize-none"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line-soft">
              <button
                type="button"
                onClick={() => setReceiveModalTarget(null)}
                disabled={submitting}
                className="jw-btn-sec jw-btn-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReceive}
                disabled={submitting}
                className="jw-btn jw-btn-sm bg-brand hover:bg-brand-hover text-white flex items-center gap-1.5"
              >
                {submitting ? (
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="check" className="w-4 h-4" />
                )}
                <span>ยืนยันรับมอบอุปกรณ์</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: ยืนยันส่งคืนอุปกรณ์ ==================== */}
      {returnModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line-soft">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Icon name="package" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[17px] font-bold text-ink">ดำเนินการส่งคืนอุปกรณ์</h3>
                  <p className="text-[12px] text-ink-mute">
                    คำขอ {returnModalTarget.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalTarget(null)}
                className="w-8 h-8 rounded-full hover:bg-soft text-ink-mute flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* 1. ข้อมูลอุปกรณ์ที่ต้องส่งคืน */}
            <div className="bg-soft/40 p-4 rounded-2xl border border-line-soft flex flex-col gap-1.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-ink-mute">อุปกรณ์ที่ส่งคืน:</span>
                <b className="text-ink font-semibold">
                  {getEquipmentInfo(returnModalTarget).name}
                </b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mute">จำนวน:</span>
                <b className="text-ink">
                  {getEquipmentInfo(returnModalTarget).totalQty} ชิ้น
                </b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mute">วันที่รับมอบ:</span>
                <span className="text-ink">
                  {returnModalTarget.receivedAt
                    ? formatThaiDateTime(returnModalTarget.receivedAt)
                    : '-'}
                </span>
              </div>
            </div>

            {/* 2. อัปโหลดรูปภาพสภาพอุปกรณ์ก่อนส่งคืน */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-bold text-ink">
                  อัปโหลดรูปภาพสภาพอุปกรณ์ก่อนส่งคืน
                </label>
                <span className="text-[11px] text-ink-mute">
                  ({formPhotos.length}/6 รูป)
                </span>
              </div>
              <p className="text-[12px] text-ink-mute">
                ถ่ายภาพสภาพอุปกรณ์ขณะนำมาส่งคืน เพื่อเป็นหลักฐานให้เจ้าหน้าที่ตรวจสอบ
              </p>

              <div className="flex flex-wrap gap-2.5 pt-1">
                {formPhotos.map((src, i) => (
                  <div
                    key={i}
                    className="relative w-20 h-20 rounded-2xl overflow-hidden border border-line group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`รูปที่ ${i + 1}`}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setPreviewImage(src)}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="w-6 h-6 rounded-full bg-black/70 text-white absolute top-1 right-1 flex items-center justify-center text-[11px] hover:bg-black transition"
                    >
                      <Icon name="x" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {formPhotos.length < 6 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-line hover:border-brand flex flex-col items-center justify-center gap-1 text-[11px] text-ink-mute hover:text-brand transition bg-soft/40"
                  >
                    <Icon name="upload" className="w-5 h-5" />
                    <span>เพิ่มรูปภาพ</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleSelectFiles}
                className="hidden"
              />
            </div>

            {/* 3. ช่องรายละเอียดจากผู้ยืม */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-bold text-ink">
                รายละเอียดสภาพอุปกรณ์ขณะส่งคืน
              </label>
              <textarea
                rows={3}
                placeholder="ระบุสภาพอุปกรณ์ขณะส่งคืน ตำหนิหรือความเสียหาย (ถ้ามี) หรือรายละเอียดเพิ่มเติม"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="jw-in text-[13px] rounded-2xl p-3 resize-none"
              />
            </div>

            {/* Notice info */}
            <p className="text-[12px] text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
              * เมื่อยืนยันส่งคืน รายการจะถูกส่งไปยัง Tab &quot;รอตรวจสภาพ&quot; เพื่อให้เจ้าหน้าที่ตรวจสอบความสมบูรณ์ก่อนบันทึกเสร็จสิ้น
            </p>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line-soft">
              <button
                type="button"
                onClick={() => setReturnModalTarget(null)}
                disabled={submitting}
                className="jw-btn-sec jw-btn-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={submitting}
                className="jw-btn jw-btn-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
              >
                {submitting ? (
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="package" className="w-4 h-4" />
                )}
                <span>ยืนยันส่งคืนอุปกรณ์</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 3: เจ้าหน้าที่ตรวจรับคืนอุปกรณ์ ==================== */}
      {inspectModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line-soft">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand flex items-center justify-center">
                  <Icon name="check" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[17px] font-bold text-ink">ตรวจรับคืนอุปกรณ์ (เจ้าหน้าที่)</h3>
                  <p className="text-[12px] text-ink-mute">
                    คำขอ {inspectModalTarget.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectModalTarget(null)}
                className="w-8 h-8 rounded-full hover:bg-soft text-ink-mute flex items-center justify-center transition"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* สรุปข้อมูลผู้ยืมและอุปกรณ์ */}
            <div className="bg-soft/40 p-3.5 rounded-2xl border border-line-soft text-[13px] flex flex-col gap-1">
              <div>
                <span className="text-ink-mute">ผู้ยืม: </span>
                <b className="text-ink">{inspectModalTarget.requesterName}</b>
              </div>
              <div>
                <span className="text-ink-mute">อุปกรณ์: </span>
                <b className="text-ink">{getEquipmentInfo(inspectModalTarget).name}</b>
              </div>
              {inspectModalTarget.returnNote && (
                <div>
                  <span className="text-ink-mute">หมายเหตุจากผู้ยืม: </span>
                  <span className="text-ink">{inspectModalTarget.returnNote}</span>
                </div>
              )}
            </div>

            {/* ผลการตรวจสอบสภาพ */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-bold text-ink">
                ผลการตรวจสอบสภาพหลังรับคืน <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setInspectResult('normal')}
                  className={`p-3 rounded-2xl text-[13px] font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'normal'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'bg-soft/50 text-ink-mute border-line hover:border-line-hover'
                  }`}
                >
                  <Icon name="check" className="w-4 h-4 text-emerald-600" />
                  <span>สภาพปกติ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectResult('damaged')}
                  className={`p-3 rounded-2xl text-[13px] font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'damaged'
                      ? 'bg-red-50 text-red-800 border-red-500 ring-2 ring-red-500/20'
                      : 'bg-soft/50 text-ink-mute border-line hover:border-line-hover'
                  }`}
                >
                  <Icon name="alert-triangle" className="w-4 h-4 text-red-600" />
                  <span>ชำรุดเสียหาย</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectResult('incomplete')}
                  className={`p-3 rounded-2xl text-[13px] font-semibold flex flex-col items-center justify-center gap-1 border transition ${
                    inspectResult === 'incomplete'
                      ? 'bg-amber-50 text-amber-900 border-amber-500 ring-2 ring-amber-500/20'
                      : 'bg-soft/50 text-ink-mute border-line hover:border-line-hover'
                  }`}
                >
                  <Icon name="x" className="w-4 h-4 text-amber-600" />
                  <span>ไม่ครบถ้วน</span>
                </button>
              </div>
            </div>

            {/* หมายเหตุ / ระบุตำหนิหรือความเสียหาย */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-bold text-ink">
                บันทึกหมายเหตุ / ตำหนิความเสียหาย (ถ้ามี)
              </label>
              <textarea
                rows={3}
                placeholder="ระบุสภาพหลังตรวจรับคืน เช่น ตรวจสอบครบตามจำนวน ไม่พบความเสียหาย หรือระบุชิ้นส่วนที่ชำรุด"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="jw-in text-[13px] rounded-2xl p-3 resize-none"
              />
            </div>

            {/* รูปภาพประกอบการตรวจสอบ */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-bold text-ink">
                  เพิ่มรูปภาพประกอบการตรวจสอบ (ถ้ามี)
                </label>
                <span className="text-[11px] text-ink-mute">
                  ({formPhotos.length}/6 รูป)
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {formPhotos.map((src, i) => (
                  <div
                    key={i}
                    className="relative w-16 h-16 rounded-xl overflow-hidden border border-line group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="รูปตรวจ" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="w-5 h-5 rounded-full bg-black/70 text-white absolute top-1 right-1 flex items-center justify-center text-[10px]"
                    >
                      <Icon name="x" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {formPhotos.length < 6 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-xl border-2 border-dashed border-line hover:border-brand flex flex-col items-center justify-center text-[11px] text-ink-mute hover:text-brand transition bg-soft/40"
                  >
                    <Icon name="upload" className="w-4 h-4" />
                    <span>เพิ่มรูป</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleSelectFiles}
                className="hidden"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line-soft">
              <button
                type="button"
                onClick={() => setInspectModalTarget(null)}
                disabled={submitting}
                className="jw-btn-sec jw-btn-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmInspect}
                disabled={submitting}
                className="jw-btn jw-btn-sm bg-brand hover:bg-brand-hover text-white flex items-center gap-1.5"
              >
                {submitting ? (
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="check" className="w-4 h-4" />
                )}
                <span>ยืนยันรับคืนอุปกรณ์</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== IMAGE PREVIEW MODAL ==================== */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] w-full flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="ดูรูปภาพขนาดใหญ่"
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-white/80 flex items-center gap-1 text-[13px]"
            >
              <Icon name="x" className="w-5 h-5" />
              <span>ปิดหน้าต่าง</span>
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
