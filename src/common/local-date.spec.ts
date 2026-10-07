import {
  localDateKey,
  localPeriodStartKey,
  parseLocalDate,
} from './local-date';

describe('local report dates', () => {
  it('reads a date-only filter as local midnight', () => {
    const date = parseLocalDate('2026-10-07');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
      2026, 9, 7,
    ]);
    expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
  });

  it('keeps full timestamps as they are', () => {
    const iso = '2026-10-07T10:15:00.000Z';
    expect(parseLocalDate(iso).toISOString()).toBe(iso);
  });

  it('groups a moment by its local calendar day', () => {
    expect(localDateKey(new Date(2026, 0, 5, 1, 30))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('buckets plot points by the local day, week and month', () => {
    // Early morning local time is still the previous day in UTC east of it.
    const earlyMorning = new Date(2026, 9, 7, 1, 30); // Wed 7 Oct 2026
    expect(localPeriodStartKey(earlyMorning)).toBe('2026-10-07 00:00:00');
    expect(localPeriodStartKey(earlyMorning, 'week')).toBe(
      '2026-10-05 00:00:00',
    );
    expect(localPeriodStartKey(earlyMorning, 'month')).toBe(
      '2026-10-01 00:00:00',
    );
    // A Sunday belongs to the week that started on Monday.
    expect(localPeriodStartKey(new Date(2026, 9, 11, 23, 0), 'week')).toBe(
      '2026-10-05 00:00:00',
    );
    expect(localPeriodStartKey('2026-10-07')).toBe('2026-10-07 00:00:00');
  });
});
