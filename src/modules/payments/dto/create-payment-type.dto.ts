import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePaymentTypeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isCash?: boolean;
}
