import { ProductSizeKind } from '@prisma/client';

/**
 * Normalizes a size code: trim, uppercase, XXL→2XL, XXXL→3XL, comma→period
 */
export function normalizeSizeCode(raw: string): string {
  if (!raw) return '';
  let code = raw.trim().toUpperCase();
  code = code.replace(/,/g, '.');
  code = code.replace(/^XXL$/, '2XL');
  code = code.replace(/^XXXL$/, '3XL');
  return code;
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
): Promise<{ kind?: ProductSizeKind; sizeId?: string }> {
  const code = normalizeSizeCode(rawCode);

  if (!code) {
    throw new Error('Size code cannot be empty');
  }

  const existingSize: StoredSize | null = await prisma.productSize.findFirst({
    where: { companyId, code },
  });
  if (existingSize) {
    return { kind: storedSizeKind(existingSize), sizeId: existingSize.id };
  }

  const patternKind = sizeKindFromCode(code);
  const names = [...new Set([rawCode.trim(), code])];
  const byName: StoredSize[] = await prisma.productSize.findMany({
    where: {
      companyId,
      isActive: true,
      OR: names.flatMap((name) => [
        { name: { equals: name, mode: 'insensitive' } },
        { nameRu: { equals: name, mode: 'insensitive' } },
      ]),
    },
    orderBy: { sortOrder: 'asc' },
  });
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
    throw new Error(`Cannot determine size kind for code ${code}`);
  }

  if (options?.autoCreate) {
    const created = await prisma.productSize.create({
      data: {
        companyId,
        code,
        name: code,
        kind: patternKind,
        type: 'OTHER',
        isActive: true,
      },
    });
    return { kind: patternKind, sizeId: created.id };
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
