import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class ChequeBlockPatchDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsInt()
  sequence_number?: number;
}

export class UpdateChequeSettingsDto {
  @IsOptional()
  @IsBoolean()
  has_information_block?: boolean;

  @IsOptional()
  @IsBoolean()
  has_lower_block?: boolean;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(120)
  paper_width?: number;

  @IsOptional()
  @IsInt()
  @Min(6)
  font_size?: number;

  @IsOptional()
  @IsIn(['single', 'double', 'none'])
  divider_style?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  divider_gap?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  section_gap?: number;

  @IsOptional()
  @IsBoolean()
  item_dividers?: boolean;

  @IsOptional()
  @IsBoolean()
  has_logo?: boolean;

  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsString()
  footer_message?: string;

  @IsOptional()
  @IsString()
  footer_note?: string;

  @IsOptional()
  @IsString()
  qr_code_url?: string;

  @IsOptional()
  element_styles?: Array<{
    id: string;
    label?: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    visible: boolean;
    order: number;
    marginBottom?: number;
  }>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChequeBlockPatchDto)
  blocks?: ChequeBlockPatchDto[];
}
