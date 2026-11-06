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

export class CreateBookingDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'กรุณาเลือกสถานที่อย่างน้อย 1 แห่ง' })
  venueIds!: string[];

  @IsArray()
  @ArrayNotEmpty({ message: 'กรุณาระบุช่วงเวลาการใช้งาน' })
  periods!: Period[];

  @IsOptional()
  @IsInt()
  @Min(1)
  attendees?: number;

  @IsOptional()
  @IsString()
  activity?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @IsArray()
  attachments?: string[];

  @IsOptional()
  @IsArray()
  extraItems?: ItemQty[];

  @IsOptional()
  @IsString()
  requesterId?: string;

  @IsOptional()
  @IsString()
  requesterName?: string;

  @IsOptional()
  @IsString()
  requesterPhone?: string;

  @IsOptional()
  @IsString()
  requesterSignature?: string;

  @IsOptional()
  @IsString()
  createdByStaffSignature?: string;

  @IsOptional()
  @IsString()
  writtenAt?: string;

  @IsOptional()
  @IsString()
  requesterPosition?: string;

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
  @IsArray()
  purposeItems?: { item: string; forWhat: string }[];
}

export class CreateBorrowDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการ' })
  items!: ItemQty[];

  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุวันที่รับอุปกรณ์' })
  pickupDate!: string;

  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุวันที่คืนอุปกรณ์' })
  returnDate!: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @IsArray()
  attachments?: string[];

  @IsOptional()
  @IsString()
  requesterId?: string;

  @IsOptional()
  @IsString()
  requesterName?: string;

  @IsOptional()
  @IsString()
  requesterPhone?: string;

  @IsOptional()
  @IsString()
  requesterSignature?: string;

  @IsOptional()
  @IsString()
  createdByStaffSignature?: string;

  @IsOptional()
  @IsString()
  writtenAt?: string;

  @IsOptional()
  @IsString()
  requesterPosition?: string;

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
  @IsArray()
  purposeItems?: { item: string; forWhat: string }[];
}

export class CreateRepairDto {
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุรายละเอียดอาการชำรุด' })
  detail!: string;

  @IsOptional()
  @IsString()
  building?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  photos?: number;

  @IsOptional()
  @IsArray()
  attachments?: string[];

  @IsOptional()
  @IsString()
  requesterId?: string;

  @IsOptional()
  @IsString()
  requesterName?: string;

  @IsOptional()
  @IsString()
  requesterPhone?: string;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @IsString()
  requesterSignature?: string;

  @IsOptional()
  @IsString()
  createdByStaffSignature?: string;
}

export class SignDto {
  @IsIn(['approve', 'reject'], { message: 'คำสั่งต้องเป็น approve หรือ reject' })
  decision!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsString()
  pin?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RescheduleDto {
  @IsOptional()
  @IsArray()
  periods?: Period[];

  @IsOptional()
  @IsString()
  pickupDate?: string;

  @IsOptional()
  @IsString()
  returnDate?: string;
}

export class HandoverDto {
  @IsIn(['before', 'after'], { message: 'phase ต้องเป็น before หรือ after' })
  phase!: 'before' | 'after';

  @IsOptional()
  @IsArray()
  items?: { label: string; ok: boolean }[];

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  citizenSignature?: string;

  @IsOptional()
  @IsString()
  staffSignature?: string;
}

export class RepairStatusDto {
  @IsIn(['accept', 'finish', 'confirm', 'reopen'], {
    message: 'action ต้องเป็น accept, finish, confirm หรือ reopen',
  })
  action!: 'accept' | 'finish' | 'confirm' | 'reopen';

  @IsOptional()
  @IsString()
  resolution?: string;

  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsString()
  pin?: string;

  @IsOptional()
  @IsArray()
  afterPhotos?: string[];
}

export class ReceiveEquipmentDto {
  @IsOptional()
  @IsArray()
  photos?: string[];

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReturnEquipmentDto {
  @IsOptional()
  @IsArray()
  photos?: string[];

  @IsOptional()
  @IsString()
  note?: string;
}

export class InspectReturnDto {
  @IsIn(['normal', 'damaged', 'incomplete'], {
    message: 'ผลการตรวจรับต้องเป็น normal, damaged หรือ incomplete',
  })
  result!: 'normal' | 'damaged' | 'incomplete';

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  photos?: string[];
}

