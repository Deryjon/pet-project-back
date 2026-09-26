import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  login!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  subdomain?: string;

  @IsOptional()
  @IsIn(['clothing_store', 'general_store'])
  business_type?: 'clothing_store' | 'general_store';
}
