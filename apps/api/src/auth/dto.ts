import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Min } from 'class-validator';

/**
 * Data Transfer Object (DTO) สำหรับการเข้าสู่ระบบแบบปกติ (Username & Password)
 */
export class LoginDto {
  // บัญชีชื่อผู้ใช้งาน (ห้ามว่าง)
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกชื่อผู้ใช้' })
  username!: string;

  // รหัสผ่านเข้าใช้งานระบบ (ห้ามว่าง)
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกรหัสผ่าน' })
  password!: string;
}

/**
 * Data Transfer Object (DTO) สำหรับการเข้าสู่ระบบในโหมดคลิกเดียว (Demo / Testing)
 */
export class DemoLoginDto {
  // รหัสบัญชีผู้ใช้ที่ต้องการสลับบทบาทเข้าไปใช้งาน (ห้ามว่าง)
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุ accountId' })
  accountId!: string;
}

/**
 * Data Transfer Object (DTO) สำหรับขอรหัส OTP ยืนยันเบอร์โทรศัพท์
 */
export class RequestOtpDto {
  // เบอร์โทรศัพท์มือถือที่ต้องการส่งรหัส OTP (ห้ามว่าง)
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุเบอร์โทรศัพท์' })
  phone!: string;
}

/**
 * Data Transfer Object (DTO) สำหรับการลงทะเบียนผู้ใช้งานใหม่
 */
export class RegisterDto {
  // ชื่อผู้ใช้งาน (ทางเลือก: หากไม่กรอก ระบบจะใช้เบอร์โทรศัพท์หรือ auto-generate ให้)
  @IsOptional()
  @IsString()
  username?: string;

  // รหัสผ่านสำหรับการเข้าใช้งานระบบ (ห้ามว่าง)
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกรหัสผ่าน' })
  password!: string;

  // ชื่อ-นามสกุลจริงของผู้ลงทะเบียน (ห้ามว่าง)
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกชื่อ-นามสกุล' })
  name!: string;

  // เบอร์โทรศัพท์ติดต่อ (ทางเลือก)
  @IsOptional()
  @IsString()
  phone?: string;

  // อีเมลสำหรับการติดต่อและรับการแจ้งเตือน (ทางเลือก)
  @IsOptional()
  @IsString()
  email?: string;

  // กอง / สำนัก / ฝ่ายงาน (กรณีเป็นเจ้าหน้าที่หรือหน่วยงาน)
  @IsOptional()
  @IsString()
  department?: string;

  // ตำแหน่งหน้าที่งาน (ทางเลือก)
  @IsOptional()
  @IsString()
  position?: string;

  // ชื่อบัญชี LINE หรือชื่อแสดงใน LINE (ทางเลือก)
  @IsOptional()
  @IsString()
  lineName?: string;

  // รหัส OTP ที่ใช้ยืนยันความถูกต้องของเบอร์โทรศัพท์ (ทางเลือก)
  @IsOptional()
  @IsString()
  otp?: string;
}

/**
 * Data Transfer Object (DTO) สำหรับการตั้งค่าหรือเปลี่ยนรหัส PIN 6 หลัก
 */
export class SetPinDto {
  // รหัส PIN ใหม่ 6 หลัก
  @IsString()
  @Length(6, 6, { message: 'รหัส PIN ต้องมี 6 หลัก' })
  pin!: string;

  // รหัส PIN เดิม (จำเป็นต้องระบุหากเคยตั้งค่า PIN ไว้แล้ว)
  @IsOptional()
  @IsString()
  oldPin?: string;
}

/**
 * Data Transfer Object (DTO) สำหรับการยืนยันรหัส PIN 6 หลักเพื่อทำธุรกรรม
 */
export class VerifyPinDto {
  // รหัส PIN 6 หลักที่ผู้ใช้กรอกเข้ามา
  @IsString()
  @Length(6, 6, { message: 'รหัส PIN ต้องมี 6 หลัก' })
  pin!: string;
}

/**
 * Data Transfer Object (DTO) สำหรับการบันทึกภาพลายมือชื่อดิจิทัล
 */
export class SetSignatureDto {
  // สตริงภาพลายเซ็น (Data URL PNG หรือ SVG ที่วาดจาก Canvas)
  @IsString()
  @IsNotEmpty({ message: 'กรุณาส่งภาพลายมือชื่อ' })
  signature!: string;
}

/**
 * Data Transfer Object (DTO) สำหรับการอัปเดตข้อมูลโปรไฟล์ผู้ใช้งาน
 */
export class UpdateProfileDto {
  // ชื่อ-นามสกุล
  @IsOptional()
  @IsString()
  name?: string;

  // ชื่อเล่น / ชื่อเรียกทั่วไป
  @IsOptional()
  @IsString()
  nickname?: string;

  // ตำแหน่งงาน
  @IsOptional()
  @IsString()
  position?: string;

  // สำนัก / กอง / แผนก
  @IsOptional()
  @IsString()
  department?: string;

  // หมายเลขโทรศัพท์
  @IsOptional()
  @IsString()
  phone?: string;

  // ชื่อแสดงบน LINE
  @IsOptional()
  @IsString()
  lineName?: string;

  // บ้านเลขที่
  @IsOptional()
  @IsString()
  addressHouseNo?: string;

  // หมู่ที่
  @IsOptional()
  @IsString()
  addressMoo?: string;

  // ตำบล / แขวง
  @IsOptional()
  @IsString()
  addressSubdistrict?: string;

  // อำเภอ / เขต
  @IsOptional()
  @IsString()
  addressDistrict?: string;

  // จังหวัด
  @IsOptional()
  @IsString()
  addressProvince?: string;

  // รหัสตำบล (ID)
  @IsOptional()
  @IsString()
  addressSubdistrictId?: string;

  // รหัสอำเภอ (ID)
  @IsOptional()
  @IsString()
  addressDistrictId?: string;

  // รหัสจังหวัด (ID)
  @IsOptional()
  @IsString()
  addressProvinceId?: string;

  // อีเมล
  @IsOptional()
  @IsString()
  email?: string;
}

/**
 * Data Transfer Object (DTO) สำหรับการเปลี่ยนรหัสผ่านผู้ใช้งาน
 */
export class ChangePasswordDto {
  // รหัสผ่านเดิมที่ใช้งานอยู่ในปัจจุบัน (ห้ามว่าง)
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกรหัสผ่านปัจจุบัน' })
  currentPassword!: string;

  // รหัสผ่านใหม่ที่ต้องการตั้งค่า (ห้ามว่าง)
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกรหัสผ่านใหม่' })
  newPassword!: string;
}

/**
 * Data Transfer Object (DTO) สำหรับขอรหัส OTP ทางอีเมลเพื่อยืนยันการลงนามเอกสาร
 */
export class RequestSignOtpDto {
  // อีเมลทางเลือกที่ต้องการให้ส่ง OTP ไปให้ (หากไม่ระบุจะใช้อีเมลในโปรไฟล์)
  @IsOptional()
  @IsString()
  email?: string;
}

/**
 * Data Transfer Object (DTO) สำหรับยืนยันรหัส OTP ในการลงนามเอกสาร
 */
export class VerifySignOtpDto {
  // รหัส OTP 6 หลักที่ได้รับทางอีเมล
  @IsString()
  @Length(6, 6, { message: 'รหัส OTP ต้องมี 6 หลัก' })
  otp!: string;
}
