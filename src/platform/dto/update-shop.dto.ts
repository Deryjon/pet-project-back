import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateShopDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  branch_code?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
