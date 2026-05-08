import { IsNumber, IsString, Min } from 'class-validator';

export class AddOrderItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;
}
