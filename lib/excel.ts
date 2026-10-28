import type { DraftItem, SheetCompanyRow } from './fms/types';
import { parseMoney, unitMultiplierIn } from './format';

/**
 * Column contract for the supplier workbook.
 *
 * Real purchase workbooks are hand-made: the header row is rarely row 1, columns
 * start after a margin, titles sit above the table, and the same field can be
 * titled half a dozen ways. Nothing here assumes a position — the header row and
 * the header columns are located by their text, and anything still unlabelled is
 * guessed from the shape of its data.
 */
export type CompanyField = 'company' | 'supplier' | 'poNumber' | 'payTerms' | 'grossTotal';

export const COMPANY_COLUMNS: Record<CompanyField, readonly string[]> = {
  company: [
    'Particulars',
    'Company',
    'Company Name',
    'Party',
    'Party Name',
    'Client',
    'Client Name',
    'Customer',
    'Customer Name',
    'Firm',
    'Firm Name',
  ],
  supplier: [
    'Supplier',
    'Supplier Name',
    'Vendor',
    'Vendor Name',
    'Name of Client',
    'Seller',
    'Sold By',
  ],
  poNumber: [
    'Order Reference No',
    'Order Reference Number',
    'Order Reference',
    'Order Ref No',
    'PO Number',
    'PO No',
    'PONumber',
    'Purchase Order No',
    'Purchase Order Number',
    'Reference No',
    'Ref No',
  ],
  payTerms: ['Terms of Payment', 'Payment Terms', 'Pay Terms', 'Credit Days', 'Terms', 'Payment Days'],
  grossTotal: [
    'Gross Total',
    'Gross Amount',
    'Gross Value',
    'Total Amount',
    'Invoice Total',
    'Grand Total',
    'Net Amount',
    'Amount',
    'Total',
  ],
};

/** Canonical label per field, used in the "not found" report. */
export const REQUIRED_COLUMNS: Record<CompanyField, string> = {
  company: 'Particulars',
  supplier: 'Supplier',
  poNumber: 'Order Reference No.',
  payTerms: 'Terms of Payment',
  grossTotal: 'Gross Total',
};

const FIELDS: CompanyField[] = ['company', 'supplier', 'poNumber', 'payTerms', 'grossTotal'];

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, '')
    .replace(/[^a-z0-9]/g, '');

const text = (value: unknown) => String(value ?? '').trim();

/**
 * How well a cell reads as the given label: an exact heading scores highest, a
 * cell that starts with it next, and one that merely contains it lowest. This
 * lets "PO No." and "Order Reference No." both match the same column.
 */
const labelScore = (cell: string, aliases: readonly string[]): number => {
  const normalized = normalizeHeader(cell);
  if (!normalized || normalized.length > 48) return 0;
  let best = 0;
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    if (!target) continue;
    if (normalized === target) best = Math.max(best, 100);
    else if (normalized.startsWith(target) || target.startsWith(normalized)) best = Math.max(best, 70);
    else if (normalized.includes(target)) best = Math.max(best, 50);
  }
  return best;
};

/** Best field hinted at by a single cell, or null. */
const bestFieldFor = (cell: string): { field: CompanyField; score: number } | null => {
  let winner: { field: CompanyField; score: number } | null = null;
  for (const field of FIELDS) {
    const score = labelScore(cell, COMPANY_COLUMNS[field]);
    if (score > 0 && (!winner || score > winner.score)) winner = { field, score };
  }
  return winner;
};

const cellAt = (matrix: unknown[][], row: number, column: number): unknown => {
  const line = matrix[row];
  if (!line) return '';
  return line[column] ?? '';
};

/** Accepts `1,234.50`, `₹1,234.50`, `1234.5` and plain numbers. */
export const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = text(value)
    .replace(/[₹,\s]/g, '')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface ParsedSheet {
  companies: SheetCompanyRow[];
  /** Canonical names of fields that could not be located or inferred. */
  missingColumns: string[];
  totalRows: number;
  /** Zero-based index of the row that was read as the header, or -1 if none. */
  headerRow: number;
}

export interface ParseOptions {
  /**
   * The same grid read with numbers formatted the way the sheet displays them.
   *
   * Excel keeps `3619` as the cell value and `0.00" Cr"` as its number format, so
   * the unit exists only in the displayed text. Reading that grid is what lets
   * `3619.00 Cr` survive the trip into the app.
   */
  formatted?: unknown[][];
}

interface ColumnStats {
  index: number;
  filled: number;
  numeric: number;
  poLike: number;
  unitLike: number;
  distinct: number;
}

const PO_PATTERN = /^[A-Za-z]{0,8}[-/ ]?\d{2,}[-/]?[A-Za-z0-9-]*$/;
const UNIT_PATTERN = /^\d{1,4}\s*[A-Za-z]{0,6}$/;

