import { BadRequestException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';

describe('WarehouseService counted quantity', () => {
  const service = new WarehouseService({} as any);
  const parse = (value: unknown) =>
    (service as any).parseCountedQuantity(value) as number;

  it.each([
    [0, 0],
    [5, 5],
    ['12', 12],
    [' 1.25 ', 1.25],
    [2.125, 2.125],
  ])('accepts %j', (value, expected) => {
    expect(parse(value)).toBe(expected);
  });

  it.each([
    '',
    ' ',
    null,
    undefined,
    [],
    [5],
    true,
    -1,
    '-1',
    '1e3',
    '0x10',
    'abc',
    Infinity,
    NaN,
    1.2345,
    1_000_000_000,
  ])('rejects %j instead of counting it as zero', (value) => {
    expect(() => parse(value)).toThrow(BadRequestException);
  });
});
