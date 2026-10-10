import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  login?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subdomain?: string;

  @IsOptional()
  @IsIn(['ACCESSORIES', 'CLOTHING', 'SHOES', 'CLOTHING_SHOES'])
  store_type?: 'ACCESSORIES' | 'CLOTHING' | 'SHOES' | 'CLOTHING_SHOES';

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