/**
 * Rows that summarise a table rather than describe a company. They must never
 * become an FMS record.
 */
const SUMMARY_ROW = /^(total|grand\s*total|sub\s*total|sum|amount\s*payable|balance)\b/i;

const columnStats = (matrix: unknown[][], from: number, width: number): ColumnStats[] => {
  const stats: ColumnStats[] = [];
  for (let column = 0; column < width; column += 1) {
    const values: string[] = [];
    for (let row = from; row < matrix.length; row += 1) {
      const value = text(cellAt(matrix, row, column));
      if (value) values.push(value);
    }
    const numeric = values.filter((value) => /-?\d/.test(value) && toNumber(value) !== 0).length;
    stats.push({
      index: column,
      filled: values.length,
      numeric,
      poLike: values.filter((value) => PO_PATTERN.test(value)).length,
      unitLike: values.filter((value) => UNIT_PATTERN.test(value)).length,
      distinct: new Set(values.map((value) => value.toLowerCase())).size,
    });
  }
  return stats;
};

interface SpanMatch {
  row: number;
  /** How many stacked rows the headings occupy (merged / multi-row headers). */
  span: number;
  fields: Map<CompanyField, number>;
  score: number;
}

/**
 * Scores one candidate heading band: `span` consecutive rows starting at `row`.
 *
 * Headings are read per column, so a label can sit anywhere horizontally, and a
 * heading broken across two cells ("Order Reference" | "No.") still resolves.
 */
const matchSpan = (matrix: unknown[][], row: number, span: number, width: number): SpanMatch => {
  const fields = new Map<CompanyField, number>();
  const bestScore = new Map<CompanyField, number>();
  let score = 0;

  const labelAt = (targetRow: number, column: number) => {
    let label = '';
    for (let offset = 0; offset < span; offset += 1) {
      const piece = text(cellAt(matrix, targetRow + offset, column));
      if (piece) label = label ? `${label} ${piece}` : piece;
    }
    return label;
  };

  for (let column = 0; column < width; column += 1) {
    const label = labelAt(row, column);
    if (!label) continue;

    let match = bestFieldFor(label);
    // Only reach for the neighbouring cell when this one says nothing on its own.
    if (!match) {
      const neighbour = labelAt(row, column + 1);
      if (neighbour) match = bestFieldFor(`${label} ${neighbour}`);
    }
    if (!match) continue;

    const previous = bestScore.get(match.field) ?? 0;
    if (match.score > previous) {
      bestScore.set(match.field, match.score);
      fields.set(match.field, column);
      score += match.score - previous;
    }
  }

  return { row, span, fields, score };
};

/**
 * Counts headings on one row using only confident matches (exact or prefix).
 *
 * The loose "contains" match is what makes alias lists useful, but it also makes
 * a data row like `Late Supplier` look like a heading. A repeated heading must
 * therefore clear a higher bar than a real data row ever will.
 */
const strictHeadingCount = (matrix: unknown[][], row: number, width: number): number => {
  let count = 0;
  for (let column = 0; column < width; column += 1) {
    const cell = text(cellAt(matrix, row, column));
    if (!cell) continue;
    const match = bestFieldFor(cell);
    if (match && match.score >= 70) count += 1;
  }
  return count;
};

/**
 * Locates the heading band anywhere in the sheet.
 *
 * Every row is examined — the headings can be at row 3 or row 300, above a title
 * block or below a logo, and nothing about the first row or first column is
 * assumed. Bands of one to three stacked rows are tried so merged headings work.
 */
const findHeader = (matrix: unknown[][], width: number): SpanMatch | null => {
  let best: SpanMatch | null = null;
  const rowCount = matrix.length;

  for (let row = 0; row < rowCount; row += 1) {
    for (let span = 1; span <= 3 && row + span <= rowCount; span += 1) {
      const match = matchSpan(matrix, row, span, width);
      // Two recognised headings are the minimum that makes a plausible header.
      if (match.fields.size < 2) continue;
      if (!best) {
        best = match;
        continue;
      }
      const moreFields = match.fields.size > best.fields.size;
      const sameFieldsBetterScore = match.fields.size === best.fields.size && match.score > best.score;
      // A wider band that finds nothing new only swallows data rows, so it loses.
      const sameFieldsWider = match.fields.size === best.fields.size && match.score === best.score && match.span > best.span;
      if (sameFieldsWider) continue;
      if (moreFields || sameFieldsBetterScore) best = match;
    }
  }

  if (!best) return null;

  // The band may have been found from blank rows above the real headings; report
  // and start after the headings themselves, not the padding.
  let row = best.row;
  while (row < best.row + best.span - 1 && !matrix[row]?.some((cell) => text(cell))) row += 1;

  return { ...best, row, span: Math.max(1, best.row + best.span - row) };
};

