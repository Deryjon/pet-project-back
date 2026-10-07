// Report days follow the company's local calendar (the process runs with
// TZ=Asia/Tashkent, see src/timezone.ts), not UTC: a sale at 02:00 in
// Tashkent belongs to that day, not to the previous UTC day.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" as local midnight; other strings parse as before. */
export function parseLocalDate(value: string): Date {
  const match = DATE_ONLY.exec(value.trim());
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(value);
}

/** Local calendar day of a moment as "YYYY-MM-DD". */
export function localDateKey(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

/**
 * Local start of the day, ISO week (Monday) or month a moment falls in,
 * as "YYYY-MM-DD 00:00:00" — the key report plots are bucketed by.
 */
export function localPeriodStartKey(
  value: Date | string,
  detalization = 'day',
): string {
  const date =
    typeof value === 'string' ? parseLocalDate(value) : new Date(value);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (detalization === 'month') {
    start.setDate(1);
  } else if (detalization === 'week') {
    const weekday = start.getDay();
    start.setDate(start.getDate() - (weekday === 0 ? 6 : weekday - 1));
  }

  return `${localDateKey(start)} 00:00:00`;
}
