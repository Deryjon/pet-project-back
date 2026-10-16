import { cleanName, hexKey, nameKey } from './dictionary-names';
import { normalizeSizeCode } from './resolve-size';
import { missingSystemColors } from './store-defaults';

describe('dictionary names', () => {
  it.each([
    ['Тёмно-синий', 'темно синий'],
    [' ТЕМНО-СИНИЙ ', 'темно синий'],
    ['темно  синий', 'темно синий'],
    ['Nike', 'nike'],
    ['Хлопок ', 'хлопок'],
  ])('%p and %p are one name', (left, right) => {
    expect(nameKey(left)).toBe(nameKey(right));
  });

  it('keeps different names apart', () => {
    expect(nameKey('Синий')).not.toBe(nameKey('Тёмно-синий'));
  });

  it('cleans names for storage', () => {
    expect(cleanName('  Nike   Air ')).toBe('Nike Air');
  });

  it.each([
    ['#fff', '#FFFFFF'],
    ['fff', '#FFFFFF'],
    ['#ff0000', '#FF0000'],
    [' #FF0000 ', '#FF0000'],
  ])('reads %p as %p', (value, hex) => {
    expect(hexKey(value)).toBe(hex);
  });

  it('is not a colour', () => {
    expect(hexKey('Красный')).toBeNull();
    expect(hexKey('')).toBeNull();
    expect(hexKey(null)).toBeNull();
  });
});

describe('size codes of the import and the product form', () => {
  it.each([
    ['XXL', '2XL'],
    ['xxl', '2XL'],
    ['ХХЛ', '2XL'],
    ['2xl', '2XL'],
    ['2 XL', '2XL'],
    ['2-XL', '2XL'],
    ['XXXL', '3XL'],
    ['XXXXL', '4XL'],
    ['xl', 'XL'],
    ['ХЛ', 'XL'],
    ['42', '42'],
    ['42.0', '42'],
    ['42 ', '42'],
    ['42,5', '42.5'],
  ])('%p → %p', (value, code) => {
    expect(normalizeSizeCode(value)).toBe(code);
  });
});

describe('system colours for a store', () => {
  it('adds all 50 to an empty store', () => {
    expect(missingSystemColors([]).added).toHaveLength(50);
  });

  it('does not add a colour the store already has', () => {
    const { added, skipped } = missingSystemColors([
      // same name, other HEX
      { id: '1', name: 'Чёрный', nameRu: 'Чёрный', hex: '#111111' },
      // same HEX, other name
      { id: '2', name: 'Снежный', nameRu: null, hex: '#ffffff' },
      // «Графитовый» is «Графит» extended; «Тёмно-серый» #404040 is the same shade
      { id: '3', name: 'Графит', nameRu: 'Графит', hex: '#3A3A3C' },
    ]);
    const names = added.map((color) => color.name);
    expect(names).not.toContain('Чёрный');
    expect(names).not.toContain('Белый');
    expect(names).not.toContain('Графитовый');
    expect(names).not.toContain('Тёмно-серый');
    expect(skipped.map((color) => color.existing)).toEqual(
      expect.arrayContaining(['Чёрный', 'Снежный', 'Графит']),
    );
    expect(added).toHaveLength(46);
  });

  it('adds merely similar colours with a note (seen on a live store)', () => {
    const { added } = missingSystemColors([
      { id: '1', name: 'Серый', nameRu: 'Серый', hex: '#808080' },
      { id: '2', name: 'Бежевый', nameRu: 'Бежевый', hex: '#D8C3A5' },
      { id: '3', name: 'Синий', nameRu: 'Синий', hex: '#1E5BC6' },
    ]);
    const byName = new Map(added.map((color) => [color.name, color]));
    expect(byName.get('Хаки')?.similarTo).toBe('Серый');
    expect(byName.get('Пудровый')?.similarTo).toBe('Бежевый');
    expect(byName.get('Джинсовый')?.similarTo).toBe('Синий');
  });
});
