import { IsNumber } from 'class-validator';

export class UpdateOrderItemDto {
  @IsNumber()
  quantity!: number;
}
