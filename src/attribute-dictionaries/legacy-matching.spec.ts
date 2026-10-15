import {
  DictionaryEntry,
  matchCollection,
  matchLegacyColor,
  matchLegacySeason,
  matchLegacySize,
} from './legacy-matching';
import { systemValues } from './system-values';

const dictionary: DictionaryEntry[] = systemValues(2026).map(
  (value, index) => ({
    id: `v${index}`,
    code: value.code,
    name: value.name,
    group: value.group,
    companyId: null,
  }),
);
const colors = dictionary.filter(
  (entry) => !entry.group && entry.code.startsWith('#'),
);
const sizes = dictionary.filter(
  (entry) =>
    entry.group?.startsWith('LETTER') || entry.group?.startsWith('NUM'),
);
const seasons = dictionary.filter(
  (entry) => entry.group === 'TIME_OF_YEAR' || entry.group === 'COLLECTION',
);
const CLOTHING = ['LETTER', 'NUM_BOTTOM', 'NUM_TOP'];
const ALL = ['LETTER', 'NUM_BOTTOM', 'NUM_TOP', 'NUM_SHOES'];

describe('legacy colour matching', () => {
  it.each([
    [{ name: 'Белый', hex: '#FFFFFF' }, 'exact', '#FFFFFF'],
    [{ name: 'Белый', hex: '#fff' }, 'alias', '#FFFFFF'],
    [{ name: 'Red', code: '#ff0000' }, 'alias', '#FF0000'],
    [{ name: 'Чёрный', hex: '#111111' }, 'alias', '#000000'],
    [{ name: 'черный', hex: null }, 'alias', '#000000'],
    [{ name: 'Графит', hex: '#3A3A3C' }, 'new', '#3A3A3C'],
    [{ name: 'Мультиколор', hex: null, code: 'MLT' }, 'manual', null],
  ])('%p → %s %s', (legacy, status, code) => {
    expect(matchLegacyColor(legacy as any, colors)).toMatchObject({
      status,
      code,
    });
  });
});

describe('legacy size matching', () => {
  it.each([
    [{ code: 'M', name: 'M', kind: 'CLOTHING' }, CLOTHING, 'exact', 'M'],
    [
      { code: 'LEGACYABC', name: 'XXL', kind: 'CLOTHING' },
      CLOTHING,
      'alias',
      '2XL',
    ],
    [{ code: '2хл', name: '2хл', kind: null }, CLOTHING, 'alias', '2XL'],
    [
      { code: 'R48', name: '48 (RU)', kind: 'CLOTHING' },
      CLOTHING,
      'alias',
      '48',
    ],
    [
      { code: 'R44', name: '44 (RU)', kind: 'CLOTHING' },
      CLOTHING,
      'manual',
      null,
    ],
    [{ code: 'S42', name: '42', kind: 'SHOES' }, ALL, 'exact', '42'],
    [{ code: '42', name: '42', kind: 'CLOTHING' }, ALL, 'exact', '42'],
    [{ code: '42', name: '42', kind: null }, ALL, 'manual', null],
    [
      { code: '35.5', name: '35.5', kind: 'SHOES' },
      ['NUM_SHOES'],
      'new',
      '35.5',
    ],
    [{ code: '5XL', name: '5XL', kind: 'CLOTHING' }, CLOTHING, 'new', '5XL'],
  ])('%p in %p → %s %s', (legacy, groups, status, code) => {
    expect(matchLegacySize(legacy as any, sizes, groups)).toMatchObject({
      status,
      code,
    });
  });

  it('keeps the group of the matched size', () => {
    expect(
      matchLegacySize({ code: 'S42', name: '42', kind: 'SHOES' }, sizes, ALL)
        .group,
    ).toBe('NUM_SHOES');
    expect(
      matchLegacySize({ code: '42', name: '42', kind: 'CLOTHING' }, sizes, ALL)
        .group,
    ).toBe('NUM_BOTTOM');
  });
});

describe('legacy season and collection matching', () => {
  it.each([
    [{ code: 'SUMMER', nameRu: 'Лето' }, 'exact', 'SUMMER'],
    [{ code: 'summer', nameRu: 'Лето' }, 'alias', 'SUMMER'],
    [{ code: 'LETO', nameRu: 'Лето' }, 'alias', 'SUMMER'],
    [{ code: 'X1', nameRu: 'Пляж' }, 'manual', null],
  ])('%p → %s', (legacy, status, code) => {
    expect(matchLegacySeason(legacy, seasons)).toMatchObject({ status, code });
  });

  it.each([
    ['SS26', 'exact', 'SS26'],
    ['ss 2026', 'alias', 'SS26'],
    ['FW28', 'new', 'FW28'],
    ['Новая коллекция', 'manual', null],
  ])('collection %p → %s', (text, status, code) => {
    expect(matchCollection(text, seasons)).toMatchObject({ status, code });
  });
});
