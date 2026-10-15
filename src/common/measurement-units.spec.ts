import {
  PIECE_UNIT,
  canonicalUnit,
  normalizeUnit,
  resolveCompanyUnit,
  sameUnit,
  unitStoredSpellings,
} from './measurement-units';

describe('measurement units', () => {
  it.each([
    'шт',
    'ШТ',
    'Шт',
    'шт.',
    ' шт. ',
    'штука',
    'Штука',
    'ШТУКА',
    'штуки',
    'штук',
    'ед.',
    'pcs',
    'PCS',
    'pc',
    'piece',
    'unit',
    'countable',
    'dona',
  ])('reads %p as шт', (value) => {
    expect(canonicalUnit(value)).toBe(PIECE_UNIT);
    expect(normalizeUnit(value)).toBe(PIECE_UNIT);
  });

  it.each([
    ['Килограмм', 'кг'],
    ['KG', 'кг'],
    ['гр.', 'г'],
    ['Литр', 'л'],
    ['пар', 'пара'],
  ])('reads %p as %p', (value, unit) => {
    expect(normalizeUnit(value)).toBe(unit);
  });

  it('keeps unknown units as typed and empty as null', () => {
    expect(canonicalUnit('рулон')).toBeNull();
    expect(normalizeUnit(' рулон ')).toBe('рулон');
    expect(normalizeUnit('')).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
  });

  it('compares spellings of one unit as equal', () => {
    expect(sameUnit('штука', 'шт')).toBe(true);
    expect(sameUnit('Шт.', 'pcs')).toBe(true);
    expect(sameUnit('шт', 'кг')).toBe(false);
    expect(sameUnit('Рулон', 'рулон')).toBe(true);
  });

  it('finds every stored spelling of шт for the filter', () => {
    const spellings = unitStoredSpellings('Штука');
    expect(spellings).toEqual(
      expect.arrayContaining(['шт', 'шт.', 'штука', 'pcs']),
    );
  });

  describe('import against company units', () => {
    const units = [
      { name: 'Штука', shortName: 'шт' },
      { name: 'Килограмм', shortName: 'кг' },
      { name: 'Рулон', shortName: 'рулон' },
    ];

    it('maps spellings to the company short name', () => {
      expect(resolveCompanyUnit('Штука', units)).toBe('шт');
      expect(resolveCompanyUnit('kg', units)).toBe('кг');
      expect(resolveCompanyUnit('РУЛОН', units)).toBe('рулон');
    });

    it('treats an empty cell as шт', () => {
      expect(resolveCompanyUnit('', units)).toBe(PIECE_UNIT);
      expect(resolveCompanyUnit(undefined, [])).toBe(PIECE_UNIT);
    });

    it('rejects units the company does not have', () => {
      expect(resolveCompanyUnit('литр', units)).toBeNull();
      expect(resolveCompanyUnit('коробка', units)).toBeNull();
    });

    it('accepts шт even before the company units are seeded', () => {
      expect(resolveCompanyUnit('штука', [])).toBe(PIECE_UNIT);
    });
  });
});
