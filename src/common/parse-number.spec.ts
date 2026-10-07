import { assertMaxDecimals, parseRequestNumber } from './parse-number';

describe('parseRequestNumber', () => {
  it('treats missing values as undefined', () => {
    expect(parseRequestNumber(undefined)).toBeUndefined();
    expect(parseRequestNumber(null)).toBeUndefined();
    expect(parseRequestNumber('')).toBeUndefined();
  });

  it('accepts numbers and plain decimal strings', () => {
    expect(parseRequestNumber(12.5)).toBe(12.5);
    expect(parseRequestNumber(' 100.25 ')).toBe(100.25);
    expect(parseRequestNumber('-3')).toBe(-3);
    expect(parseRequestNumber('.5')).toBe(0.5);
  });

  it.each([Infinity, NaN, '1e9', '0x10', ' ', 'abc', true, [5], {}])(
    'rejects %p',
    (value) => {
      expect(() => parseRequestNumber(value)).toThrow(
        'Numeric field contains invalid number',
      );
    },
  );
});

describe('assertMaxDecimals', () => {
  it('allows the grain and rejects finer values', () => {
    expect(() => assertMaxDecimals(10.25, 2, 'bad')).not.toThrow();
    expect(() => assertMaxDecimals(0.004, 2, 'bad')).toThrow('bad');
    expect(() => assertMaxDecimals(1.125, 3, 'bad')).not.toThrow();
    expect(() => assertMaxDecimals(0.0004, 3, 'bad')).toThrow('bad');
  });
});