/**
 * Fills in any field the header row did not name, using the shape of the column
 * data. The company column is the most varied text column; the gross total is the
 * most numeric; a PO reference is the one that looks like `PO/1234`.
 */
const inferColumns = (
  matrix: unknown[][],
  from: number,
  width: number,
  known: Map<CompanyField, number>,
): Map<CompanyField, number> => {
  const columns = new Map(known);
  const stats = columnStats(matrix, from, width).filter((entry) => entry.filled > 0);
  const taken = () => new Set(columns.values());

  /**
   * Ties break by position — money sits to the right of a table, the company name
   * to the left — but only among columns whose shape actually fits the field, so
   * a plain text column can never be claimed as a PO reference.
   */
  const claim = (
    field: CompanyField,
    candidates: ColumnStats[],
    primary: (entry: ColumnStats) => number,
    direction: 'left' | 'right',
  ) => {
    if (columns.has(field)) return;
    const available = candidates.filter((entry) => !taken().has(entry.index));
    if (!available.length) return;
    const rank = (entry: ColumnStats) =>
      primary(entry) * 1000 + (direction === 'left' ? 1000 - entry.index : entry.index);
    const winner = available.reduce((left, right) => (rank(right) > rank(left) ? right : left));
    if (primary(winner) <= 0) return;
    columns.set(field, winner.index);
  };

  const textColumns = stats.filter((entry) => entry.numeric / Math.max(entry.filled, 1) < 0.4);

  // A PO reference like "PO/2026/0041" reads as a number once the slashes are
  // stripped, so reference-shaped columns must be kept out of the money and
  // terms candidates or they hijack the gross total.
  const referenceShaped = (entry: ColumnStats) => entry.poLike / Math.max(entry.filled, 1) >= 0.5;
  const numericColumns = stats.filter(
    (entry) => entry.numeric / Math.max(entry.filled, 1) >= 0.5 && !referenceShaped(entry),
  );

  // Reference columns are claimed first so a PO number can never be mistaken for
  // money or for the company itself.
  claim('poNumber', textColumns, (entry) => entry.poLike * 3 - entry.unitLike, 'right');
  claim('grossTotal', numericColumns, (entry) => entry.numeric, 'right');
  claim('payTerms', numericColumns, (entry) => entry.filled - entry.numeric * 0.2, 'right');
  claim('company', textColumns, (entry) => entry.distinct * 2 + entry.filled, 'left');
  claim('supplier', textColumns, (entry) => entry.filled + entry.distinct, 'left');

  return columns;
};

/**
 * Reads the companies out of an uploaded sheet.
 *
 * Accepts either a raw cell matrix (preferred — this is what keeps positions
 * honest) or the older array-of-objects shape. The header row is located by
 * text, never by position, and unlabelled columns are inferred from their data.
 */
