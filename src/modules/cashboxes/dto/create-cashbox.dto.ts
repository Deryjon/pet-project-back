import { IsString, MinLength } from 'class-validator';

export class CreateCashboxDto {
  @IsString()
  @MinLength(1)
  shopId!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}
