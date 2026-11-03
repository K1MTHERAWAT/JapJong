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

export class LineCallbackQueryDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  error_description?: string;
}

export class LineRegistrationStatusQueryDto {
  @IsNotEmpty({ message: 'กรุณาระบุ ticket' })
  @IsString()
  ticket!: string;
}

export class ConsentItemDto {
  @IsNotEmpty({ message: 'กรุณาระบุประเภทความยินยอม' })
  @IsString()
  consentType!: string;

  @IsNotEmpty({ message: 'กรุณาระบุเวอร์ชันความยินยอม' })
  @IsString()
  consentVersion!: string;

  @IsBoolean()
  agreed!: boolean;
}

export class LineRegisterDto {
  @IsNotEmpty({ message: 'กรุณาระบุ Registration Ticket' })
  @IsString()
  ticket!: string;

  @IsNotEmpty({ message: 'กรุณากรอกชื่อ-นามสกุล' })
  @IsString()
  name!: string;

  @IsNotEmpty({ message: 'กรุณากรอกเบอร์โทรศัพท์' })
  @Matches(/^0[689]\d{8}$/, {
    message: 'เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 06, 08 หรือ 09 และมีความยาว 10 หลัก',
  })
  phone!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'ต้องมีรายการความยินยอม PDPA อย่างน้อย 1 รายการ' })
  @ValidateNested({ each: true })
  @Type(() => ConsentItemDto)
  consents!: ConsentItemDto[];
}
