import {
  defaultProductFeatures,
  normalizeProductFeatures,
  parseBusinessType,
} from './product-feature-settings';

describe('company product feature settings', () => {
  it('enables apparel fields for clothing stores but keeps bundles off', () => {
    expect(defaultProductFeatures('clothing_store')).toEqual({
      variants: true,
      color: true,
      size: true,
      season: true,
      collection: true,
      bundles: false,
    });
  });

  it('keeps a general store product form minimal', () => {
    expect(defaultProductFeatures('general_store')).toEqual({
      variants: false,
      color: false,
      size: false,
      season: false,
      collection: false,
      bundles: false,
    });
  });

  it('allows individual feature overrides and rejects an unknown type', () => {
    expect(normalizeProductFeatures('general_store', { season: true }).season).toBe(true);
    expect(() => parseBusinessType('restaurant')).toThrow(
      'business_type must be clothing_store or general_store',
    );
  });
});
