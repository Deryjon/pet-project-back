import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

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
  @IsIn(['clothing_store', 'accessories_store', 'general_store'])
  business_type?: 'clothing_store' | 'accessories_store' | 'general_store';

  @IsOptional()
  @IsIn(['ACCESSORIES', 'CLOTHING', 'SHOES', 'CLOTHING_SHOES'])
  store_type?: 'ACCESSORIES' | 'CLOTHING' | 'SHOES' | 'CLOTHING_SHOES';

  @IsOptional()
  @IsString()
  owner_name?: string;

  @IsOptional()
  @IsString()
  owner_phone?: string;

  @IsOptional()
  @IsEmail()
  owner_email?: string;

  @IsOptional()
  @IsString()
  plan_id?: string;

  @IsOptional()
  @IsDateString()
  subscription_start_date?: string;

  @IsOptional()
  @IsDateString()
  subscription_end_date?: string;
}
