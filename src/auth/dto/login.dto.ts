import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{7,15}$/)
  phone_number!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
