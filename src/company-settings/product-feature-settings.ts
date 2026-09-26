import { BadRequestException } from '@nestjs/common';

export const BUSINESS_TYPES = ['clothing_store', 'general_store'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export type ProductFeatureSettings = {
  variants: boolean;
  color: boolean;
  size: boolean;
  season: boolean;
  collection: boolean;
  bundles: boolean;
};

export function defaultProductFeatures(type: BusinessType): ProductFeatureSettings {
  const clothing = type === 'clothing_store';
  return {
    variants: clothing,
    color: clothing,
    size: clothing,
    season: clothing,
    collection: clothing,
    bundles: false,
  };
}

export function parseBusinessType(value: unknown): BusinessType {
  if (typeof value === 'string' && BUSINESS_TYPES.includes(value as BusinessType)) {
    return value as BusinessType;
  }
  throw new BadRequestException('business_type must be clothing_store or general_store');
}

export function normalizeProductFeatures(
  type: BusinessType,
  value: unknown,
): ProductFeatureSettings {
  const defaults = defaultProductFeatures(type);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      typeof input[key] === 'boolean' ? input[key] : fallback,
    ]),
  ) as ProductFeatureSettings;
}
