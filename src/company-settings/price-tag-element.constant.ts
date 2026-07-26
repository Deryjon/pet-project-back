// Mirrors Billz's /api/v1/price-tag element shape (properties[]): a free-form
// list of absolutely-positioned, independently-styled elements on a label.
// Unlike the cheque block catalog, this is NOT a fixed universal list every
// template must have a toggle for — each price tag template has its own
// elements, added/removed/repositioned freely in the designer. This module
// only supplies the wire-shape contract + sensible starting elements for a
// freshly created template.
export type PriceTagElementType = 'text' | 'barcode';
export type PriceTagAlignment = 'LEFT' | 'CENTER' | 'RIGHT';

// Semantic data source for a 'text' element, or 'barcode' for the barcode
// element itself. "product_name" matches Billz's own wire value verbatim.
export type PriceTagElementName =
  | 'product_name'
  | 'price'
  | 'sku'
  | 'shop_name'
  | 'discount'
  | 'barcode';

export interface PriceTagElement {
  id: string;
  name: PriceTagElementName;
  type: PriceTagElementType;
  isActive: boolean;
  fontFamily: string;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  isUnderlined: boolean;
  isLineThrough: boolean;
  alignmentType: PriceTagAlignment;
  width: number; // mm
  length: number; // mm
  xAxis: number; // mm
  yAxis: number; // mm
  rotation: number; // degrees
}

export const DEFAULT_PRICE_TAG_ELEMENTS: PriceTagElement[] = [
  { id: 'product_name', name: 'product_name', type: 'text', isActive: true, fontFamily: 'Arial', fontSize: 8, isBold: true, isItalic: false, isUnderlined: false, isLineThrough: false, alignmentType: 'LEFT', width: 36, length: 6, xAxis: 2, yAxis: 2, rotation: 0 },
  { id: 'price', name: 'price', type: 'text', isActive: true, fontFamily: 'Arial', fontSize: 14, isBold: true, isItalic: false, isUnderlined: false, isLineThrough: false, alignmentType: 'LEFT', width: 30, length: 6, xAxis: 2, yAxis: 10, rotation: 0 },
  { id: 'barcode', name: 'barcode', type: 'barcode', isActive: true, fontFamily: '', fontSize: 6, isBold: false, isItalic: false, isUnderlined: false, isLineThrough: false, alignmentType: 'LEFT', width: 36, length: 10, xAxis: 2, yAxis: 22, rotation: 0 },
  { id: 'sku', name: 'sku', type: 'text', isActive: true, fontFamily: 'Arial', fontSize: 6, isBold: false, isItalic: false, isUnderlined: false, isLineThrough: false, alignmentType: 'LEFT', width: 36, length: 4, xAxis: 2, yAxis: 36, rotation: 0 },
  { id: 'shop_name', name: 'shop_name', type: 'text', isActive: false, fontFamily: 'Arial', fontSize: 6, isBold: false, isItalic: false, isUnderlined: false, isLineThrough: false, alignmentType: 'LEFT', width: 36, length: 4, xAxis: 2, yAxis: 42, rotation: 0 },
  { id: 'discount', name: 'discount', type: 'text', isActive: false, fontFamily: 'Arial', fontSize: 7, isBold: true, isItalic: false, isUnderlined: false, isLineThrough: false, alignmentType: 'LEFT', width: 30, length: 5, xAxis: 2, yAxis: 48, rotation: 0 },
];

export interface BarcodeTypeOption {
  id: string;
  code: string;
}

export const BARCODE_TYPES: BarcodeTypeOption[] = [
  { id: 'db83218c-a8d0-41fe-b981-c38d280321be', code: 'CODE128' },
  { id: '5517af95-ea38-444e-bf19-90fe4e9e4df7', code: 'EAN13' },
  { id: '2e39b13d-3b7b-4c2f-93b5-140533df0a1e', code: 'EAN8' },
];

export function barcodeTypeIdFor(code: string): string {
  return BARCODE_TYPES.find((b) => b.code === code)?.id ?? BARCODE_TYPES[0].id;
}

function toWireElement(el: PriceTagElement) {
  return {
    id: el.id,
    name: el.name,
    type: el.type,
    is_active: el.isActive,
    font_family: el.fontFamily,
    font_size: el.fontSize,
    is_bold: el.isBold,
    is_italic: el.isItalic,
    is_underlined: el.isUnderlined,
    is_line_through: el.isLineThrough,
    alignment_type: el.alignmentType,
    width: el.width,
    length: el.length,
    x_axis: el.xAxis,
    y_axis: el.yAxis,
    rotation: el.rotation,
  };
}

export function defaultPriceTagProperties() {
  return { elements: DEFAULT_PRICE_TAG_ELEMENTS.map(toWireElement) };
}
