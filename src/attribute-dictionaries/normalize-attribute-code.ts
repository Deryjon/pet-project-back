import { AttributeValueType } from '@prisma/client';

// The one normalization of dictionary codes: the API, the Excel import and
// the audit script all go through it, so "XXL", "2хл" and "2 XL" are one size.

export class AttributeCodeError extends Error {}

// Cyrillic letters typed instead of the Latin ones of a size/season code
// ("ХХЛ" = XXL, "ХЛ" = XL).
const SIZE_LOOKALIKES: Record<string, string> = {
  Х: 'X',
  Л: 'L',
  М: 'M',
  С: 'S',
  Т: 'T',
};

// In a HEX value the Cyrillic look-alikes stand for the Latin letters A–F.
const HEX_LOOKALIKES: Record<string, string> = {
  А: 'A',
  В: 'B',
  С: 'C',
  Е: 'E',
};

function replaceChars(value: string, map: Record<string, string>) {
  return [...value].map((char) => map[char] ?? char).join('');
}

export function normalizeColorCode(raw: unknown): string {
  const value = replaceChars(
    String(raw ?? '')
      .trim()
      .toUpperCase(),
    HEX_LOOKALIKES,
  )
    .replace(/\s+/g, '')
    .replace(/^#/, '');
  const hex = /^[0-9A-F]{3}$/.test(value)
    ? [...value].map((char) => char + char).join('')
    : value;
  if (!/^[0-9A-F]{6}$/.test(hex)) {
    throw new AttributeCodeError('Цвет должен быть в формате #RRGGBB');
  }
  return `#${hex}`;
}

function baseCode(raw: unknown) {
  return replaceChars(
    String(raw ?? '')
      .trim()
      .toUpperCase(),
    SIZE_LOOKALIKES,
  ).replace(/[\s-]+/g, '');
}

export function normalizeSizeCode(raw: unknown): string {
  const code = baseCode(raw);
  if (!code) throw new AttributeCodeError('Укажите код размера');

  if (/^\d+([.,]\d+)?$/.test(code)) {
    // 42, 42.0, 42,0 → 42; 42,5 → 42.5
    return String(Number(code.replace(',', '.')));
  }
  // XXL → 2XL, XXXL → 3XL: after XL the letter code always carries a digit.
  const xl = code.match(/^(X{2,})L$/);
  if (xl) return `${xl[1].length}XL`;
  if (/^1XL$/.test(code)) return 'XL';

  if (!/^[A-Z0-9./]{1,20}$/.test(code)) {
    throw new AttributeCodeError(
      'Код размера: латинские буквы, цифры, точка или «/», до 20 символов',
    );
  }
  return code;
}

export function normalizeSeasonCode(raw: unknown): string {
  const code = baseCode(raw);
  if (!code) throw new AttributeCodeError('Укажите код сезона');
  // SS 2026, ss-26 → SS26
  const collection = code.match(/^(SS|FW)(?:20)?(\d{2})$/);
  if (collection) return `${collection[1]}${collection[2]}`;
  if (!/^[A-Z0-9]{1,20}$/.test(code)) {
    throw new AttributeCodeError(
      'Код сезона: латинские буквы и цифры, до 20 символов (например SUMMER или SS26)',
    );
  }
  return code;
}

export function isCollectionCode(code: string) {
  return /^(SS|FW)\d{2}$/.test(code);
}

export function normalizeAttributeCode(
  type: AttributeValueType,
  raw: unknown,
): string {
  switch (type) {
    case 'COLOR':
      return normalizeColorCode(raw);
    case 'SIZE':
      return normalizeSizeCode(raw);
    case 'SEASON':
      return normalizeSeasonCode(raw);
    default:
      throw new AttributeCodeError(`Unknown attribute type ${String(type)}`);
  }
}

/** Euclidean RGB distance between two #RRGGBB colours (0 … ~441). */
export function colorDistance(a: string, b: string) {
  const channels = (hex: string) =>
    [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Below this distance a new colour is "similar" to an existing one: a warning only. */
export const SIMILAR_COLOR_DISTANCE = 24;
