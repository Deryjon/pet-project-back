import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateReceiptSettingsDto {
  @IsOptional()
  @IsBoolean()
  show_client_info?: boolean;

  @IsOptional()
  @IsBoolean()
  show_manager_name?: boolean;

  @IsOptional()
  @IsBoolean()
  show_manager_phone?: boolean;

  @IsOptional()
  @IsBoolean()
  show_cashback?: boolean;

  @IsOptional()
  @IsBoolean()
  show_debt_line?: boolean;

  @IsOptional()
  @IsBoolean()
  show_qr_code?: boolean;

  @IsOptional()
  @IsBoolean()
  show_item_index?: boolean;

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
  @IsString()
  footer_message?: string;

  @IsOptional()
  @IsString()
  footer_note?: string;

  @IsOptional()
  @IsBoolean()
  has_logo?: boolean;

  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsBoolean()
  has_bar_code?: boolean;

  @IsOptional()
  @IsString()
  branch_name?: string;

  @IsOptional()
  @IsBoolean()
  has_branch_name?: boolean;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  has_address?: boolean;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  has_phone?: boolean;

  @IsOptional()
  @IsString()
  working_hours?: string;

  @IsOptional()
  @IsBoolean()
  has_working_hours?: boolean;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsBoolean()
  has_website?: boolean;

  @IsOptional()
  @IsString()
  tax_id?: string;

  @IsOptional()
  @IsBoolean()
  has_tax_id?: boolean;

  @IsOptional()
  @IsString()
  qr_code_url?: string;

  @IsOptional()
  @IsBoolean()
  has_customer_debt?: boolean;

  @IsOptional()
  @IsBoolean()
  has_customer_balance?: boolean;

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
}
