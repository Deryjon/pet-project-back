import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCompanyRoleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;
}
