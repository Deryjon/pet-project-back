import { Prisma } from '@prisma/client';

// Tenant attributes of a variant (Цвет, Размер, Материал…). Colour/size are
// mirrored into these tables by DB triggers, so the attribute list is the one
// source for labels; the legacy color/size relations are only a fallback for
// rows read without the attribute include.

export const VARIANT_ATTRIBUTES_INCLUDE = {
  attributeOptions: {
    include: { definition: true, option: true },
  },
} satisfies Prisma.ProductVariantInclude;

type AttributeValueRow = {
  valueText: string | null;
  definition: {
    id: string;
    code: string;
    name: string;
    sortOrder: number;
    isVariantAxis: boolean;
  };
  option: { id: string; value: string; meta?: Prisma.JsonValue } | null;
};

export type VariantWithAttributes = {
  attributeOptions?: AttributeValueRow[] | null;
  color?: { name: string } | null;
  size?: { name: string } | null;
};

export type VariantAttribute = {
  code: string;
  name: string;
  value: string;
  option_id: string | null;
  definition_id: string;
};

export function variantAttributes(
  variant: VariantWithAttributes | null | undefined,
): VariantAttribute[] {
  const rows = variant?.attributeOptions ?? [];
  if (rows.length) {
    return [...rows]
      .filter((row) => row.definition.isVariantAxis)
      .sort(
        (a, b) =>
          a.definition.sortOrder - b.definition.sortOrder ||
          a.definition.code.localeCompare(b.definition.code),
      )
      .map((row) => ({
        code: row.definition.code,
        name: row.definition.name,
        value: row.option?.value ?? row.valueText ?? '',
        option_id: row.option?.id ?? null,
        definition_id: row.definition.id,
      }))
      .filter((attribute) => attribute.value);
  }
  return [
    ...(variant?.color?.name
      ? [
          {
            code: 'color',
            name: 'Цвет',
            value: variant.color.name,
            option_id: null,
            definition_id: '',
          },
        ]
      : []),
    ...(variant?.size?.name
      ? [
          {
            code: 'size',
            name: 'Размер',
            value: variant.size.name,
            option_id: null,
            definition_id: '',
          },
        ]
      : []),
  ];
}

// "Red / M" — the variant part of a product name.
export function variantLabel(
  variant: VariantWithAttributes | null | undefined,
): string {
  return variantAttributes(variant)
    .map((attribute) => attribute.value)
    .join(' / ');
}

// "Shirt — Red / M", or the product name alone for simple goods.
export function variantDisplayName(
  productName: string,
  variant: VariantWithAttributes | null | undefined,
): string {
  const label = variantLabel(variant);
  return label ? `${productName} — ${label}` : productName;
}
