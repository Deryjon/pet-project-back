import {
  defaultProductFeatures,
  normalizeProductFeatures,
  parseBusinessType,
} from './product-feature-settings';

describe('company product feature settings', () => {
  it('enables apparel fields for clothing stores but keeps bundles and device shorthand off', () => {
    expect(defaultProductFeatures('clothing_store')).toEqual({
      variants: true,
      color: true,
      size: true,
      season: true,
      collection: true,
      bundles: false,
      deviceShorthand: false,
    });
  });

  it('gives accessories stores colour variants and device shorthand', () => {
    expect(defaultProductFeatures('accessories_store')).toMatchObject({
      variants: true,
      color: true,
      size: false,
      deviceShorthand: true,
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
      deviceShorthand: false,
    });
  });

  it('keeps device shorthand for companies saved before the flag existed', () => {
    expect(
      normalizeProductFeatures('clothing_store', { variants: true }).deviceShorthand,
    ).toBe(true);
    expect(
      normalizeProductFeatures('clothing_store', { deviceShorthand: false })
        .deviceShorthand,
    ).toBe(false);
  });

  it('allows individual feature overrides and rejects an unknown type', () => {
    expect(normalizeProductFeatures('general_store', { season: true }).season).toBe(true);
    expect(() => parseBusinessType('restaurant')).toThrow(
      'business_type must be one of clothing_store, accessories_store, general_store',
    );
  });
});
