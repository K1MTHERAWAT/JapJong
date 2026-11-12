import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ItemQty, Period } from '@japjong/shared';

/**
 * Data Transfer Object (DTO) สำหรับสร้างคำขอจองใช้สถานที่ราชการ
 */
export class CreateBookingDto {
  // รหัสสถานที่ราชการที่ต้องการจอง (ต้องมีอย่างน้อย 1 แห่ง)
  @IsArray()
  @ArrayNotEmpty({ message: 'กรุณาเลือกสถานที่อย่างน้อย 1 แห่ง' })
  venueIds!: string[];

  // ช่วงวัน-เวลาที่ขอใช้บริการ
  @IsArray()
  @ArrayNotEmpty({ message: 'กรุณาระบุช่วงเวลาการใช้งาน' })
  periods!: Period[];

  // จำนวนผู้เข้าร่วมกิจกรรมโดยประมาณ
  @IsOptional()
  @IsInt()
  @Min(1)
  attendees?: number;

  // ชื่องานหรือกิจกรรม
  @IsOptional()
  @IsString()
  activity?: string;

  // วัตถุประสงค์ในการขอใช้สถานที่
  @IsOptional()
  @IsString()
  purpose?: string;

  // หน่วยงาน / องค์กร / กลุ่มบุคคลที่ยื่นขอ
  @IsOptional()
  @IsString()
  organization?: string;

  // เอกสารแนบประกอบคำขอ (URLs หรือ Base64)
  @IsOptional()
  @IsArray()
  attachments?: string[];

  // รายการอุปกรณ์เสริมที่ต้องการขอใช้ร่วมกับสถานที่
  @IsOptional()
  @IsArray()
  extraItems?: ItemQty[];

  // รหัสผู้ยื่นคำขอ (กรณีเจ้าหน้าที่กรอกแทน)
  @IsOptional()
  @IsString()
  requesterId?: string;

  // ชื่อผู้ยื่นคำขอ
  @IsOptional()
  @IsString()
  requesterName?: string;

  // เบอร์โทรศัพท์ติดต่อของผู้ยื่นคำขอ
  @IsOptional()
  @IsString()
  requesterPhone?: string;

  // ลายเซ็นอิเล็กทรอนิกส์ของผู้ยื่นคำขอ
  @IsOptional()
  @IsString()
  requesterSignature?: string;

  // ลายเซ็นเจ้าหน้าที่ผู้รับเรื่อง/กรอกแทน
  @IsOptional()
  @IsString()
  createdByStaffSignature?: string;

  // เขียนที่ (สถานที่ทำบันทึกคำขอ)
  @IsOptional()
  @IsString()
  writtenAt?: string;

  // ตำแหน่งของผู้ยื่นคำขอ
  @IsOptional()
  @IsString()
  requesterPosition?: string;

  // ข้อมูลที่อยู่: บ้านเลขที่
  @IsOptional()
  @IsString()
  addressHouseNo?: string;

  // ข้อมูลที่อยู่: หมู่ที่
  @IsOptional()
  @IsString()
  addressMoo?: string;

  // ข้อมูลที่อยู่: ตำบล / แขวง
  @IsOptional()
  @IsString()
  addressSubdistrict?: string;

  // ข้อมูลที่อยู่: อำเภอ / เขต
  @IsOptional()
  @IsString()
  addressDistrict?: string;

  // ข้อมูลที่อยู่: จังหวัด
  @IsOptional()
  @IsString()
  addressProvince?: string;

  // รหัสตำบล
  @IsOptional()
  @IsString()
  addressSubdistrictId?: string;

  // รหัสอำเภอ
  @IsOptional()
  @IsString()
  addressDistrictId?: string;

  // รหัสจังหวัด
  @IsOptional()
  @IsString()
  addressProvinceId?: string;

  // วัตถุประสงค์การใช้บริการแบบแจกแจงรายข้อ
  @IsOptional()
  @IsArray()
  purposeItems?: { item: string; forWhat: string }[];
}

/**
 * Data Transfer Object (DTO) สำหรับสร้างคำขอยืมอุปกรณ์และพัสดุราชการ
 */
export class CreateBorrowDto {
  // รายการอุปกรณ์และจำนวนที่ขอยืม (ต้องมีอย่างน้อย 1 รายการ)
  @IsArray()
  @ArrayNotEmpty({ message: 'กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการ' })
  items!: ItemQty[];

  // วันที่และเวลารับอุปกรณ์
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุวันที่รับอุปกรณ์' })
  pickupDate!: string;

  // วันที่และเวลากำหนดส่งคืนอุปกรณ์
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุวันที่คืนอุปกรณ์' })
  returnDate!: string;

