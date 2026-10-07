import { BadRequestException } from '@nestjs/common';

// Plain decimal only: Number() would also accept '1e9', '0x10', ' ', true
// and [5], all of which reached money and stock fields before.
const DECIMAL_STRING = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/**
 * Parses a numeric request field. Missing values (undefined, null, '') give
 * undefined; anything else must be a finite number or a decimal string.
 */
export function parseRequestNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && DECIMAL_STRING.test(value.trim())) {
    parsed = Number(value.trim());
  } else {
    throw new BadRequestException('Numeric field contains invalid number');
  }

  if (!Number.isFinite(parsed)) {
    throw new BadRequestException('Numeric field contains invalid number');
  }
  return parsed;
}

/** Throws unless the value has at most `decimals` fractional digits. */
export function assertMaxDecimals(
  value: number,
  decimals: number,
  message: string,
) {
  const factor = 10 ** decimals;
  if (Math.abs(value * factor - Math.round(value * factor)) > 1e-8) {
    throw new BadRequestException(message);
  }
}
