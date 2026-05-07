import { IsNumber, Min } from 'class-validator';

export class ApplyDiscountDto {
  @IsNumber()
  @Min(0)
  discountAmount!: number;
}