export const parseCompanySheet = (
  input: unknown[][] | Record<string, unknown>[],
  options: ParseOptions = {},
): ParsedSheet => {
  // Older call sites passed rows keyed by header, which already lost positions.
  const matrix: unknown[][] = Array.isArray(input) && (input.length === 0 || Array.isArray(input[0]))
    ? (input as unknown[][])
    : [
        Object.keys((input as Record<string, unknown>[])[0] ?? {}) as unknown[],
        ...(input as Record<string, unknown>[]).map((row) => Object.values(row)),
      ];

  const width = matrix.reduce((max, line) => Math.max(max, Array.isArray(line) ? line.length : 0), 0);
  if (!width) return { companies: [], missingColumns: Object.values(REQUIRED_COLUMNS), totalRows: 0, headerRow: -1 };

  const header = findHeader(matrix, width);
  const headerRow = header ? header.row : -1;
  const headerSpan = header ? header.span : 0;
  // With no recognisable heading anywhere in the sheet, read every row as data
  // and infer the columns purely from what they contain.
  const dataStart = headerRow >= 0 ? headerRow + headerSpan : 0;
  const columns = inferColumns(matrix, dataStart, width, header ? header.fields : new Map<CompanyField, number>());

  const valueOf = (row: number, field: CompanyField): unknown => {
    const column = columns.get(field);
    return column === undefined ? '' : cellAt(matrix, row, column);
  };

  /**
   * The gross total as the sheet displays it.
   *
   * Excel stores `3619` and keeps `0.00" Cr"` as a number format, so the printed
   * text is the only place the unit survives — a professionally formatted sheet
   * shows `3619.00 Cr` while its raw value is a plain number. The formatted cell
   * is therefore preferred, and the raw value is used only when it says more.
   */
  const moneyCellOf = (row: number): unknown => {
    const column = columns.get('grossTotal');
    const raw = valueOf(row, 'grossTotal');
    if (column === undefined || !options.formatted) return raw;
    const shown = text(cellAt(options.formatted, row, column));
    if (!shown) return raw;
    const shownUnit = unitMultiplierIn(shown);
    const rawUnit = unitMultiplierIn(text(raw));
    // Take the formatted text when it carries a unit the raw value lacks.
    return shownUnit !== rawUnit ? shown : raw;
  };

  /**
   * A heading such as `Gross Total (Cr)` states the unit for every cell below it,
   * where the cells themselves are bare numbers. Reading it here is what keeps
   * `3619` from being stored as three thousand rupees.
   */
  const grossColumn = columns.get('grossTotal');
  const grossLabel =
    grossColumn !== undefined && headerRow >= 0
      ? Array.from({ length: headerSpan })
          .map((_, offset) => text(cellAt(matrix, headerRow + offset, grossColumn)))
          .filter(Boolean)
          .join(' ')
      : '';
  const grossUnit = unitMultiplierIn(grossLabel);

  const byCompany = new Map<string, SheetCompanyRow>();
  let seen = 0;

  for (let row = dataStart; row < matrix.length; row += 1) {
    const company = text(valueOf(row, 'company'));
    if (!company || SUMMARY_ROW.test(company)) continue;
    // A repeated heading (page break, second table below) is not a company. Only
    // confident matches count, so a company whose name merely contains a field
    // word — "Late Supplier", "Company Stores" — is still read as data.
    if (strictHeadingCount(matrix, row, width) >= 2) continue;

    seen += 1;
    const key = company.toLowerCase();
    const existing = byCompany.get(key);
    const next: SheetCompanyRow = {
      company_name: company,
      supplier: text(valueOf(row, 'supplier')),
      po_number: text(valueOf(row, 'poNumber')),
      pay_terms: text(valueOf(row, 'payTerms')),
      // `3619.00 Cr` — or a bare `3619` under a `(Cr)` heading — is expanded to
      // whole rupees so totals stay comparable across companies.
      gross_total: parseMoney(moneyCellOf(row), grossUnit),
    };

    if (!existing) {
      byCompany.set(key, next);
      continue;
    }
    // The same company can be split across rows; keep the first value that exists.
    byCompany.set(key, {
      company_name: existing.company_name,
      supplier: existing.supplier || next.supplier,
      po_number: existing.po_number || next.po_number,
      pay_terms: existing.pay_terms || next.pay_terms,
      gross_total: existing.gross_total || next.gross_total,
    });
  }

  const missingColumns = FIELDS.filter((field) => !columns.has(field)).map((field) => REQUIRED_COLUMNS[field]);

  return {
    companies: Array.from(byCompany.values()),
    missingColumns,
    totalRows: seen,
    headerRow,
  };
};

/**
 * Items live in ONE column as readable lines, never as JSON:
 *
 *   1. MS Fabricated Bracket | 120 Nos
 *   2. Powder Coating | 120 Nos
 *
 * The Apps Script backend writes exactly this shape, and it is parsed back with
 * `parseItemCell` when a record is read.
 */
export const buildItemCell = (items: DraftItem[]): string =>
  items
    .map((item, index) => `${index + 1}. ${item.item_name} | ${item.quantity} ${item.unit}`.trim())
    .join('\n');

/** Splits one CSV line, honouring double quotes. */
const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

export const parseCsv = (raw: string): { headers: string[]; rows: Record<string, string>[] } => {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = cells[index] ?? '';
      return record;
    }, {});
  });

  return { headers, rows };
};

/** Operator import: Email and Name are required, mobile and SES code are optional. */
export const parseUserCsv = (raw: string) => {
  const { rows } = parseCsv(raw);
  return rows
    .map((record, index) => ({
      ses_code: text(record.SES || record.SESCode || record['SES Code']) || `SES-${1000 + index + 1}`,
      email: text(record.Email || record.email),
      name: text(record.Name || record.name),
      mobile: text(record.Mobile || record.mobile || record.Phone || record['Mobile Number']),
    }))
    .filter((row) => row.email && row.name);
};

export const parseItemCell = (raw: string): DraftItem[] => {
  const value = String(raw ?? '').trim();
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, quantityPart = ''] = line.split('|');
      const quantityText = quantityPart.trim() || namePart.trim();
      const name = quantityPart.trim() ? namePart.trim() : quantityText.replace(/[\d.,]+\s*\w*$/, '').trim();
      const amount = quantityText.match(/-?\d+(?:[.,]\d+)?/);
      const unitMatch = quantityText.match(/-?\d+(?:[.,]\d+)?\s*([A-Za-z]+)/);
      return {
        item_name: name || quantityText,
        quantity: amount ? toNumber(amount[0]) : 0,
        unit: unitMatch ? unitMatch[1] : 'Nos',
      };
    });
};
