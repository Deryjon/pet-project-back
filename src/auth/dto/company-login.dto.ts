import { IsNotEmpty, IsString } from 'class-validator';

export class CompanyLoginDto {
  @IsString()
  @IsNotEmpty()
  company_login!: string;
}
