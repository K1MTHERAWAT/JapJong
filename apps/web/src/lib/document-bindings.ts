/**
 * รายการตัวแปรไดนามิก (Data Binding Options) สำหรับแม่แบบเอกสารราชการ
 * ใช้ร่วมกันระหว่าง Structured Editor และ Freeform A4 Editor
 */
export const DATA_BINDING_OPTIONS = [
  {
    group: 'ข้อมูลผู้ยื่นคำขอ',
    items: [
      { key: 'requester.name', label: 'ชื่อ-นามสกุลผู้ขอ' },
      { key: 'requester.position', label: 'ตำแหน่ง' },
      { key: 'requester.phone', label: 'เบอร์โทรศัพท์' },
      { key: 'requester.organization', label: 'หน่วยงาน / สังกัด' },
      { key: 'requester.citizenId', label: 'เลขประจำตัวประชาชน' },
      { key: 'requester.addressHouseNo', label: 'บ้านเลขที่' },
      { key: 'requester.addressMoo', label: 'หมู่ที่' },
      { key: 'requester.addressSubdistrict', label: 'ตำบล / แขวง' },
      { key: 'requester.addressDistrict', label: 'อำเภอ / เขต' },
      { key: 'requester.addressProvince', label: 'จังหวัด' },
      { key: 'requester.address', label: 'ที่อยู่ (รวมทั้งหมด)' },
    ],
  },
  {
    group: 'ข้อมูลคำขอ / วันเวลา',
    items: [
      { key: 'document.number', label: 'เลขที่เอกสารคำขอ' },
      { key: 'document.writtenAt', label: 'สถานที่เขียน' },
      { key: 'document.day', label: 'วันที่ (ตัวเลข)' },
      { key: 'document.month', label: 'เดือน (ภาษาไทย)' },
      { key: 'document.year', label: 'ปี พ.ศ.' },
      { key: 'booking.startDate', label: 'วันที่เริ่มใช้' },
      { key: 'booking.endDate', label: 'วันที่สิ้นสุด' },
      { key: 'booking.location', label: 'สถานที่ที่ขอใช้ (รายการ 1)' },
      { key: 'booking.purpose', label: 'วัตถุประสงค์การใช้ (รายการ 1)' },
      { key: 'booking.item2.location', label: 'สถานที่/รายการที่ 2' },
      { key: 'booking.item2.purpose', label: 'วัตถุประสงค์รายการที่ 2' },
      { key: 'booking.item3.location', label: 'สถานที่/รายการที่ 3' },
      { key: 'booking.item3.purpose', label: 'วัตถุประสงค์รายการที่ 3' },
    ],
  },
  {
    group: 'ข้อมูลครุภัณฑ์ / อุปกรณ์',
    items: [
      { key: 'equipment.name', label: 'ชื่อครุภัณฑ์' },
      { key: 'equipment.assetCode', label: 'รหัสครุภัณฑ์' },
      { key: 'equipment.quantity', label: 'จำนวนที่ขอยืม' },
    ],
  },
  {
    group: 'ข้อมูลการลงนาม / ผู้อนุมัติ',
    items: [
      { key: 'signature.requester.image', label: 'ลายเซ็นผู้ยื่นคำขอ (รูปภาพ)' },
      { key: 'signature.staff.image', label: 'ลายเซ็นเจ้าหน้าที่ตรวจสอบ (รูปภาพ)' },
      { key: 'signature.staff.name', label: 'ชื่อเจ้าหน้าที่ตรวจสอบ' },
      { key: 'signature.staff.title', label: 'ตำแหน่งเจ้าหน้าที่ตรวจสอบ' },
      { key: 'signature.staff.date', label: 'วันที่เจ้าหน้าที่ลงนาม' },
      { key: 'signature.staff.note', label: 'ความเห็นของเจ้าหน้าที่' },
      { key: 'signature.l2.image', label: 'ลายเซ็นผู้อนุมัติระดับ 2 (รูปภาพ)' },
      { key: 'signature.l2.name', label: 'ชื่อผู้อนุมัติระดับ 2' },
      { key: 'signature.l2.title', label: 'ตำแหน่งผู้อนุมัติระดับ 2' },
      { key: 'signature.l2.date', label: 'วันที่ผู้อนุมัติระดับ 2 ลงนาม' },
      { key: 'signature.l2.note', label: 'ความเห็นผู้อนุมัติระดับ 2' },
      { key: 'signature.l1.image', label: 'ลายเซ็นผู้อนุมัติระดับ 1 (รูปภาพ)' },
      { key: 'signature.l1.name', label: 'ชื่อผู้อนุมัติระดับ 1' },
      { key: 'signature.l1.title', label: 'ตำแหน่งผู้อนุมัติระดับ 1' },
      { key: 'signature.l1.date', label: 'วันที่ผู้อนุมัติระดับ 1 ลงนาม' },
      { key: 'signature.l1.note', label: 'ความเห็น / คำสั่งผู้อนุมัติระดับ 1' },
    ],
  },
  {
    group: 'ช่องว่างเขียนมือ (ไม่ผูกข้อมูล)',
    items: [{ key: 'manual.blank', label: 'ช่องว่างสำหรับกรอกด้วยมือ' }],
  },
] as const;

