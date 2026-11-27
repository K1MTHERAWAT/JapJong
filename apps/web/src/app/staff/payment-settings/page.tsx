'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Banknote, Building2, CheckCircle2, Plus, QrCode, Trash2, Upload } from 'lucide-react';
import { PaymentAccount, PaymentSettings } from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { SearchableCombobox, Toggle } from '@/components/ui';
import { api, readAndCompressImages } from '@/lib/api';

const BANK_OPTIONS = [
  'ธนาคารกรุงไทย (KTB)',
  'ธนาคารออมสิน (GSB)',
  'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',
  'ธนาคารกสิกรไทย (KBANK)',
  'ธนาคารไทยพาณิชย์ (SCB)',
  'ธนาคารกรุงเทพ (BBL)',
  'ธนาคารกรุงศรีอยุธยา (BAY)',
  'ธนาคารทหารไทยธนชาต (ttb)',
];

export default function StaffPaymentSettingsPage() {
  const [settings, setSettings] = useState<PaymentSettings>({
    accounts: [],
    cashEnabled: true,
    cashCounterLocation: 'กองคลัง ชั้น 1 ที่ทำการ อบต. (จ.–ศ. 08:30–16:30 น.)',
    receiptPrefix: 'RC',
    paymentDeadlineHours: 48,
  });
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const qrInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .getPaymentSettings()
      .then((data) => {
        setSettings(data);
        setSelectedId(data.accounts.find((a) => a.isDefault)?.id || data.accounts[0]?.id || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selected = settings.accounts.find((a) => a.id === selectedId) || settings.accounts[0] || null;

  const updateSelected = (patch: Partial<PaymentAccount>) => {
    if (!selected) return;
    setSettings((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) => (a.id === selected.id ? { ...a, ...patch } : a)),
    }));
  };

  const setAsDefault = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) => ({ ...a, isDefault: a.id === id })),
    }));
  };

  const addAccount = () => {
    const newAcc: PaymentAccount = {
      id: `pa-${Date.now()}`,
      bankName: BANK_OPTIONS[0],
      accountNo: '',
      accountName: 'องค์การบริหารส่วนตำบล',
      promptpayId: '',
      qrImageUrl: '',
      purpose: 'ค่าบริการทั่วไป',
      isDefault: settings.accounts.length === 0,
      enabled: true,
    };
    setSettings((prev) => ({
      ...prev,
      accounts: [...prev.accounts, newAcc],
    }));
    setSelectedId(newAcc.id);
  };

  const removeAccount = (id: string) => {
    if (settings.accounts.length <= 1) return;
    setSettings((prev) => {
      const next = prev.accounts.filter((a) => a.id !== id);
      if (next.length > 0 && !next.some((a) => a.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      setSelectedId(next[0]?.id || '');
      return { ...prev, accounts: next };
    });
  };

  const handleUploadQr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    try {
      const imgs = await readAndCompressImages(e.target.files, 1);
      if (imgs[0]) updateSelected({ qrImageUrl: imgs[0] });
    } catch (err) {
      setErrMsg((err as Error).message || 'ไม่สามารถอ่านไฟล์รูป QR ได้');
    } finally {
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrMsg('');
    setSavedMsg('');
    try {
      const updated = await api.updatePaymentSettings(settings);
      setSettings(updated);
      setSavedMsg('บันทึกการตั้งค่าบัญชีรับเงินเรียบร้อยแล้ว');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err) {
      setErrMsg((err as Error).message || 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="ตั้งค่าบัญชีรับเงิน" backHref="/payments" rightLabel="เจ้าหน้าที่">
      {loading ? (
        <div className="jw-card p-12 text-center text-sm text-ink-mute">กำลังโหลดการตั้งค่าบัญชีรับเงิน...</div>
      ) : (
        <div className="flex flex-col gap-5">
          {savedMsg && (
            <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{savedMsg}</span>
            </div>
          )}
          {errMsg && (
            <div className="rounded-2xl bg-danger-bg border border-danger-border px-4 py-3 text-sm font-semibold text-danger-fg">
              {errMsg}
            </div>
          )}

          {/* Part A: Multi-Account Cards Bar */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold text-ink m-0">
                  1. บัญชีรับเงินของหน่วยงาน ({settings.accounts.length} บัญชี)
                </h2>
                <p className="text-xs text-ink-mute m-0 mt-0.5">
                  คลิกการ์ดบัญชีเพื่อแก้ไขรายละเอียดด้านล่าง และดูตัวอย่างที่ประชาชนเห็นด้านขวาแบบเรียลไทม์
                </p>
              </div>
              <button
                type="button"
                onClick={addAccount}
                className="jw-btn min-h-[40px] px-4 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Plus className="size-4" />
                <span>เพิ่มบัญชีใหม่</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {settings.accounts.map((acc) => {
                const isSelected = selected?.id === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedId(acc.id)}
                    className={`p-4 rounded-2xl border text-left transition cursor-pointer bg-surface space-y-2 ${
                      isSelected ? 'border-brand ring-2 ring-brand/15' : 'border-line hover:border-brand/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] font-bold text-ink truncate">{acc.bankName}</span>
                          {acc.isDefault && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand/15 text-brand">
                              บัญชีหลัก
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-ink-mute truncate mt-0.5">{acc.purpose}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                          acc.enabled
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-surface-muted text-ink-mute'
                        }`}
                      >
                        {acc.enabled ? 'เปิดใช้' : 'ปิด'}
                      </span>
                    </div>
                    <div className="text-xs font-mono font-bold text-ink">
                      {acc.accountNo || 'ยังไม่ระบุเลขที่บัญชี'}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Part B: Split Form (Left) + Live Citizen Preview (Right) */}
          {selected && (
            <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.95fr] gap-5 items-start">
              {/* Left Form */}
              <section className="jw-card p-5 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-line">
                  <div>
                    <h3 className="text-[16px] font-bold text-ink m-0">2. แก้ไขรายละเอียดบัญชีที่เลือก</h3>
                    <p className="text-xs text-ink-mute m-0 mt-0.5">{selected.accountName || 'ยังไม่ได้ตั้งชื่อบัญชี'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {!selected.isDefault && (
                      <button
                        type="button"
                        onClick={() => setAsDefault(selected.id)}
                        className="text-xs font-bold text-brand hover:underline cursor-pointer"
                      >
                        ตั้งเป็นบัญชีหลัก
                      </button>
                    )}
                    <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                      <span>เปิดใช้งาน</span>
                      <Toggle checked={selected.enabled} onChange={(val) => updateSelected({ enabled: val })} />
                    </div>
                    {settings.accounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAccount(selected.id)}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10 transition cursor-pointer"
                        title="ลบบัญชีนี้"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="jw-lbl">ธนาคาร</label>
                    <SearchableCombobox
                      searchable={false}
                      clearable={false}
                      value={selected.bankName}
                      onChange={(val) => updateSelected({ bankName: val })}
                      options={BANK_OPTIONS.map((b) => ({ value: b, label: b }))}
                    />
                  </div>
                  <div>
                    <label className="jw-lbl">เลขที่บัญชี</label>
                    <input
                      type="text"
                      value={selected.accountNo}
                      onChange={(e) => updateSelected({ accountNo: e.target.value })}
                      placeholder="เช่น 678-0-12345-6"
                      className="jw-in font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="jw-lbl">ชื่อบัญชีหน่วยงาน</label>
                    <input
                      type="text"
                      value={selected.accountName}
                      onChange={(e) => updateSelected({ accountName: e.target.value })}
                      placeholder="เช่น องค์การบริหารส่วนตำบล (เงินรายได้)"
                      className="jw-in"
                    />
                  </div>
                  <div>
                    <label className="jw-lbl">หมายเลข PromptPay (ถ้ามี)</label>
                    <input
                      type="text"
                      value={selected.promptpayId || ''}
                      onChange={(e) => updateSelected({ promptpayId: e.target.value })}
                      placeholder="เช่น 099-4-00012-3456"
                      className="jw-in font-mono"
                    />
                  </div>
                  <div>
                    <label className="jw-lbl">วัตถุประสงค์ / หมวดบัญชี</label>
                    <input
                      type="text"
                      value={selected.purpose}
                      onChange={(e) => updateSelected({ purpose: e.target.value })}
                      placeholder="เช่น ค่าบริการสถานที่และอุปกรณ์"
                      className="jw-in"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="jw-lbl">รูปภาพ QR Code รับเงินของหน่วยงาน (Optional)</label>
                    <input
                      ref={qrInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleUploadQr}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => qrInputRef.current?.click()}
                        className="jw-btn-sec min-h-[40px] px-4 text-xs font-semibold inline-flex items-center gap-2"
                      >
                        <Upload className="size-4 text-brand" />
                        <span>{selected.qrImageUrl ? 'เปลี่ยนรูป QR Code' : 'อัปโหลดรูป QR Code'}</span>
                      </button>
                      {selected.qrImageUrl && (
                        <button
                          type="button"
                          onClick={() => updateSelected({ qrImageUrl: '' })}
                          className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                        >
                          ลบรูป QR
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Shared Counter & Receipt Settings */}
                <div className="pt-4 border-t border-line space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Banknote className="size-4 text-brand" />
                      <b className="text-[14px] text-ink">ตั้งค่าร่วม (เงินสดหน้าเคาน์เตอร์ & ใบเสร็จ)</b>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                      <span>เปิดรับเงินสด</span>
                      <Toggle
                        checked={settings.cashEnabled}
                        onChange={(val) => setSettings((prev) => ({ ...prev, cashEnabled: val }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="sm:col-span-2">
                      <label className="jw-lbl">จุดรับชำระเงินสด / เวลาทำการ</label>
                      <input
                        type="text"
                        value={settings.cashCounterLocation}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, cashCounterLocation: e.target.value }))
                        }
                        className="jw-in"
                      />
                    </div>
                    <div>
                      <label className="jw-lbl">คำนำหน้าเลขใบเสร็จ</label>
                      <input
                        type="text"
                        value={settings.receiptPrefix}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, receiptPrefix: e.target.value }))
                        }
                        placeholder="RC"
                        className="jw-in font-mono"
                      />
                    </div>
                    <div>
                      <label className="jw-lbl">กำหนดชำระภายใน (ชม.)</label>
                      <input
                        type="number"
                        min={1}
                        max={720}
                        value={settings.paymentDeadlineHours}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            paymentDeadlineHours: Math.max(1, Number(e.target.value) || 48),
                          }))
                        }
                        className="jw-in"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="jw-btn min-h-[44px] px-6 text-sm font-bold disabled:opacity-50"
                  >
                    {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าบัญชีรับเงิน'}
                  </button>
                </div>
              </section>

              {/* Right Live Citizen Preview */}
              <section className="jw-card p-5 space-y-4 lg:sticky lg:top-6">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-brand/12 text-brand">
                    Live Preview · มุมมองประชาชน
                  </span>
                  <span className="text-xs text-ink-mute">ชำระภายใน {settings.paymentDeadlineHours} ชม.</span>
                </div>

                <div className="rounded-2xl border border-line bg-surface-muted/40 p-4 flex flex-col items-center text-center gap-3">
                  {selected.qrImageUrl ? (
                    <div className="w-36 h-36 rounded-2xl bg-white p-2 border border-line flex items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selected.qrImageUrl} alt="QR Code" className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-28 h-28 rounded-2xl bg-brand/10 text-brand flex flex-col items-center justify-center gap-1">
                      <QrCode className="size-10" />
                      <span className="text-[10px] font-semibold">ยังไม่อัปโหลด QR</span>
                    </div>
                  )}

                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-brand flex items-center justify-center gap-1">
                      <Building2 className="size-3.5" />
                      <span>{selected.promptpayId ? 'โอนผ่านบัญชี / Thai QR PromptPay' : 'โอนผ่านบัญชีธนาคาร'}</span>
                    </div>
                    <div className="text-sm font-bold text-ink">{selected.accountName || '-'}</div>
                    {selected.promptpayId && (
                      <div className="text-xs font-mono text-ink-mute">PromptPay: {selected.promptpayId}</div>
                    )}
                  </div>

                  <div className="w-full pt-3 border-t border-line text-xs space-y-1.5 text-left">
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-mute">ธนาคาร</span>
                      <b className="text-ink">{selected.bankName}</b>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-mute">เลขที่บัญชี</span>
                      <b className="font-mono text-ink">{selected.accountNo || '-'}</b>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-mute">เลขใบเสร็จตัวอย่าง</span>
                      <b className="font-mono text-brand">{settings.receiptPrefix || 'RC'}-BR-2569-0038</b>
                    </div>
                  </div>
                </div>

                {settings.cashEnabled && (
                  <div className="rounded-xl border border-line bg-surface-muted/40 p-3.5 text-xs space-y-1">
                    <div className="font-bold text-ink">หรือชำระเงินสดที่สำนักงาน</div>
                    <div className="text-ink-soft">{settings.cashCounterLocation || '-'}</div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