  // วัตถุประสงค์ในการขอยืม
  @IsOptional()
  @IsString()
  purpose?: string;

  // หน่วยงาน / องค์กรที่ขอยืม
  @IsOptional()
  @IsString()
  organization?: string;

  // เอกสารแนบ
  @IsOptional()
  @IsArray()
  attachments?: string[];

  // รหัสผู้ยื่นคำขอ
  @IsOptional()
  @IsString()
  requesterId?: string;

  // ชื่อผู้ยื่นคำขอ
  @IsOptional()
  @IsString()
  requesterName?: string;

  // เบอร์โทรศัพท์ผู้ยื่นคำขอ
  @IsOptional()
  @IsString()
  requesterPhone?: string;

  // ลายเซ็นผู้ยื่นคำขอ
  @IsOptional()
  @IsString()
  requesterSignature?: string;

  // ลายเซ็นเจ้าหน้าที่ผู้รับเรื่อง
  @IsOptional()
  @IsString()
  createdByStaffSignature?: string;

  // เขียนที่
  @IsOptional()
  @IsString()
  writtenAt?: string;

  // ตำแหน่งผู้ยื่นคำขอ
  @IsOptional()
  @IsString()
  requesterPosition?: string;

  // ข้อมูลที่อยู่ผู้ยืม
  @IsOptional()
  @IsString()
  addressHouseNo?: string;

  @IsOptional()
  @IsString()
  addressMoo?: string;

  @IsOptional()
  @IsString()
  addressSubdistrict?: string;

  @IsOptional()
  @IsString()
  addressDistrict?: string;

  @IsOptional()
  @IsString()
  addressProvince?: string;

  @IsOptional()
  @IsString()
  addressSubdistrictId?: string;

  @IsOptional()
  @IsString()
  addressDistrictId?: string;

  @IsOptional()
  @IsString()
  addressProvinceId?: string;

  // วัตถุประสงค์แบบแจกแจงรายข้อ
  @IsOptional()
  @IsArray()
  purposeItems?: { item: string; forWhat: string }[];
}

/**
 * Data Transfer Object (DTO) สำหรับสร้างคำขอแจ้งซ่อมบำรุง
 */
export class CreateRepairDto {
  // รายละเอียดอาการชำรุดเสียหาย (ห้ามว่าง)
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุรายละเอียดอาการชำรุด' })
  detail!: string;

  // อาคาร / สิ่งปลูกสร้างที่ชำรุด
  @IsOptional()
  @IsString()
  building?: string;

  // ชั้น
  @IsOptional()
  @IsString()
  floor?: string;

  // สถานที่ / จุดสังเกต
  @IsOptional()
  @IsString()
  location?: string;

  // หมวดหมู่งานซ่อม (เช่น ไฟฟ้า, ประปา, ปรับอากาศ, โครงสร้าง)
  @IsOptional()
  @IsString()
  category?: string;

  // จำนวนภาพถ่ายความเสียหาย
  @IsOptional()
  @IsInt()
  @Min(0)
  photos?: number;

  // ลิงก์ไฟล์ภาพถ่ายความเสียหาย
  @IsOptional()
  @IsArray()
  attachments?: string[];

  // รหัสผู้แจ้งซ่อม
  @IsOptional()
  @IsString()
  requesterId?: string;

  // ชื่อผู้แจ้งซ่อม
  @IsOptional()
  @IsString()
  requesterName?: string;

  // เบอร์โทรศัพท์ผู้แจ้งซ่อม
  @IsOptional()
  @IsString()
  requesterPhone?: string;

  // สังกัด / หน่วยงาน
  @IsOptional()
  @IsString()
  organization?: string;

  // ลายเซ็นผู้แจ้งซ่อม
  @IsOptional()
  @IsString()
  requesterSignature?: string;

  // ลายเซ็นเจ้าหน้าที่รับเรื่อง
  @IsOptional()
  @IsString()
  createdByStaffSignature?: string;
}

/**
 * Data Transfer Object (DTO) สำหรับลงนามอนุมัติหรือปฏิเสธคำขอ
 */
export class SignDto {
  // คำสั่งการตัดสินใจ (approve = อนุมัติ, reject = ไม่อนุมัติ)
  @IsIn(['approve', 'reject'], { message: 'คำสั่งต้องเป็น approve หรือ reject' })
  decision!: 'approve' | 'reject';

  // ลายเซ็นดิจิทัลของผู้มีอำนาจลงนาม
  @IsOptional()
  @IsString()
  signature?: string;

  // รหัส PIN 6 หลักเพื่อยืนยันการลงนาม
  @IsOptional()
  @IsString()
  pin?: string;

