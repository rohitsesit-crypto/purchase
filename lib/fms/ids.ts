const IST = 'Asia/Kolkata';

/**
 * FMS number, one per record, restarting every month.
 *
 *   PFMS-261100001
 *   │    │ │ └└──── five-digit sequence, 00001 upwards
 *   │    │ └─────── month number (11 = November)
 *   │    └───────── two-digit year (26 = 2026)
 *   └────────────── PFMS marks the Purchase FMS system
 *
 * The month is part of the number, so the sequence restarts on the 1st without
 * ever colliding with an earlier month's records. Mumbai and Boisar share the
 * series: the number identifies the record, the Location column identifies the
 * office.
 */
export const FMS_ID_PREFIX = 'PFMS-';

/** Width of the running sequence after the year and month. */
const FMS_ID_SEQUENCE_WIDTH = 5;

/** Width of `YYMM`. */
const FMS_ID_PERIOD_WIDTH = 4;

/** The `PFMS-YYYYMM` head for a moment in time, in India Standard Time. */
export const fmsIdPeriodOf = (when: string | Date = new Date()): string => {
  const date = when instanceof Date ? when : new Date(when);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: '2-digit',
    month: '2-digit',
  }).formatToParts(safe);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${FMS_ID_PREFIX}${pick('year')}${pick('month')}`;
};

/** True for a well-formed number: `PFMS-261100001`. */
export const isFmsId = (value: string): boolean =>
  new RegExp(`^${FMS_ID_PREFIX}\\d{${FMS_ID_PERIOD_WIDTH + FMS_ID_SEQUENCE_WIDTH}}$`).test(
    String(value ?? '').trim(),
  );

/**
 * The next free number for the current month.
 *
 * The highest existing sequence decides the next one instead of a row count, so
 * deleting a record can never hand its number to somebody else.
 */
export const nextFmsId = (existing: string[] = [], when: string | Date = new Date()): string => {
  const period = fmsIdPeriodOf(when);
  const highest = existing.reduce((max, value) => {
    const id = String(value ?? '').trim();
    if (!id.startsWith(period)) return max;
    const sequence = Number(id.slice(period.length));
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);

  return `${period}${String(highest + 1).padStart(FMS_ID_SEQUENCE_WIDTH, '0')}`;
};

/** The sequence part on its own, for compact display such as `#0001`. */
export const fmsIdSequenceOf = (value: string): string => {
  const id = String(value ?? '').trim();
  if (!isFmsId(id)) return '';
  return id.slice(FMS_ID_PREFIX.length + FMS_ID_PERIOD_WIDTH);
};

/** `PFMS-261100001` → `Nov 2026`, or an empty string when it is not an FMS number. */
export const fmsIdPeriodLabel = (value: string): string => {
  const id = String(value ?? '').trim();
  if (!isFmsId(id)) return '';
  const period = id.slice(FMS_ID_PREFIX.length, FMS_ID_PREFIX.length + FMS_ID_PERIOD_WIDTH);
  const year = Number(period.slice(0, 2));
  const month = Number(period.slice(2));
  if (!year || month < 1 || month > 12) return '';
  const date = new Date(Date.UTC(2000 + year, month - 1, 1));
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
};

/**
 * The identity of one company row in an uploaded workbook.
 *
 * Two rows are only the same entry when every captured detail matches. A client
 * that raises two purchase orders in the same upload keeps both rows, because
 * the PO reference, supplier or total differs.
 */
export const rowSignatureOf = (row: {
  company_name: string;
  supplier: string;
  po_number: string;
  pay_terms: string;
  gross_total: number;
}): string =>
  [
    row.company_name,
    row.supplier,
    row.po_number,
    row.pay_terms,
    String(Math.round((Number(row.gross_total) || 0) * 100) / 100),
  ]
    .map((value) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' '),
    )
    .join('\u0001');
