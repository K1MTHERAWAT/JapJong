import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ประเภทกลุ่มเป้าหมายของ Rich Menu (ประชาชน, เจ้าหน้าที่, แอดมิน, ทั่วไป, กำหนดเอง)
export type RichMenuType = 'CITIZEN' | 'STAFF' | 'ADMIN' | 'DEFAULT' | 'CUSTOM';

// ชนิดของการกระทำเมื่อแตะปุ่มบน Rich Menu
export type RichMenuActionType = 'URI' | 'MESSAGE' | 'POSTBACK';

/**
 * Data Transfer Object (DTO) กำหนดพิกัดและขนาดของปุ่มบน Rich Menu
 */
export class RichMenuAreaBoundsDto {
  // พิกัดแกนนอน X
  @IsInt()
  @Min(0)
  x!: number;

  // พิกัดแกนตั้ง Y
  @IsInt()
  @Min(0)
  y!: number;

  // ความกว้างของปุ่ม (พิกเซล)
  @IsInt()
  @Min(1)
  @Max(2500)
  width!: number;

  // ความสูงของปุ่ม (พิกเซล)
  @IsInt()
  @Min(1)
  @Max(1686)
  height!: number;
}

/**
 * Data Transfer Object (DTO) กำหนดรายละเอียดการกระทำของแต่ละปุ่ม
 */
export class RichMenuActionDto {
  // ป้ายกำกับชื่อปุ่ม
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  label!: string;

  // ชนิดของการทำงาน (เปิดเว็บ URI, ส่งข้อความ MESSAGE, หรือส่งข้อมูล POSTBACK)
  @IsString()
  @IsIn(['URI', 'MESSAGE', 'POSTBACK'])
  actionType!: RichMenuActionType;

  /**
   * ข้อมูลสำหรับการทำงาน:
   * - URI: ลิงก์ปลายทาง (https://... หรือ https://liff.line.me/...)
   * - MESSAGE: ข้อความที่จะให้ผู้ใช้พิมพ์ส่งกลับมา
   * - POSTBACK: ข้อความคีย์เวิร์ดส่งกลับมายัง Webhook
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  actionData!: string;

  // พิกัดพื้นที่บนภาพเมนู
  @ValidateNested()
  @Type(() => RichMenuAreaBoundsDto)
  area!: RichMenuAreaBoundsDto;

  // ลำดับการแสดงผล
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

/**
 * Data Transfer Object (DTO) สำหรับสร้าง Rich Menu ใหม่
 */
export class CreateRichMenuDto {
  // ชื่อเมนูสำหรับอ้างอิงในระบบ
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  // ประเภทบทบาทผู้ใช้งานที่เมนูนี้รองรับ
  @IsString()
  @IsIn(['CITIZEN', 'STAFF', 'ADMIN', 'DEFAULT', 'CUSTOM'])
  menuType!: RichMenuType;

  // ข้อความที่แสดงบนแถบเปิด-ปิดเมนูด้านล่างห้องแชท (สูงสุด 14 ตัวอักษร)
  @IsString()
  @IsNotEmpty()
  @MaxLength(14)
  chatBarText!: string;

  // ความกว้างมาตรฐาน (2500 พิกเซล)
  @IsOptional()
  @IsInt()
  @IsIn([2500])
  width?: number = 2500;

  // ความสูงมาตรฐาน (1686 พิกเซลสำหรับขนาดเต็ม หรือ 843 พิกเซลสำหรับขนาดกะทัดรัด)
  @IsOptional()
  @IsInt()
  @IsIn([1686, 843])
  height?: number = 1686;

  // รายการปุ่มกดและการทำงานบนเมนู
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RichMenuActionDto)
  actions!: RichMenuActionDto[];

  // ตั้งเป็นเมนูเริ่มต้นของ Official Account หรือไม่
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean = false;
}

/**
 * Data Transfer Object (DTO) สำหรับอัปเดตข้อมูล Rich Menu
 */
export class UpdateRichMenuDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['CITIZEN', 'STAFF', 'ADMIN', 'DEFAULT', 'CUSTOM'])
  menuType?: RichMenuType;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  chatBarText?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RichMenuActionDto)
  actions?: RichMenuActionDto[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/**
 * Data Transfer Object (DTO) สำหรับอัปโหลดภาพกราฟิกประกอบ Rich Menu
 */
export class UploadRichMenuImageDto {
  // ข้อมูลรูปภาพในรูปแบบ Base64 หรือ Data URL
  @IsString()
  @IsNotEmpty()
  imageData!: string;

  // ประเภท MIME Type ของภาพ (ต้องเป็น JPEG หรือ PNG เท่านั้น)
  @IsString()
  @IsIn(['image/jpeg', 'image/png'])
  mimeType!: 'image/jpeg' | 'image/png';
}

/**
 * Data Transfer Object (DTO) สำหรับผูก Rich Menu เฉพาะบุคคลตาม LINE User ID
 */
export class LinkRichMenuUserDto {
  @IsString()
  @IsNotEmpty()
  lineUserId!: string;

  @IsString()
  @IsNotEmpty()
  richMenuId!: string;
}

/**
 * Data Transfer Object (DTO) สำหรับยกเลิกการผูก Rich Menu เฉพาะบุคคล
 */
export class UnlinkRichMenuUserDto {
  @IsString()
  @IsNotEmpty()
  lineUserId!: string;
}

/**
 * Data Transfer Object (DTO) สำหรับสร้างหรืออัปเดตแม่แบบ Flex Message
 */
export class FlexTemplateUpsertDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @IsOptional()
  @IsIn(['FLEX', 'TEXT'])
  templateType?: 'FLEX' | 'TEXT' = 'FLEX';

  @IsObject()
  content!: Record<string, any>;

  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED' = 'ACTIVE';
}
