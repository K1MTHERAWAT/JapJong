import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GovSsoCallbackDto {
  @ApiProperty({ required: false, description: 'Authorization code จาก IAM-GOV SSO' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false, description: 'One-time LINE ticket จาก IAM-GOV /auth/line/callback' })
  @IsOptional()
  @IsString()
  ticket?: string;

  @ApiProperty({ required: false, description: 'CSRF state parameter' })
  @IsOptional()
  @IsString()
  state?: string;
}

export class GovSsoPasswordLoginDto {
  @ApiProperty({ description: 'อีเมลบัญชี Gov Center' })
  @IsNotEmpty({ message: 'กรุณาระบุอีเมล Gov Center' })
  @IsString()
  email: string;

  @ApiProperty({ description: 'รหัสผ่านบัญชี Gov Center' })
  @IsNotEmpty({ message: 'กรุณาระบุรหัสผ่าน Gov Center' })
  @IsString()
  password: string;
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

