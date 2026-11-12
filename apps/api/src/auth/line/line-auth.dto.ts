import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

/**
 * Data Transfer Object (DTO) สำหรับรับค่า Query Parameters ในขั้นตอน LINE OAuth Callback
 */
export class LineCallbackQueryDto {
  // รหัส Authorization Code ที่ LINE ส่งกลับมาหลังจากผู้ใช้ยืนยันการอนุญาต
  @IsOptional()
  @IsString()
  code?: string;

  // ค่า State String แบบสุ่มเพื่อป้องกันการโจมตีแบบ CSRF
  @IsOptional()
  @IsString()
  state?: string;

  // รหัสข้อผิดพลาดจาก LINE Login (กรณีที่ผู้ใช้กดยกเลิกหรือเกิด Error)
  @IsOptional()
  @IsString()
  error?: string;

  // คำอธิบายข้อผิดพลาดจาก LINE Login
  @IsOptional()
  @IsString()
  error_description?: string;
}

/**
 * Data Transfer Object (DTO) สำหรับตรวจสอบสถานะของ Registration Ticket (การลงทะเบียนครั้งแรกผ่าน LINE)
 */
export class LineRegistrationStatusQueryDto {
  // รหัสตั๋วลงทะเบียนชั่วคราว (Ticket UUID)
  @IsNotEmpty({ message: 'กรุณาระบุ ticket' })
  @IsString()
  ticket!: string;
}

/**
 * Data Transfer Object (DTO) สำหรับรายการความยินยอมตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)
 */
export class ConsentItemDto {
  // ประเภทความยินยอม เช่น TERMS_OF_SERVICE, PRIVACY_POLICY, NOTIFICATION_CONSENT
  @IsNotEmpty({ message: 'กรุณาระบุประเภทความยินยอม' })
  @IsString()
  consentType!: string;

  // หมายเลขเวอร์ชันของเอกสารความยินยอม เช่น "1.0"
  @IsNotEmpty({ message: 'กรุณาระบุเวอร์ชันความยินยอม' })
  @IsString()
  consentVersion!: string;

  // สถานะการยอมรับ (true = ยินยอม, false = ไม่ยินยอม)
  @IsBoolean()
  agreed!: boolean;
}

/**
 * Data Transfer Object (DTO) สำหรับลงทะเบียนผู้ใช้ใหม่ครั้งแรกผ่าน LINE พร้อมความยินยอม PDPA
 */
export class LineRegisterDto {
  // รหัส Ticket ชั่วคราวที่ได้มาจากขั้นตอน LINE Callback
  @IsNotEmpty({ message: 'กรุณาระบุ Registration Ticket' })
  @IsString()
  ticket!: string;

  // ชื่อ-นามสกุลจริงของประชาชนผู้ลงทะเบียน
  @IsNotEmpty({ message: 'กรุณากรอกชื่อ-นามสกุล' })
  @IsString()
  name!: string;

  // เบอร์โทรศัพท์มือถือ 10 หลัก ขึ้นต้นด้วย 06, 08 หรือ 09
  @IsNotEmpty({ message: 'กรุณากรอกเบอร์โทรศัพท์' })
  @Matches(/^0[689]\d{8}$/, {
    message: 'เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 06, 08 หรือ 09 และมีความยาว 10 หลัก',
  })
  phone!: string;

  // รายการบันทึกความยินยอม PDPA (ต้องมีอย่างน้อย 1 รายการ)
  @IsArray()
  @ArrayMinSize(1, { message: 'ต้องมีรายการความยินยอม PDPA อย่างน้อย 1 รายการ' })
  @ValidateNested({ each: true })
  @Type(() => ConsentItemDto)
  consents!: ConsentItemDto[];
}

/**
 * Data Transfer Object (DTO) สำหรับการยืนยันตัวตนผ่าน LINE Front-end Framework (LIFF)
 */
export class LineLiffAuthDto {
  // ID Token ที่ได้รับจาก LIFF SDK บนฝั่ง Client
  @IsNotEmpty({ message: 'กรุณาระบุ idToken' })
  @IsString()
  idToken!: string;
}