export function findBindingLabel(key?: string): string {
  if (!key) return 'ช่องว่างสำหรับกรอกด้วยมือ';
  for (const g of DATA_BINDING_OPTIONS) {
    const found = g.items.find((it) => it.key === key);
    if (found) return found.label;
  }
  return key;
}

/**
 * ค่าตัวอย่างสำหรับแสดงผลในโหมด Preview ของ Freeform A4 Editor
 */
export function getSampleBindingValue(key?: string): string {
  const map: Record<string, string> = {
    'requester.name': 'นายสมชาย ใจดี',
    'requester.position': 'นักวิชาการคอมพิวเตอร์ปฏิบัติการ',
    'requester.phone': '081-234-5678',
    'requester.organization': 'กองยุทธศาสตร์และงบประมาณ',
    'requester.citizenId': '1-1004-00123-45-6',
    'requester.addressHouseNo': '99',
    'requester.addressMoo': '1',
    'requester.addressSubdistrict': 'น้ำชำ',
    'requester.addressDistrict': 'เมืองแพร่',
    'requester.addressProvince': 'แพร่',
    'requester.address': '99 หมู่ 1 ต.น้ำชำ อ.เมืองแพร่ จ.แพร่',
    'document.number': 'ที่ ขก 52001/0042',
    'document.writtenAt': 'ที่ทำการองค์การบริหารส่วนตำบลน้ำชำ',
    'document.day': '19',
    'document.month': 'พฤศจิกายน',
    'document.year': '2569',
    'booking.startDate': '20 พ.ย. 2569 09:00 น.',
    'booking.endDate': '20 พ.ย. 2569 16:00 น.',
    'booking.location': 'ห้องประชุมใหญ่ ชั้น 2',
    'booking.purpose': 'จัดอบรมเชิงปฏิบัติการประจำปีงบประมาณ',
    'booking.item2.location': 'ลานอเนกประสงค์',
    'booking.item2.purpose': 'จัดกิจกรรมกลุ่มย่อย',
    'booking.item3.location': 'ห้องโสตทัศนูปกรณ์',
    'booking.item3.purpose': 'เตรียมอุปกรณ์นำเสนอ',
    'equipment.name': 'เครื่องฉายโปรเจคเตอร์ Epson',
    'equipment.assetCode': '7440-001-0005',
    'equipment.quantity': '2 เครื่อง',
    'signature.requester.image': '[ลายเซ็นผู้ยื่นคำขอ]',
    'signature.staff.image': '[ลายเซ็นเจ้าหน้าที่]',
    'signature.staff.name': 'นางสาวสุดา รักงาน',
    'signature.staff.title': 'เจ้าหน้าที่ธุรการ',
    'signature.staff.date': '19 พ.ย. 2569',
    'signature.staff.note': 'เห็นควรอนุญาตตามระเบียบ',
    'signature.l2.image': '[ลายเซ็นผู้อนุมัติระดับ 2]',
    'signature.l2.name': 'นายวิชัย มั่นคง',
    'signature.l2.title': 'ปลัด อบต.',
    'signature.l2.date': '19 พ.ย. 2569',
    'signature.l2.note': 'เห็นชอบตามเสนอ',
    'signature.l1.image': '[ลายเซ็นผู้อนุมัติระดับ 1]',
    'signature.l1.name': 'นายประสิทธิ์ พัฒนา',
    'signature.l1.title': 'นายก อบต.',
    'signature.l1.date': '19 พ.ย. 2569',
    'signature.l1.note': 'อนุมัติ',
    'manual.blank': '',
  };
  return key ? (map[key] ?? '') : '';
}
