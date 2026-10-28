const IST = 'Asia/Kolkata';

const dateParts = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date);

const pick = (parts: Intl.DateTimeFormatPart[], type: string) =>
  parts.find((part) => part.type === type)?.value ?? '';

/** 22 Sep 2026 */
export const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const list = dateParts(date);
  return `${pick(list, 'day')} ${pick(list, 'month')} ${pick(list, 'year')}`;
};

/** 22 Sep 2026, 04:15 pm */
export const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

/** Alias kept for readability at call sites that deal with sheet timestamps. */
export const formatTimestamp = formatDateTime;

/**
 * Indian money display.
 *
 * Purchase sheets are written in crore — `3619.00 Cr` — not in eleven digits, so
 * anything at or above one crore is shown back in the same unit the sheet used.
 * Below that, plain rupee grouping reads more naturally.
 */
export const money = (value?: number | null) => {
  const amount = Number(value ?? 0) || 0;
  const abs = Math.abs(amount);
  if (abs >= 1e7) {
    const crore = amount / 1e7;
    return `₹${crore.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} Cr`;
  }
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** Multipliers for the unit words common on Indian purchase sheets. */
const MONEY_UNITS: Record<string, number> = {
  cr: 1e7,
  crore: 1e7,
  crores: 1e7,
  lakh: 1e5,
  lakhs: 1e5,
  lac: 1e5,
  lacs: 1e5,
  thousand: 1e3,
  k: 1e3,
  mn: 1e6,
  million: 1e6,
  bn: 1e9,
  billion: 1e9,
};

const digitsOnly = (value: string) =>
  value
    .replace(/[₹,\s]/g, '')
    .replace(/[^0-9.-]/g, '');

/**
 * Finds a unit word anywhere in a label or value, e.g. `Gross Total (Cr)`.
 *
 * Used for two cases: a cell that carries its own unit (`3619.00 Cr`), and a
 * column whose heading carries it while the cells are bare numbers.
 */
export const unitMultiplierIn = (label: string): number => {
  const match = String(label ?? '').match(
    /\b(crores|crore|cr|lakhs|lakh|lacs|lac|millions|million|mn|billions|billion|bn|thousands|thousand|k)\b/i,
  );
  return match ? MONEY_UNITS[match[1].toLowerCase()] ?? 1 : 1;
};

/**
 * Reads a money cell and expands its unit into whole rupees.
 *
 * `3619.00 Cr` becomes 36190000000 so payouts, pending balances and totals all
 * stay in one unit; the formatter above converts it back to `₹3,619.00 Cr` for
 * display. `fallbackUnit` supplies the multiplier when the cell is a bare number
 * and the unit lives in the column heading instead.
 */
export const parseMoney = (value: unknown, fallbackUnit = 1): number => {
  const unit = Number.isFinite(fallbackUnit) && fallbackUnit > 0 ? fallbackUnit : 1;

  if (typeof value === 'number') return Number.isFinite(value) ? value * unit : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const base = Number(digitsOnly(raw));
  if (!Number.isFinite(base) || base === 0) return 0;

  // A unit written next to the number wins over the column heading.
  const trailing = raw.match(/([A-Za-z]+)\.?\s*$/);
  const ownUnit = trailing ? MONEY_UNITS[trailing[1].toLowerCase()] : undefined;
  return base * (ownUnit ?? unit);
};

export const num = (value?: number | null) => (value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const relativeTime = (value?: string | null): string => {
  if (!value) return 'not synced yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not synced yet';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};

export const newKey = () => `key_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

export const requestKey = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** Reads a boolean coming back from a spreadsheet in any of its shapes. */
export const sheetBool = (value: unknown) =>
  value === true || String(value ?? '').trim().toLowerCase() === 'true';
