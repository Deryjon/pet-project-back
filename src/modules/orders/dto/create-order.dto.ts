import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @MinLength(1)
  shopId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cashboxId?: string;
}
