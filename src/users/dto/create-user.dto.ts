import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  first_name!: string;

  @IsString()
  @IsNotEmpty()
  last_name!: string;

  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/)
  phone_number!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsString()
  user_type?: string;

  @IsOptional()
  @IsString()
  role?: string;

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
  @IsArray()
  allowed_shop_ids?: string[];

  @IsOptional()
  @IsString()
  birth_date?: string;
}
