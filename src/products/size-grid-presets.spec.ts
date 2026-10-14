import { DEFAULT_PRODUCT_COLORS, presetSizeCode } from './size-grid-presets';

describe('Preset dictionaries', () => {
  it('gives every preset size its own valid code', () => {
    expect(presetSizeCode('CLOTHING', 'XL')).toBe('XL');
    expect(presetSizeCode('SHOES', '42')).toBe('S42');
    expect(presetSizeCode('CLOTHING', '42')).toBe('42');
  });

  it('stores the palette colour as hex, not as the code', () => {
    for (const color of DEFAULT_PRODUCT_COLORS) {
      expect(color.code).toMatch(/^[A-Z0-9.]{1,20}$/);
      expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(new Set(DEFAULT_PRODUCT_COLORS.map((color) => color.code)).size).toBe(DEFAULT_PRODUCT_COLORS.length);
  });
});
