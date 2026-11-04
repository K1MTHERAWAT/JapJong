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

export type RichMenuType = 'CITIZEN' | 'STAFF' | 'ADMIN' | 'DEFAULT' | 'CUSTOM';

export type RichMenuActionType = 'URI' | 'MESSAGE' | 'POSTBACK';

export class RichMenuAreaBoundsDto {
  @IsInt()
  @Min(0)
  x!: number;

  @IsInt()
  @Min(0)
  y!: number;

  @IsInt()
  @Min(1)
  @Max(2500)
  width!: number;

  @IsInt()
  @Min(1)
  @Max(1686)
  height!: number;
}

export class RichMenuActionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  label!: string;

  @IsString()
  @IsIn(['URI', 'MESSAGE', 'POSTBACK'])
  actionType!: RichMenuActionType;

  /**
   * สำหรับ URI action: ลิงก์ URL ปลายทาง (https://... หรือ https://liff.line.me/...)
   * สำหรับ MESSAGE action: ข้อความที่ต้องการส่ง
   * สำหรับ POSTBACK action: ข้อมูลคีย์เวิร์ดที่ส่งกลับไปยัง webhook
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  actionData!: string;

  @ValidateNested()
  @Type(() => RichMenuAreaBoundsDto)
  area!: RichMenuAreaBoundsDto;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateRichMenuDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsIn(['CITIZEN', 'STAFF', 'ADMIN', 'DEFAULT', 'CUSTOM'])
  menuType!: RichMenuType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(14)
  chatBarText!: string;

  @IsOptional()
  @IsInt()
  @IsIn([2500])
  width?: number = 2500;

  @IsOptional()
  @IsInt()
  @IsIn([1686, 843])
  height?: number = 1686;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RichMenuActionDto)
  actions!: RichMenuActionDto[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean = false;
}

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

export class UploadRichMenuImageDto {
  /**
   * รูปภาพในรูปแบบ Base64 string หรือ data URL
   */
  @IsString()
  @IsNotEmpty()
  imageData!: string;

  @IsString()
  @IsIn(['image/jpeg', 'image/png'])
  mimeType!: 'image/jpeg' | 'image/png';
}

export class LinkRichMenuUserDto {
  @IsString()
  @IsNotEmpty()
  lineUserId!: string;

  @IsString()
  @IsNotEmpty()
  richMenuId!: string;
}

export class UnlinkRichMenuUserDto {
  @IsString()
  @IsNotEmpty()
  lineUserId!: string;
}

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

