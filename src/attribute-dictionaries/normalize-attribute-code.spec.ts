import {
  colorDistance,
  normalizeAttributeCode,
  normalizeColorCode,
  normalizeSeasonCode,
  normalizeSizeCode,
} from './normalize-attribute-code';
import {
  SYSTEM_COLORS,
  SYSTEM_SIZES,
  collectionCodes,
  systemValues,
} from './system-values';

describe('normalizeAttributeCode', () => {
  it.each([
    ['XXL', '2XL'],
    ['xxl', '2XL'],
    ['ХХЛ', '2XL'], // Cyrillic
    ['ххл', '2XL'],
    ['2xl', '2XL'],
    ['2хл', '2XL'],
    ['2 XL', '2XL'],
    ['2-XL', '2XL'],
    ['XXXL', '3XL'],
    ['3xl', '3XL'],
    ['ХХХЛ', '3XL'],
    ['XXXXL', '4XL'],
    ['xl', 'XL'],
    ['ХЛ', 'XL'],
    ['М', 'M'], // Cyrillic М
    ['с', 'S'],
    ['XXS', 'XXS'],
    ['42', '42'],
    ['42.0', '42'],
    ['42 ', '42'],
    ['42,5', '42.5'],
    ['42.50', '42.5'],
  ])('size %p → %p', (input, expected) => {
    expect(normalizeSizeCode(input)).toBe(expected);
    expect(normalizeAttributeCode('SIZE', input)).toBe(expected);
  });

  it.each([
    ['#fff', '#FFFFFF'],
    ['fff', '#FFFFFF'],
    ['#FFF', '#FFFFFF'],
    ['#ffffff', '#FFFFFF'],
    [' 1560bd ', '#1560BD'],
    ['#СС0000', '#CC0000'], // Cyrillic С
  ])('colour %p → %p', (input, expected) => {
    expect(normalizeColorCode(input)).toBe(expected);
    expect(normalizeAttributeCode('COLOR', input)).toBe(expected);
  });

  it.each([
    ['summer', 'SUMMER'],
    ['Summer', 'SUMMER'],
    [' demi ', 'DEMI'],
    ['ss26', 'SS26'],
    ['SS 2026', 'SS26'],
    ['fw-27', 'FW27'],
  ])('season %p → %p', (input, expected) => {
    expect(normalizeSeasonCode(input)).toBe(expected);
  });

  it('rejects values that are not codes', () => {
    expect(() => normalizeColorCode('red')).toThrow('#RRGGBB');
    expect(() => normalizeColorCode('#12345')).toThrow('#RRGGBB');
    expect(() => normalizeSizeCode('  ')).toThrow('Укажите код размера');
    expect(() => normalizeSizeCode('Большой')).toThrow('Код размера');
    expect(() => normalizeSeasonCode('Лето')).toThrow('Код сезона');
  });

  it('leaves every system code unchanged', () => {
    for (const value of systemValues(2026)) {
      expect(normalizeAttributeCode(value.type, value.code)).toBe(value.code);
    }
  });

  it('measures colour distance', () => {
    expect(colorDistance('#000000', '#000000')).toBe(0);
    expect(colorDistance('#FFFFFF', '#FEFEFE')).toBeCloseTo(Math.sqrt(3));
  });
});

describe('system values', () => {
  it('has the 50 colours of the TZ with unique HEX codes', () => {
    expect(SYSTEM_COLORS).toHaveLength(50);
    expect(new Set(SYSTEM_COLORS.map(([, hex]) => hex)).size).toBe(50);
  });

  it('has the size ranges of the TZ', () => {
    expect(SYSTEM_SIZES.NUM_BOTTOM).toEqual([
      '30',
      '31',
      '32',
      '33',
      '34',
      '35',
      '36',
      '37',
      '38',
      '39',
      '40',
      '41',
      '42',
    ]);
    expect(SYSTEM_SIZES.NUM_TOP).toEqual(['48', '50', '52', '54', '56', '58']);
    expect(SYSTEM_SIZES.NUM_SHOES[0]).toBe('35');
    expect(SYSTEM_SIZES.NUM_SHOES.at(-1)).toBe('47');
  });

  it('has the collections of the current and next year', () => {
    expect(collectionCodes(2026)).toEqual(['SS26', 'FW26', 'SS27', 'FW27']);
  });
});
