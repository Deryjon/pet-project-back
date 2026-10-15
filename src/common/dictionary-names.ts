import { normalizeColorCode } from '../attribute-dictionaries/normalize-attribute-code';

/**
 * One comparison rule for names typed into dictionaries (colours, seasons,
 * attribute values, brands, categories, suppliers): case, ё/е, extra spaces
 * and hyphen vs space do not make a new value. "Тёмно-синий", "темно синий"
 * and " ТЕМНО-СИНИЙ " are one name.
 */
export function nameKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s\-‐–—_]+/g, ' ')
    .trim();
}

/** Typed name cleaned for storage: trimmed, single spaces. */
export function cleanName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** "#fff", "FFF", "#ffffff" → "#FFFFFF"; anything that is not a colour → null. */
export function hexKey(value: unknown): string | null {
  if (!String(value ?? '').trim()) return null;
  try {
    return normalizeColorCode(value);
  } catch {
    return null;
  }
}
