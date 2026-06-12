import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  company_login!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{7,15}$/)
  phone_number!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
