import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GovSsoCallbackDto {
  @ApiProperty({ description: 'Authorization code จาก IAM-GOV SSO' })
  @IsNotEmpty({ message: 'กรุณาระบุ authorization code' })
  @IsString()
  code: string;
}

export class GovSsoExchangeDto {
  @ApiProperty({ description: 'Session token จาก IAM-GOV SSO' })
  @IsNotEmpty({ message: 'กรุณาระบุ session token' })
  @IsString()
  sessionToken: string;
}

export class SearchResidenceDto {
  @ApiProperty({ required: false, description: 'คำค้นหา เช่น บ้านเลขที่, ถนน' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({ required: false, description: 'รหัสเทศบาล/อบต.' })
  @IsOptional()
  @IsString()
  municipalityId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  provinceId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  districtId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subdistrictId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lat?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lng?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  radiusMeters?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  limit?: string;
}

