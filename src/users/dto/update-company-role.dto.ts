import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateCompanyRoleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
