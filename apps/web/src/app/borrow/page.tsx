'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EQUIPMENT_CATEGORY_LABEL,
  Equipment,
  EquipmentCategory,
  OfficialFormPurposeItem,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import {
  Chip,
  DatePickerField,
  OfficialGovFormDocument,
  SignatureBox,
  Stepper,
  equipmentIconName,
} from '@/components/ui';
import { api, formatThaiDate } from '@/lib/api';

const STEPS = ['เลือกอุปกรณ์', 'กรอกคำขอ', 'ลงนามและส่ง'];

export default function BorrowWizardPage() {
  const router = useRouter();
  const { account } = useAuth();
  const [step, setStep] = useState(1);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(true);
  const [equipmentError, setEquipmentError] = useState('');
  const [cat, setCat] = useState<'all' | EquipmentCategory>('all');
  const [search, setSearch] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({
    'e-audio': 1,
    'e-tent': 2,
  });

  // Step 2 (ตามแบบคำขอใช้อุปกรณ์ราชการ)
  const [writtenAt, setWrittenAt] = useState('');
  const [requesterName, setRequesterName] = useState(account?.name || '');
  const [requesterPosition, setRequesterPosition] = useState(
    account?.position && account.position !== 'ประชาชน' ? account.position : '',
  );
  const [addressHouseNo, setAddressHouseNo] = useState(account?.addressHouseNo || '');
  const [addressMoo, setAddressMoo] = useState(account?.addressMoo || '');
  const [addressSubdistrict, setAddressSubdistrict] = useState(account?.addressSubdistrict || '');
  const [addressDistrict, setAddressDistrict] = useState(account?.addressDistrict || '');
  const [addressProvince, setAddressProvince] = useState(account?.addressProvince || '');
  const [organization, setOrganization] = useState(account?.department || '');
  const [pickupDate, setPickupDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [returnDate, setReturnDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 4);
    return d.toISOString().slice(0, 10);
  });

  const borrowDays = useMemo(() => {
    if (!pickupDate || !returnDate) return 1;
    const s = new Date(pickupDate).getTime();
    const e = new Date(returnDate).getTime();
    const diff = Math.round((e - s) / 86400000);
    return Math.max(1, diff + 1);
  }, [pickupDate, returnDate]);
  const [purpose, setPurpose] = useState('');
  const [purposeItems, setPurposeItems] = useState<OfficialFormPurposeItem[]>([
    { item: '', forWhat: '' },
  ]);
  const [attachmentName, setAttachmentName] = useState('');

  // Step 3
  const [signature, setSignature] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.equipment()
      .then((items) => {
        setEquipment(items);
        setEquipmentError('');
      })
      .catch(() => setEquipmentError('โหลดรายการอุปกรณ์ไม่สำเร็จ ลองโหลดรายการอีกครั้ง'))
      .finally(() => setEquipmentLoading(false));
  }, []);

  useEffect(() => {
    if (account) {
      setRequesterName(account.name);
      setOrganization(account.department);
      if (account.addressHouseNo) setAddressHouseNo(account.addressHouseNo);
      if (account.addressMoo) setAddressMoo(account.addressMoo);
      if (account.addressSubdistrict) setAddressSubdistrict(account.addressSubdistrict);
      if (account.addressDistrict) setAddressDistrict(account.addressDistrict);
      if (account.addressProvince) setAddressProvince(account.addressProvince);
    }
  }, [account]);

  const setQty = (id: string, max: number, next: number) => {
    const clamped = Math.max(0, Math.min(max, next));
    setQuantities((prev) => ({ ...prev, [id]: clamped }));
  };

  const selectedItems = equipment
    .map((eq) => ({ eq, qty: quantities[eq.id] ?? 0 }))
    .filter((x) => x.qty > 0);

  // ซิงค์รายการอุปกรณ์ที่เลือกลงในแบบคำขอใช้อุปกรณ์ราชการ (ล็อกตามที่เลือกในขั้นตอนที่ 1)
  useEffect(() => {
    if (selectedItems.length > 0) {
      setPurposeItems((prev) =>
        selectedItems.map((it, idx) => ({
          item: `${it.eq.name} จำนวน ${it.qty} ชุด/รายการ`,
          forWhat: prev[idx]?.forWhat || purpose || 'ใช้ในกิจกรรมของหน่วยงาน/ชุมชน',
        })),
      );
    }
  }, [quantities, equipment]);

  const filtered = useMemo(() => equipment.filter((e) => {
    if (!e.enabled || e.stock <= 0) return false;
    if (cat !== 'all' && e.category !== cat) return false;
    if (search.trim() && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [equipment, cat, search]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const created = await api.createBorrow({
        items: selectedItems.map((s) => ({ equipmentId: s.eq.id, qty: s.qty })),
        pickupDate,
        returnDate,
        purpose: purpose || purposeItems[0]?.forWhat || 'ใช้ในกิจกรรมของหน่วยงาน/ชุมชน',
        organization,
        requesterName,
        requesterSignature: signature,
        writtenAt,
        requesterPosition,
        addressHouseNo,
        addressMoo,
        addressSubdistrict,
        addressDistrict,
        addressProvince,
        purposeItems: purposeItems.filter((pi) => pi.item.trim() || pi.forWhat.trim()),
        attachments: attachmentName ? [attachmentName] : [],
      });
      router.push(`/requests/${created.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title={step === 1 ? 'อุปกรณ์' : step === 2 ? 'แบบคำขอใช้อุปกรณ์' : 'ลงนามและส่งคำขอ'}
      backHref={step === 1 ? '/' : undefined}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      footer={
        step === 1 ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <Link href="/borrow/my" className="jw-btn-sec flex-1 sm:w-44">
              รายการอุปกรณ์ของฉัน
            </Link>
            <button
              type="button"
              disabled={selectedItems.length === 0}
              onClick={() => setStep(2)}
              className="jw-btn flex-[1.5] sm:w-64"
            >
              ถัดไป · กรอกคำขอ ({selectedItems.length} รายการ)
            </button>
          </div>
        ) : step === 2 ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button type="button" onClick={() => setStep(1)} className="jw-btn-sec flex-1 sm:w-36">
              ย้อนกลับ
            </button>
            <button type="button" onClick={() => setStep(3)} className="jw-btn flex-[1.5] sm:w-56">
              ถัดไป · ลงนามและส่ง
            </button>
          </div>
        ) : (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button
              type="button"
              onClick={() => {
                setDraftSaved(true);
                setTimeout(() => setDraftSaved(false), 2500);
              }}
              className="jw-btn-sec flex-1 sm:w-36"
            >
              บันทึกร่าง
            </button>
            <button
              type="button"
              disabled={submitting || !signature.trim()}
              onClick={handleSubmit}
              className="jw-btn flex-[1.5] sm:w-56"
            >
              {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอ'}
            </button>
          </div>
        )
      }
    >
      <div className="max-w-[820px] mx-auto mb-5">
        <Stepper steps={STEPS} current={step} onSelect={setStep} />
      </div>

      {/* STEP 1: เลือกอุปกรณ์ */}
      {step === 1 && (
        <div className="max-w-[820px] mx-auto flex flex-col gap-3.5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาอุปกรณ์"
            className="jw-in"
          />

          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', 'ทั้งหมด'],
                ['audio', 'เครื่องเสียง'],
                ['tent', 'เต็นท์ / เก้าอี้'],
                ['it', 'IT'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setCat(val)}
                className={`h-[38px] px-4 rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                  cat === val
                    ? 'bg-brand border-brand text-white'
                    : 'bg-white border-line text-ink hover:border-brand'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {equipmentError && (
              <div role="alert" className="rounded-2xl border border-[#F1B8B8] bg-[#FFF1F1] p-4 text-[13px] text-[#8A2424]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{equipmentError}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEquipmentLoading(true);
                      setEquipmentError('');
                      api.equipment()
                        .then(setEquipment)
                        .catch(() => setEquipmentError('โหลดรายการอุปกรณ์ไม่สำเร็จ ลองโหลดรายการอีกครั้ง'))
                        .finally(() => setEquipmentLoading(false));
                    }}
                    className="font-semibold underline underline-offset-2"
                  >
                    ลองอีกครั้ง
                  </button>
                </div>
              </div>
            )}
            {equipmentLoading ? (
              <div role="status" className="jw-card p-6 text-center text-[13px] text-ink-mute">กำลังโหลดรายการอุปกรณ์…</div>
            ) : null}
            {!equipmentLoading && !equipmentError && filtered.length === 0 && (
              <div className="jw-card p-6 text-center">
                <b className="block text-[14px] text-ink">ยังไม่มีอุปกรณ์ในหมวดนี้</b>
                <span className="mt-1 block text-[13px] text-ink-mute">ลองเปลี่ยนหมวดหรือคำค้นหา อุปกรณ์ที่พร้อมยืมจะแสดงที่นี่</span>
              </div>
            )}
            {filtered.map((eq) => {
              const qty = quantities[eq.id] ?? 0;
              return (
                <div key={eq.id} className="jw-card p-3.5 flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-brand-mint text-brand flex items-center justify-center shrink-0">
                    <Icon name={equipmentIconName(eq.category)} className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <b className="block text-[15px] text-ink">{eq.name}</b>
                    <span className="text-[13px] text-ink-mute">
                      {EQUIPMENT_CATEGORY_LABEL[eq.category]} · คงเหลือ {eq.stock}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={qty <= 0}
                      onClick={() => setQty(eq.id, eq.stock, qty - 1)}
                      className="w-[34px] h-[34px] rounded-full border-[1.5px] border-ink flex items-center justify-center disabled:opacity-40"
                    >
                      <Icon name="minus" className="w-4 h-4" />
                    </button>
                    <b className="min-w-[20px] text-center text-[15px]">{qty}</b>
                    <button
                      type="button"
                      disabled={qty >= eq.stock}
                      onClick={() => setQty(eq.id, eq.stock, qty + 1)}
                      className="w-[34px] h-[34px] rounded-full bg-ink text-white flex items-center justify-center disabled:opacity-40"
                    >
                      <Icon name="plus" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 2: กรอกคำขอใช้อุปกรณ์ */}
      {step === 2 && (
        <div className="max-w-[820px] mx-auto jw-card p-5 sm:p-7 flex flex-col gap-4">
          <div className="pb-3 border-b border-line">
            <b className="text-[17px] text-ink block">แบบคำขอใช้อุปกรณ์ราชการ</b>
            <span className="text-[12.5px] text-ink-mute">
              เรื่อง ขออนุญาตใช้อุปกรณ์ของทางราชการ
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="jw-lbl">เขียนที่</label>
              <input
                type="text"
                value={writtenAt}
                onChange={(e) => setWrittenAt(e.target.value)}
                className="jw-in"
                placeholder="ระบุสถานที่เขียนคำขอ"
              />
            </div>
            <div>
              <label className="jw-lbl">ข้าพเจ้า (นาย/นาง/นางสาว)</label>
              <input
                type="text"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                className="jw-in"
                placeholder="ระบุชื่อ-นามสกุล"
              />
            </div>
            <div>
              <label className="jw-lbl">ตำแหน่ง</label>
              <input
                type="text"
                value={requesterPosition}
                onChange={(e) => setRequesterPosition(e.target.value)}
                className="jw-in"
                placeholder="เช่น ประชาชน / ประธานชุมชน"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="jw-lbl">อยู่บ้านเลขที่</label>
              <input
                type="text"
                value={addressHouseNo}
                onChange={(e) => setAddressHouseNo(e.target.value)}
                className="jw-in"
                placeholder="เลขที่"
              />
            </div>
            <div>
              <label className="jw-lbl">หมู่ที่</label>
              <input
                type="text"
                value={addressMoo}
                onChange={(e) => setAddressMoo(e.target.value)}
                className="jw-in"
                placeholder="หมู่ที่"
              />
            </div>
            <div>
              <label className="jw-lbl">ตำบล / แขวง</label>
              <input
                type="text"
                value={addressSubdistrict}
                onChange={(e) => setAddressSubdistrict(e.target.value)}
                className="jw-in"
                placeholder="ตำบล / แขวง"
              />
            </div>
            <div>
              <label className="jw-lbl">อำเภอ / เขต</label>
              <input
                type="text"
                value={addressDistrict}
                onChange={(e) => setAddressDistrict(e.target.value)}
                className="jw-in"
                placeholder="อำเภอ / เขต"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="jw-lbl">จังหวัด</label>
              <input
                type="text"
                value={addressProvince}
                onChange={(e) => setAddressProvince(e.target.value)}
                className="jw-in"
                placeholder="ระบุจังหวัด"
              />
            </div>
          </div>

          <div>
            <label className="jw-lbl">หน่วยงาน / ชุมชน</label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="jw-in"
              placeholder="ระบุหน่วยงานหรือกลุ่มชุมชน"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="jw-lbl mb-0">กำหนดวันรับและคืนอุปกรณ์</label>
              <Chip tone="green">{borrowDays} วัน</Chip>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="border border-line rounded-xl p-2.5 bg-white flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-ink-mute">เริ่มต้น</span>
                  <span className="text-[12px] text-brand font-semibold">{formatThaiDate(pickupDate, false)}</span>
                </div>
                <DatePickerField
                  value={pickupDate}
                  label="วันที่รับ"
                  onChange={(value) => {
                    setPickupDate(value);
                    if (value > returnDate) {
                      setReturnDate(value);
                    }
                  }}
                />
              </div>

              <span className="hidden sm:inline text-ink-mute">
                <Icon name="arrow-right" className="w-4 h-4" />
              </span>

              <div className="border border-line rounded-xl p-2.5 bg-white flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-ink-mute">สิ้นสุด</span>
                  <span className="text-[12px] text-brand font-semibold">{formatThaiDate(returnDate, false)}</span>
                </div>
                <DatePickerField
                  value={returnDate}
                  label="กำหนดคืน"
                  onChange={(value) => {
                    setReturnDate(value);
                    if (value < pickupDate) {
                      setPickupDate(value);
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* มีความประสงค์ขอใช้อุปกรณ์ราชการ ดังนี้ (ล็อกรายการตามที่เลือกไว้) */}
          <div className="rounded-2xl bg-soft/60 border border-line p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <b className="text-[14px] text-ink">มีความประสงค์ขอใช้อุปกรณ์ราชการ ดังนี้</b>
            </div>
            {purposeItems.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1.15fr_1fr] gap-2.5 items-center">
                <div className="flex items-center gap-2">
                  <b className="text-[14px] text-ink shrink-0 w-5">{idx + 1}.</b>
                  <input
                    type="text"
                    value={row.item}
                    readOnly
                    disabled
                    className="jw-in h-10 text-[13.5px] bg-soft/80 text-ink-mute cursor-not-allowed select-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-ink-mute shrink-0">เพื่อ</span>
                  <input
                    type="text"
                    value={row.forWhat}
                    readOnly
                    disabled
                    className="jw-in h-10 text-[13.5px] bg-soft/80 text-ink-mute cursor-not-allowed select-none"
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="jw-lbl">รายละเอียด / วัตถุประสงค์เพิ่มเติม</label>
            <textarea
              rows={2}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="jw-in h-20 py-2.5"
            />
          </div>

          <div>
            <label className="jw-lbl">แนบเอกสารประกอบคำขอ</label>
            <label className="border-[1.5px] border-dashed border-[#7A7A7A] rounded-2xl p-4 text-center text-ink-mute bg-white cursor-pointer block hover:border-brand">
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setAttachmentName(f.name);
                }}
              />
              <div className="font-medium text-ink">
                {attachmentName ? `ไฟล์ที่แนบ: ${attachmentName}` : 'ลากไฟล์มาวางหรือเลือกไฟล์'}
              </div>
              <div className="text-[12px] text-ink-mute mt-0.5">PDF / JPG ไม่เกิน 10 MB</div>
            </label>
          </div>
        </div>
      )}

      {/* STEP 3: ลงนามและส่ง */}
      {step === 3 && (
        <div className="max-w-[820px] mx-auto flex flex-col gap-4">
          <OfficialGovFormDocument
            customFields={{
              formTitle: 'แบบคำขอใช้อุปกรณ์ราชการ',
              subject: 'ขออนุญาตใช้อุปกรณ์ของทางราชการ',
              desireLabel: 'มีความประสงค์ขอใช้อุปกรณ์ราชการ ดังนี้',
              requesterRoleCaption: 'ผู้ขออนุญาตใช้อุปกรณ์ราชการ',
              writtenAt,
              requesterName,
              requesterPosition,
              addressHouseNo,
              addressMoo,
              addressSubdistrict,
              addressDistrict,
              addressProvince,
              organization,
              purposeItems,
              requesterSignature: signature,
            }}
          />

          <div className="jw-card p-5 flex flex-col gap-2">
            <label className="jw-lbl">เขียนลายเซ็นผู้ขอใช้อุปกรณ์ ({requesterName || account?.name || 'สมชาย ใจดี'})</label>
            <SignatureBox
              value={signature}
              onChange={setSignature}
              savedSignature={account?.signature}
              signerLabel={`${requesterName || account?.name || 'สมชาย ใจดี'} · ผู้ขออนุญาตใช้อุปกรณ์ราชการ`}
            />
            <p className="text-[13px] text-ink-mute mt-1">
              ต้องลงนามทุกฝ่าย (4 ฝ่าย): (1) ผู้ยื่นคำขอ → (2) เจ้าหน้าที่ผู้ตรวจสอบ → (3) ปลัด อบต. → (4) นายก อบต.
            </p>
            {draftSaved && (
              <div className="rounded-2xl bg-brand-mint text-brand px-3.5 py-2 text-[13px] font-semibold mt-1">
                บันทึกร่างคำขอใช้อุปกรณ์เรียบร้อยแล้ว
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
