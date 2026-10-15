import { ProductSizeKind } from '@prisma/client';
import { normalizeSizeCode as normalizeDictionarySizeCode } from '../attribute-dictionaries/normalize-attribute-code';

/**
 * Normalizes a size code with the one rule of the dictionaries: "xxl", "ХХЛ",
 * "2 XL", "2-xl" → 2XL, "XXXXL" → 4XL, "42.0", "42 " → 42, "42,5" → 42.5.
 * A value that rule rejects is only trimmed and upper-cased.
 */
export function normalizeSizeCode(raw: string): string {
  if (!raw?.trim()) return '';
  try {
    return normalizeDictionarySizeCode(raw);
  } catch {
    return raw.trim().toUpperCase().replace(/,/g, '.');
  }
}

/** Kind implied by a size code alone: 30–50 → shoes, letters or R+number → clothing. */
export function sizeKindFromCode(code: string): ProductSizeKind | null {
  const numMatch = code.match(/^(\d{2})(\.\d)?$/);
  if (numMatch) {
    const num = parseFloat(code);
    if (num >= 30 && num <= 50) return 'SHOES';
  }
  if (/^[A-Z]+$/.test(code) || /^\d?XL$/.test(code) || /^R\d+$/.test(code)) {
    return 'CLOTHING';
  }
  return null;
}

type StoredSize = {
  id: string;
  kind?: ProductSizeKind | null;
  type?: string | null;
  name?: string | null;
};

// Sizes from the size-grid presets carry only `type`, not `kind`.
function storedSizeKind(size: StoredSize): ProductSizeKind | undefined {
  if (size.kind) return size.kind;
  if (size.type === 'SHOES' || size.type === 'CLOTHING') return size.type;
  return sizeKindFromCode(normalizeSizeCode(size.name ?? '')) ?? undefined;
}

/**
 * Resolves a size of the tenant and its kind (CLOTHING vs SHOES).
 *
 * 1. Exact match by code.
 * 2. Match by name (sizes migrated with LEGACY… codes are named "M", "42").
 *    Several matches are narrowed by the kind implied by the code; a still
 *    ambiguous name is an error rather than a guess or a duplicate.
 * 3. Otherwise the kind comes from the code pattern and, with `autoCreate`,
 *    a new size is created.
 *
 * `kind` is undefined only for an existing size whose kind cannot be told.
 */
export async function resolveSize(
  rawCode: string,
  companyId: string,
  prisma: any,
  options?: { autoCreate?: boolean },
): Promise<{ kind?: ProductSizeKind; sizeId?: string; created?: boolean }> {
  const code = normalizeSizeCode(rawCode);

  if (!code) {
    throw new Error('Не указан размер');
  }

  const existingSize: StoredSize | null = await prisma.productSize.findFirst({
    where: { companyId, code },
  });
  if (existingSize) {
    return { kind: storedSizeKind(existingSize), sizeId: existingSize.id };
  }

  // Stored sizes compared by the same rule, so "XXL", "xxl" or "42.0" saved
  // earlier are found instead of getting another duplicate.
  const patternKind = sizeKindFromCode(code);
  const stored: Array<StoredSize & { code?: string | null; nameRu?: string | null }> =
    await prisma.productSize.findMany({
      where: { companyId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  const byName = stored.filter((size) =>
    [size.code, size.name, size.nameRu].some(
      (value) => value && normalizeSizeCode(value) === code,
    ),
  );
  const candidates =
    byName.length > 1 && patternKind
      ? byName.filter((size) => storedSizeKind(size) === patternKind)
      : byName;
  if (candidates.length === 1) {
    return {
      kind: storedSizeKind(candidates[0]),
      sizeId: candidates[0].id,
    };
  }
  if (candidates.length > 1) {
    throw new Error(
      `Размер ${code} неоднозначен: в справочнике несколько размеров с таким названием, укажите код размера`,
    );
  }

  if (!patternKind) {
    throw new Error(
      `Размер «${rawCode.trim()}» не распознан: укажите размер из справочника (например M, 2XL, 42)`,
    );
  }

  if (options?.autoCreate) {
    const created = await prisma.productSize.create({
      data: {
        companyId,
        code,
        name: code,
        kind: patternKind,
        // The size grids and the GET filter work by type.
        type: patternKind,
        isActive: true,
      },
    });
    return { kind: patternKind, sizeId: created.id, created: true };
  }

  return { kind: patternKind };
}

/**
 * Generate EAN-13 barcode with internal prefix (2) and check digit.
 * Prefix 2 is reserved for in-store use (internal barcodes).
 */
export function generateEAN13(): string {
  // Prefix: 2 (in-store use)
  // Then 11 random digits
  let code = '2';
  for (let i = 0; i < 11; i++) {
    code += Math.floor(Math.random() * 10);
  }

  // Calculate check digit (EAN-13 checksum)
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i]);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  return code + checkDigit;
}

/**
 * Generate unique EAN-13 for a tenant.
 * Ensures no collision in ProductVariant.barcode
 */
export async function generateUniqueEAN13(
  companyId: string,
  prisma: any,
  maxRetries: number = 100,
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const barcode = generateEAN13();

    const existing = await prisma.productVariant.findFirst({
      where: { companyId, barcode },
    });

    if (!existing) {
      return barcode;
    }
  }

  throw new Error('Failed to generate unique EAN-13 after maximum retries');
}
