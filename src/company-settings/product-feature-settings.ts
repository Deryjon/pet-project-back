import { BadRequestException } from '@nestjs/common';

export const BUSINESS_TYPES = [
  'clothing_store',
  'accessories_store',
  'general_store',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export type ProductFeatureSettings = {
  variants: boolean;
  color: boolean;
  size: boolean;
  season: boolean;
  collection: boolean;
  bundles: boolean;
  // Invoice import reads electronics shorthand ("15pm" = iPhone 15 Pro Max).
  deviceShorthand: boolean;
};

export function defaultProductFeatures(type: BusinessType): ProductFeatureSettings {
  const clothing = type === 'clothing_store';
  const accessories = type === 'accessories_store';
  return {
    variants: clothing || accessories,
    color: clothing || accessories,
    size: clothing,
    season: clothing,
    collection: clothing,
    bundles: false,
    deviceShorthand: accessories,
  };
}

export function parseBusinessType(value: unknown): BusinessType {
  if (typeof value === 'string' && BUSINESS_TYPES.includes(value as BusinessType)) {
    return value as BusinessType;
  }
  throw new BadRequestException(
    `business_type must be one of ${BUSINESS_TYPES.join(', ')}`,
  );
}

export function normalizeProductFeatures(
  type: BusinessType,
  value: unknown,
): ProductFeatureSettings {
  const defaults = defaultProductFeatures(type);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const input = value as Record<string, unknown>;
  const features = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      typeof input[key] === 'boolean' ? input[key] : fallback,
    ]),
  ) as ProductFeatureSettings;
  // Companies saved before the flag existed keep the shorthand they had.
  if (typeof input.deviceShorthand !== 'boolean') features.deviceShorthand = true;
  return features;
}
