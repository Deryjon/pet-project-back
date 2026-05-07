import { IsNumber, IsString, Min } from 'class-validator';

export class AddPaymentDto {
  @IsString()
  paymentTypeId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}
