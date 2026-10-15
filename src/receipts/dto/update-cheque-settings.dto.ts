import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
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
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @IsOptional()
  @IsBoolean()
  has_information_block?: boolean;

  @IsOptional()
  @IsBoolean()
  has_lower_block?: boolean;

  @IsOptional()
  @IsInt()
  @Min(20)
  // The editor offers A4 (210 mm).
  @Max(220)
  paper_width?: number;

  // Printer profile of the template (0 = automatic / none).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(220)
  printable_width?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  offset_mm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  feed_mm?: number;

  @IsOptional()
  @IsIn(['browser', 'pdf'])
  print_mode?: string;

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
  // A data: URL logo is resized/compressed on the client to stay well below this.
  @MaxLength(90_000)
  logo_url?: string;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(100)
  logo_width?: number;

  @IsOptional()
  @IsBoolean()
  has_brand_name?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  brand_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand_tagline?: string;

  @IsOptional()
  @IsInt()
  @Min(14)
  @Max(40)
  brand_name_size?: number;

  @IsOptional()
  @IsBoolean()
  has_additional_image?: boolean;

  @IsOptional()
  @IsString()
  additional_image_url?: string;

  @IsOptional()
  @IsString()
  footer_message?: string;

  @IsOptional()
  @IsString()
  footer_note?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
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
