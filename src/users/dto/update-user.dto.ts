import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/)
  phone_number?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;

  @IsOptional()
  @IsString()
  user_type?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  crm_role_id?: string;

  @IsOptional()
  @IsString()
  company_id?: string;

  @IsOptional()
  @IsString()
  branch_location?: string;

  @IsOptional()
  @IsString()
  current_shop_id?: string;

  @IsOptional()
  @IsBoolean()
  can_switch_shops?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  allowed_shop_ids?: string[];

  @IsOptional()
  @IsString()
  birth_date?: string;
}
