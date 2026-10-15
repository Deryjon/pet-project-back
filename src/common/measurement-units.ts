/**
 * One spelling per unit of measurement. "шт", "Штука", "шт.", "pcs", "dona"
 * all mean the same unit and must not split the catalog, the unit filter or
 * the import diff into separate values.
 *
 * Stored Product.unit values are never rewritten: old spellings are read
 * through canonicalUnit, new writes store the canonical short name.
 */
export const PIECE_UNIT = 'шт';

// Canonical short name → every spelling that means it (compared via unitKey).
const UNIT_ALIASES: Record<string, string[]> = {
  [PIECE_UNIT]: [
    'шт', 'штука', 'штуки', 'штук', 'штучка', 'штуч', 'ед', 'единица',
    'pcs', 'pc', 'piece', 'pieces', 'unit', 'units', 'countable', 'ea', 'each',
    'dona', 'дона',
  ],
  кг: ['кг', 'килограмм', 'килограммы', 'kg', 'kilogram', 'kilo', 'kilogramm'],
  г: ['г', 'гр', 'грамм', 'граммы', 'g', 'gr', 'gram', 'gramm'],
  л: ['л', 'литр', 'литры', 'l', 'liter', 'litre', 'litr'],
  мл: ['мл', 'миллилитр', 'ml'],
  м: ['м', 'метр', 'метры', 'm', 'meter', 'metre', 'metr'],
  пара: ['пара', 'пары', 'пар', 'pair', 'pairs', 'juft'],
};

const ALIAS_TO_UNIT = new Map<string, string>(
  Object.entries(UNIT_ALIASES).flatMap(([unit, aliases]) =>
    aliases.map((alias) => [alias, unit] as const),
  ),
);

/** Comparison key: trimmed, lower case, ё→е, no trailing dots, single spaces. */
export function unitKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '');
}

/** The canonical short name of a known spelling, or null (also for empty). */
export function canonicalUnit(value: unknown): string | null {
  const key = unitKey(value);
  return key ? (ALIAS_TO_UNIT.get(key) ?? null) : null;
}

/** Known spelling → canonical; anything else trimmed as is; empty → null. */
export function normalizeUnit(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return canonicalUnit(text) ?? text;
}

/** Whether two unit spellings mean the same unit. */
export function sameUnit(left: unknown, right: unknown): boolean {
  const a = unitKey(left);
  const b = unitKey(right);
  if (!a || !b) return a === b;
  return (canonicalUnit(a) ?? a) === (canonicalUnit(b) ?? b);
}

/**
 * Stored spellings to match when filtering by a unit, so products saved as
 * "штука" or "шт." are found by "шт". Compare case-insensitively.
 */
export function unitStoredSpellings(value: unknown): string[] {
  const text = String(value ?? '').trim();
  if (!text) return [];
  const unit = canonicalUnit(text);
  const aliases = unit ? UNIT_ALIASES[unit] : [text];
  return [...new Set(aliases.flatMap((alias) => [alias, `${alias}.`]))];
}

export type CompanyUnit = { name: string; shortName: string };

/**
 * Resolves an import value against the company's units. Empty means "шт".
 * Returns the unit's short name as the company stores it, or null when the
 * value is not one of the company's units.
 */
export function resolveCompanyUnit(
  value: unknown,
  units: CompanyUnit[],
): string | null {
  const key = unitKey(value);
  if (!key) return PIECE_UNIT;
  const canonical = canonicalUnit(key) ?? key;
  const match = units.find((unit) =>
    [unit.shortName, unit.name].some(
      (spelling) => (canonicalUnit(spelling) ?? unitKey(spelling)) === canonical,
    ),
  );
  if (match) return normalizeUnit(match.shortName);
  // "шт" is always available, even before the company's units are seeded.
  return canonical === PIECE_UNIT ? PIECE_UNIT : null;
}
