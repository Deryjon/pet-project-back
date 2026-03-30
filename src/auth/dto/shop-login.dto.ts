import { IsNotEmpty, IsString } from 'class-validator';

export class ShopLoginDto {
  @IsString()
  @IsNotEmpty()
  shop_login!: string;
}
