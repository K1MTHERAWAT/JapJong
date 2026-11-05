'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Equipment, PublicAccount, REPAIR_CATEGORIES, RequestType, Venue } from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, SignatureBox, Tabs } from '@/components/ui';
import { api } from '@/lib/api';

export default function StaffWalkInPage() {
  const router = useRouter();
  const { account, accounts } = useAuth();
  const [serviceType, setServiceType] = useState<RequestType>('booking');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  // ข้อมูลผู้มาติดต่อ
  const [query, setQuery] = useState('');
  const [foundUser, setFoundUser] = useState<PublicAccount | null>(null);
  const [borrowerName, setBorrowerName] = useState('');
  const [organization, setOrganization] = useState('');

  // จองสถานที่ (booking)
  const [venueId, setVenueId] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [timeSlot, setTimeSlot] = useState('09:00–12:00');
  const [purpose, setPurpose] = useState('');

  // ยืม–คืนอุปกรณ์ (borrow)
  const [equipmentId, setEquipmentId] = useState('');
  const [equipmentQty, setEquipmentQty] = useState(1);
  const [pickupDate, setPickupDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [returnDate, setReturnDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });

  // แจ้งซ่อม (repair)
  const [building, setBuilding] = useState('อาคารสำนักงาน');
  const [floor, setFloor] = useState('ชั้น 1');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<string>(REPAIR_CATEGORIES[0] ?? 'ไฟฟ้า');
  const [detail, setDetail] = useState('');
  const [photos, setPhotos] = useState(0);

  // บันทึกร่าง & ลงนาม 2 ฝ่าย
  const [draftSaved, setDraftSaved] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [citizenSignature, setCitizenSignature] = useState('');
  const [staffSignature, setStaffSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .venues()
      .then((list) => {
        setVenues(list);
        if (list.length > 0) setVenueId((prev) => prev || list[0].id);
      })
      .catch(() => {});
    api
      .equipment()
      .then((list) => {
        setEquipment(list);
        if (list.length > 0) setEquipmentId((prev) => prev || list[0].id);
      })
      .catch(() => {});
  }, []);

  const handleSearch = () => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const match = accounts.find(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        (digits && a.phone.replace(/\D/g, '').includes(digits)),
    );
    if (match) {
      setFoundUser(match);
      setBorrowerName(match.name);
      setOrganization(match.department);
    } else {
      setFoundUser(null);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const reqUserId = foundUser?.id ?? 'u-somchai';
      if (serviceType === 'booking') {
        const [st, et] = timeSlot.split('–');
        const created = await api.createBooking({
          venueIds: [venueId],
          periods: [{ start: `${date}T${st}:00+07:00`, end: `${date}T${et}:00+07:00` }],
          purpose,
          activity: purpose,
          requesterId: reqUserId,
          requesterName: borrowerName,
          organization,
          requesterSignature: citizenSignature,
          createdByStaffSignature: staffSignature,
        });
        router.push(`/requests/${created.id}`);
      } else if (serviceType === 'borrow') {
        const created = await api.createBorrow({
          items: [{ equipmentId, qty: equipmentQty }],
          pickupDate,
          returnDate,
          purpose,
          requesterId: reqUserId,
          requesterName: borrowerName,
          organization,
          requesterSignature: citizenSignature,
          createdByStaffSignature: staffSignature,
        });
        router.push(`/requests/${created.id}`);
      } else {
        const created = await api.createRepair({
          building,
          floor,
          location,
          category,
          detail,
          photos,
          requesterId: reqUserId,
          requesterName: borrowerName,
          organization,
          requesterSignature: citizenSignature,
          createdByStaffSignature: staffSignature,
        });
        router.push(`/requests/${created.id}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="กรอกคำขอแทน"
      backHref="/staff"
      rightLabel={account?.nickname || 'สุดา'}
      maxWidth="max-w-[680px]"
      footer={
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
            disabled={submitting}
            onClick={() => (serviceType === 'repair' ? handleSubmit() : setShowSignModal(true))}
            className="jw-btn flex-[1.5] sm:w-64"
          >
            {serviceType === 'repair'
              ? submitting
                ? 'กำลังบันทึก...'
                : 'บันทึกส่งเรื่องแจ้งซ่อม'
              : 'ถัดไป · ลงนามผู้มาติดต่อ & เจ้าหน้าที่'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* เลือกประเภทคำขอที่กรอกแทน: สถานที่ / อุปกรณ์ / แจ้งซ่อม */}
        <Tabs<RequestType>
          value={serviceType}
          onChange={setServiceType}
          options={[
            { value: 'booking', label: 'สถานที่' },
            { value: 'borrow', label: 'อุปกรณ์' },
            { value: 'repair', label: 'แจ้งซ่อม' },
          ]}
        />

        <div className="jw-card p-5 sm:p-6 flex flex-col gap-4">
          <div>
            <label className="jw-lbl">ค้นหาผู้ใช้ (เบอร์โทรหรือชื่อ)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="กรอกเบอร์โทรหรือชื่อ เช่น 081-234-5678 หรือ สมชาย"
                className="jw-in flex-1"
              />
              <button type="button" onClick={handleSearch} className="jw-btn jw-btn-sm shrink-0">
                ค้นหา
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {foundUser ? (
              <Chip tone="green">
                <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} /> พบผู้ใช้เดิม ({foundUser.name})
              </Chip>
            ) : (
              <Chip tone="amber">ผู้ใช้ใหม่ (กรอกชื่อด้านล่าง)</Chip>
            )}
            <Chip tone="blue">กรอกแทนที่เคาน์เตอร์ · ต้องลงนาม 2 ฝ่าย</Chip>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="jw-lbl">ชื่อ-นามสกุลผู้ยืม / ผู้แจ้ง</label>
              <input
                type="text"
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                placeholder="กรอกชื่อ-นามสกุล"
                className="jw-in"
              />
            </div>
            <div>
              <label className="jw-lbl">หน่วยงาน / ชุมชน</label>
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="กรอกชื่อหน่วยงานหรือชุมชน"
                className="jw-in"
              />
            </div>
          </div>

          {serviceType === 'booking' && (
            <>
              <div>
                <label className="jw-lbl">รายการสถานที่</label>
                <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className="jw-in">
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} (ความจุ {v.capacity} คน)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="jw-lbl">วันที่</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="jw-in" />
                </div>
                <div>
                  <label className="jw-lbl">เวลา</label>
                  <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} className="jw-in">
                    <option value="09:00–12:00">09:00–12:00</option>
                    <option value="13:00–17:00">13:00–17:00</option>
                    <option value="08:00–17:00">08:00–17:00</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="jw-lbl">วัตถุประสงค์</label>
                <textarea
                  rows={2}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="ระบุวัตถุประสงค์การขอใช้สถานที่..."
                  className="jw-in h-20 py-2.5"
                />
              </div>
            </>
          )}

          {serviceType === 'borrow' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3.5">
                <div>
                  <label className="jw-lbl">รายการอุปกรณ์ครุภัณฑ์</label>
                  <select
                    value={equipmentId}
                    onChange={(e) => setEquipmentId(e.target.value)}
                    className="jw-in"
                  >
                    {equipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.name} (คงเหลือ {eq.stock})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="jw-lbl">จำนวนที่ยืม</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={equipmentQty}
                    onChange={(e) => setEquipmentQty(Math.max(1, Number(e.target.value)))}
                    className="jw-in"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="jw-lbl">วันที่รับ</label>
                  <input
                    type="date"
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="jw-in"
                  />
                </div>
                <div>
                  <label className="jw-lbl">กำหนดคืน</label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="jw-in"
                  />
                </div>
              </div>

              <div>
                <label className="jw-lbl">วัตถุประสงค์</label>
                <textarea
                  rows={2}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="ระบุวัตถุประสงค์การขอยืมอุปกรณ์..."
                  className="jw-in h-20 py-2.5"
                />
              </div>
            </>
          )}

          {serviceType === 'repair' && (
            <>
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="jw-lbl">อาคาร</label>
                  <select value={building} onChange={(e) => setBuilding(e.target.value)} className="jw-in">
                    <option>อาคารสำนักงาน</option>
                    <option>ศาลา หมู่ 5</option>
                    <option>สนามกีฬากลาง</option>
                  </select>
                </div>
                <div>
                  <label className="jw-lbl">ชั้น</label>
                  <select value={floor} onChange={(e) => setFloor(e.target.value)} className="jw-in">
                    <option>ชั้น 1</option>
                    <option>ชั้น 2</option>
                    <option>ชั้น 3</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="jw-lbl">ห้อง / อุปกรณ์</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="เช่น ห้องประชุมใหญ่ · เครื่องปรับอากาศ"
                  className="jw-in"
                />
              </div>

              <div>
                <label className="jw-lbl">ประเภทปัญหา</label>
                <div className="flex flex-wrap gap-2">
                  {REPAIR_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`h-[36px] px-3.5 rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                        category === c
                          ? 'bg-brand border-brand text-white'
                          : 'bg-white border-line text-ink hover:border-brand'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="jw-lbl">รายละเอียดปัญหา</label>
                <textarea
                  rows={2}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="ระบุอาการชำรุดหรือรายละเอียดปัญหาที่พบ..."
                  className="jw-in h-20 py-2.5"
                />
              </div>
            </>
          )}

          {draftSaved && (
            <div className="rounded-2xl bg-brand-mint text-brand px-3.5 py-2 text-[13px] font-semibold">
              บันทึกร่างคำขอหน้าเคาน์เตอร์เรียบร้อยแล้ว
            </div>
          )}
        </div>
      </div>

      {/* Modal ลายเซ็นผู้มาติดต่อ + เจ้าหน้าที่ผู้รับเรื่องที่เคาน์เตอร์ */}
      {showSignModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="w-full max-w-[560px] bg-white rounded-hard p-5 flex flex-col gap-4 shadow-high my-6">
            <div className="flex items-center justify-between">
              <div>
                <b className="text-[17px] block">ลงลายมือชื่อทั้ง 2 ฝ่ายที่เคาน์เตอร์</b>
                <span className="text-[12px] text-ink-mute">
                  ผู้มาติดต่อและเจ้าหน้าที่ต้องเขียนลายเซ็นบนหน้าจอครบทั้ง 2 ฝ่าย
                </span>
              </div>
              <button type="button" onClick={() => setShowSignModal(false)}>
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="jw-lbl">1. ลายเซ็นผู้มาติดต่อ / ผู้ยื่นคำขอ ({borrowerName})</label>
              <SignatureBox
                value={citizenSignature}
                onChange={setCitizenSignature}
                savedSignature={foundUser?.signature}
                pinAccountId={foundUser?.id}
                signerLabel={`${borrowerName} · ผู้มาติดต่อ`}
                height={130}
              />
            </div>

            <div className="flex flex-col gap-1.5 pt-2 border-t border-line">
              <label className="jw-lbl">
                2. ลายเซ็นเจ้าหน้าที่ผู้รับเรื่องหน้าเคาน์เตอร์ ({account?.name || 'นางสาวสุดา รอบคอบ'})
              </label>
              <SignatureBox
                value={staffSignature}
                onChange={setStaffSignature}
                savedSignature={account?.signature}
                signerLabel={`${account?.name || 'นางสาวสุดา รอบคอบ'} · เจ้าหน้าที่ผู้กรอกแทน`}
                height={130}
              />
            </div>

            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={() => setShowSignModal(false)} className="jw-btn-sec flex-1">
                ย้อนกลับ
              </button>
              <button
                type="button"
                disabled={submitting || !citizenSignature.trim() || !staffSignature.trim()}
                onClick={handleSubmit}
                className="jw-btn flex-[1.5]"
              >
                {submitting ? 'กำลังบันทึก...' : 'ยืนยันลงนาม 2 ฝ่าย & ส่งคำขอ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
