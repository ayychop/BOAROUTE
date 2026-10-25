export const MAX_ODOMETER = 999_999;

/** Accepts "14500", "14,500" or "14 500.4". Returns NaN for anything else. */
export function parseOdometer(input: string): number {
  const clean = input.replace(/[\s,]/g, '');
  if (!/^\d{1,6}(\.\d)?$/.test(clean)) return NaN;
  const n = Number(clean);
  return n <= MAX_ODOMETER ? n : NaN;
}

/** Reads numeric(9,1) values that PostgREST may send as strings. */
export function odometerValue(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Whole miles with thousands separators, as an odometer shows them: 14,542. */
export function formatOdometer(v: number | string | null | undefined): string {
  const n = odometerValue(v);
  return n === null ? '--' : Math.floor(n).toLocaleString('en-GB');
}

/** Six zero-padded digits for the cockpit display. */
export function odometerDigits(v: number | string | null | undefined): string[] {
  const n = odometerValue(v);
  return (n === null ? '------' : String(Math.floor(n)).padStart(6, '0').slice(-6)).split('');
}