  // หมายเหตุหรือความเห็นเพิ่มเติมของผู้อนุมัติ
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * Data Transfer Object (DTO) สำหรับขอเลื่อนวัน-เวลาการใช้บริการ
 */
export class RescheduleDto {
  // ช่วงเวลาใหม่ที่ขอเปลี่ยนแปลง (กรณีสถานที่)
  @IsOptional()
  @IsArray()
  periods?: Period[];

  // วันที่รับอุปกรณ์ใหม่ (กรณียืมอุปกรณ์)
  @IsOptional()
  @IsString()
  pickupDate?: string;

  // วันที่คืนอุปกรณ์ใหม่ (กรณียืมอุปกรณ์)
  @IsOptional()
  @IsString()
  returnDate?: string;

  // เลือกว่าจะคงสถานะอนุมัติเดิมไว้หรือไม่
  @IsOptional()
  keepApproved?: boolean;
}

/**
 * Data Transfer Object (DTO) สำหรับบันทึกการส่งมอบ-รับคืนสถานที่หรืออุปกรณ์ (Handover Checklist)
 */
export class HandoverDto {
  // ช่วงเวลาการตรวจรับ (before = ก่อนใช้งาน, after = หลังใช้งาน)
  @IsIn(['before', 'after'], { message: 'phase ต้องเป็น before หรือ after' })
  phase!: 'before' | 'after';

  // รายการตรวจสอบสภาพความพร้อม
  @IsOptional()
  @IsArray()
  items?: { label: string; ok: boolean }[];

  // หมายเหตุสภาพความพร้อม
  @IsOptional()
  @IsString()
  note?: string;

  // ลายเซ็นประชาชนผู้รับมอบ/ส่งคืน
  @IsOptional()
  @IsString()
  citizenSignature?: string;

  // ลายเซ็นเจ้าหน้าที่ผู้ส่งมอบ/รับคืน
  @IsOptional()
  @IsString()
  staffSignature?: string;
}

/**
 * Data Transfer Object (DTO) สำหรับอัปเดตสถานะงานซ่อมบำรุง
 */
export class RepairStatusDto {
  // การดำเนินการ (รับเรื่อง, ซ่อมเสร็จ, ยืนยันปิดงาน, เปิดงานซ่อมใหม่, ปฏิเสธ)
  @IsIn(['accept', 'finish', 'confirm', 'reopen', 'reject'], {
    message: 'action ต้องเป็น accept, finish, confirm, reopen หรือ reject',
  })
  action!: 'accept' | 'finish' | 'confirm' | 'reopen' | 'reject';

  // ผลการซ่อมแซมหรือแนวทางแก้ไข
  @IsOptional()
  @IsString()
  resolution?: string;

  // เหตุผลการปฏิเสธหรือเปิดงานใหม่
  @IsOptional()
  @IsString()
  reason?: string;

  // ลายเซ็นผู้ดำเนินการ
  @IsOptional()
  @IsString()
  signature?: string;

  // รหัส PIN ยืนยันการลงนาม
  @IsOptional()
  @IsString()
  pin?: string;

  // ภาพถ่ายผลงานหลังการซ่อมเสร็จสิ้น
  @IsOptional()
  @IsArray()
  afterPhotos?: string[];
}

/**
 * Data Transfer Object (DTO) สำหรับบันทึกการรับมอบอุปกรณ์
 */
export class ReceiveEquipmentDto {
  // ภาพถ่ายหลักฐานขณะรับอุปกรณ์
  @IsOptional()
  @IsArray()
  photos?: string[];

  // หมายเหตุการรับมอบ
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * Data Transfer Object (DTO) สำหรับบันทึกการนำส่งคืนอุปกรณ์
 */
export class ReturnEquipmentDto {
  // ภาพถ่ายหลักฐานสภาพอุปกรณ์ขณะส่งคืน
  @IsOptional()
  @IsArray()
  photos?: string[];

  // หมายเหตุการส่งคืน
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * Data Transfer Object (DTO) สำหรับเจ้าหน้าที่บันทึกผลการตรวจสอบสภาพพัสดุที่รับคืน
 */
export class InspectReturnDto {
  // ผลการตรวจรับ (normal = ปกติ, damaged = ชำรุด, incomplete = ส่งคืนไม่ครบ)
  @IsIn(['normal', 'damaged', 'incomplete'], {
    message: 'ผลการตรวจรับต้องเป็น normal, damaged หรือ incomplete',
  })
  result!: 'normal' | 'damaged' | 'incomplete';

  // หมายเหตุสภาพอุปกรณ์
  @IsOptional()
  @IsString()
  note?: string;

  // ภาพถ่ายหลักฐานสภาพชำรุดเสียหาย
  @IsOptional()
  @IsArray()
  photos?: string[];
}
