'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Eye, FileSpreadsheet, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Field, Micro, Sheet } from './ui';
import { fmsApi } from '@/lib/api';
import { parseCompanySheet } from '@/lib/excel';
import type { ClientRecord, CompanyDraft, SheetCompanyRow } from '@/lib/fms/types';
import { errorMessage, money, requestKey } from '@/lib/format';

/**
 * Fields the workbook supplies, and fields the operator types.
 *
 *   Particulars        → Company name
 *   Supplier           → Name of client
 *   Order Reference No.→ PO number
 *   Terms of Payment   → Pay terms
 *   Gross Total        → Gross total
 *   (typed)            → Mobile, Email, Lead days, Delivery date, PO date
 */
const FROM_SHEET: (keyof SheetCompanyRow & string)[] = [
  'company_name',
  'supplier',
  'po_number',
  'pay_terms',
  'gross_total',
];

const blankCompany = (row: SheetCompanyRow): CompanyDraft => ({
  company_name: row.company_name,
  supplier: row.supplier,
  po_number: row.po_number,
  mobile: '',
  email: '',
  lead_days: 0,
  pay_terms: row.pay_terms,
  delivery_date: '',
  po_date: '',
  gross_total: row.gross_total,
  items: [],
});

/** A block is complete once every typed field is filled and it has at least one item. */
const isReady = (company: CompanyDraft) =>
  Boolean(
    company.company_name &&
      company.mobile.trim() &&
      company.email.trim() &&
      Number(company.lead_days) > 0 &&
      company.delivery_date &&
      company.po_date &&
      company.items.length > 0,
  );

const itemTotal = (company: CompanyDraft) =>
  company.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

/**
 * Primary information form.
 *
 * Upload the supplier workbook once. Every company in it becomes its own block
 * showing what the sheet supplied, with ADD for the details still missing and
 * VIEW for a read-only check. Mobile and email are remembered per company, so a
 * second upload fills them in automatically. Submitting creates one FMS per
 * company, each with its own seven-step tracker.
 */
export const PrimaryFormSheet = ({
  open,
  people = [],
  onClose,
  onSubmitted,
}: {
  open: boolean;
  /**
   * Optional seed for the "Form filled by" list.
   *
   * The sheet fetches the real people itself, because both `listTasks` and
   * `getAdminData` already return `form_filled_by`. Keeping this optional means
   * the mounting pages never need to pass it — and can never hit a prop-type
   * mismatch — while a caller that already has the list can still supply it.
   */
  people?: string[];
  onClose: () => void;
  onSubmitted: (count: number, ids: string[]) => void;
}) => {
  const [stage, setStage] = useState<'upload' | 'list' | 'company' | 'view'>('upload');
  const [location, setLocation] = useState<'Mumbai' | 'Boisar'>('Mumbai');
  const [companies, setCompanies] = useState<CompanyDraft[]>([]);
  const [memory, setMemory] = useState<ClientRecord[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [draft, setDraft] = useState<CompanyDraft | null>(null);
  const [formFilledBy, setFormFilledBy] = useState('');
  const [fetchedPeople, setFetchedPeople] = useState<string[]>([]);
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStage('upload');
    setCompanies([]);
    setMissing([]);
    setFileName('');
    setEditing(null);
    setViewing(null);
    setDraft(null);
    setRemark('');
    setError('');
    setBusy(false);
    fmsApi
      .getClients()
      .then(setMemory)
      .catch(() => setMemory([]));
    // The list of real people comes from the backend, so the dropdown matches the
    // AppUsers sheet and no name is ever baked into the interface.
    if (people.length === 0) {
      fmsApi
        .formFilledBy()
        .then(setFetchedPeople)
        .catch(() => setFetchedPeople([]));
    }
  }, [open, people.length]);

  const memoryFor = (name: string) =>
    memory.find((client) => client.company_name.toLowerCase() === name.trim().toLowerCase());

  /**
   * The dropdown options: whatever the page supplied, plus whatever this sheet
   * fetched, de-duplicated. Never a hard-coded name list.
   */
  const peopleChoices = useMemo(() => {
    const seen = new Set<string>();
    return [...people, ...fetchedPeople]
      .map((person) => String(person ?? '').trim())
      .filter((person) => {
        if (!person) return false;
        const key = person.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [people, fetchedPeople]);

  const handleFile = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      // A workbook often opens on a cover or instructions tab, so every sheet is
      // parsed and the one holding the most companies wins.
      const sheets = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        // header:1 keeps raw cell positions, which lets the parser find the
        // header row and columns wherever they sit.
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true });
        // The same grid with numbers rendered as the sheet displays them, so a
        // crore-formatted cell arrives as "3619.00 Cr" instead of a bare 3619.
        const formatted = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
          blankrows: true,
          raw: false,
        });
        return { name, matrix, parsed: parseCompanySheet(matrix, { formatted }) };
      });

      const best = sheets.reduce((left, right) =>
        right.parsed.companies.length > left.parsed.companies.length ? right : left,
      );

      if (!best.matrix.length) throw new Error('That sheet has no rows to read.');

      const parsed = best.parsed;
      if (!parsed.companies.length) {
        throw new Error(
          'No company rows found. The sheet needs a column holding the company name — it is usually titled Particulars.',
        );
      }

      setMissing(parsed.missingColumns);
      setFileName(file.name);
      setCompanies(
        parsed.companies.map((row) => {
          const known = memoryFor(row.company_name);
          return {
            ...blankCompany(row),
            mobile: known?.mobile ?? '',
            email: known?.email ?? '',
          };
        }),
      );
      setStage('list');
    } catch (caught) {
      setError(errorMessage(caught, 'That file could not be read.'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /** ADD opens a block for editing; the typed fields are what it is for. */
  const openAdd = (index: number) => {
    setEditing(index);
    setDraft({ ...companies[index], items: companies[index].items.map((item) => ({ ...item })) });
    setError('');
    setStage('company');
  };

  /** VIEW shows the block exactly as it will be submitted. */
  const openView = (index: number) => {
    setViewing(index);
    setStage('view');
  };

  const saveCompany = () => {
    if (editing === null || !draft) return;
    if (!draft.mobile.trim()) return setError('Mobile number is required.');
    if (!draft.email.trim()) return setError('Email is required.');
    if (Number(draft.lead_days) <= 0) return setError('Lead days must be greater than zero.');
    if (!draft.po_date) return setError('PO date is required.');
    if (!draft.delivery_date) return setError('Delivery date is required.');
    if (!draft.items.length) return setError('Add at least one item.');
    if (draft.items.some((item) => !item.item_name.trim() || Number(item.quantity) <= 0)) {
      return setError('Every item needs a name and a quantity greater than zero.');
    }
    setError('');
    setCompanies((current) => current.map((company, index) => (index === editing ? draft : company)));
    setStage('list');
    setEditing(null);
    setDraft(null);
  };

  const submit = async () => {
    const incomplete = companies.filter((company) => !isReady(company));
    if (incomplete.length) {
      setError(
        `Complete these blocks first — ${incomplete.map((company) => company.company_name).join(', ')}. ` +
          'Each one needs mobile, email, lead days, PO date, delivery date and at least one item.',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await fmsApi.submitNewFms(
        { location, form_filled_by: formFilledBy, remark, companies },
        requestKey(),
      );
      onSubmitted(result.fms_ids.length, result.fms_ids);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, 'The form could not be submitted.'));
    } finally {
      setBusy(false);
    }
  };

  const readyCount = useMemo(() => companies.filter(isReady).length, [companies]);
  const viewingCompany = viewing !== null ? companies[viewing] : null;

  const footer =
    stage === 'company' ? (
      <>
        <button type="button" className="btn btn-outline" onClick={() => setStage('list')}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={saveCompany}>
          <Check className="h-3.5 w-3.5" />
          OK
        </button>
      </>
    ) : stage === 'view' ? (
      <>
        <button type="button" className="btn btn-outline" onClick={() => setStage('list')}>
          Back
        </button>
        {viewing !== null && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const index = viewing;
              setStage('list');
              setViewing(null);
              openAdd(index);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit this block
          </button>
        )}
      </>
    ) : stage === 'list' ? (
      <>
        <button type="button" className="btn btn-outline" onClick={() => setStage('upload')}>
          Different file
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={busy || readyCount !== companies.length}
        >
          {busy ? 'Creating FMS…' : `Submit ${companies.length || ''} ${companies.length === 1 ? 'FMS' : 'FMS records'}`}
        </button>
      </>
    ) : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="Purchase FMS"
      title="Primary information"
      subtitle={
        stage === 'company' && draft
          ? `Add details — ${draft.company_name}`
          : stage === 'view' && viewingCompany
            ? `View — ${viewingCompany.company_name}`
            : stage === 'list'
              ? `${companies.length} companies from ${fileName}`
              : 'Choose a location, then upload the supplier workbook'
      }
      width={1000}
      footer={footer}
    >
      {error && (
        <p className="mb-3 rounded-[7px] border border-[var(--rust)]/30 bg-[var(--rust-tint)] px-3 py-2 text-[12px] font-medium text-[var(--rust)]">
          {error}
        </p>
      )}

      {stage === 'upload' && (
        <div className="space-y-4">
          <Field label="Location" required hint="applies to every company in this upload">
            <div className="flex gap-2">
              {(['Mumbai', 'Boisar'] as const).map((office) => (
                <button
                  key={office}
                  type="button"
                  onClick={() => setLocation(office)}
                  aria-pressed={location === office}
                  className={`rounded-[7px] border px-4 py-2 text-[12.5px] font-medium ${
                    location === office
                      ? 'border-[var(--petrol)] bg-[var(--petrol-tint)] text-[var(--petrol)]'
                      : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-2)] hover:bg-[var(--sunken)]'
                  }`}
                >
                  {office}
                </button>
              ))}
            </div>
          </Field>

          <div className="sunken flex flex-col items-start gap-3 px-4 py-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface)] text-[var(--petrol)]">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-[var(--ink)]">Upload the purchase workbook</p>
              <p className="mt-0.5 max-w-[600px] text-[12px] leading-relaxed text-[var(--muted)]">
                Columns are found by their names, not by position — titles may sit anywhere in the sheet. Read from the
                file: <span className="mono text-[11px]">Particulars</span> (company),{' '}
                <span className="mono text-[11px]">Supplier</span> (name of client),{' '}
                <span className="mono text-[11px]">Order Reference No.</span>,{' '}
                <span className="mono text-[11px]">Terms of Payment</span> and{' '}
                <span className="mono text-[11px]">Gross Total</span>. Mobile, email, lead days, PO date and delivery
                date are typed per company afterwards.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="h-3.5 w-3.5" />
              {busy ? 'Reading file…' : 'Choose file'}
            </button>
          </div>
        </div>
      )}

      {stage === 'list' && (
        <div className="space-y-3">
          {missing.length > 0 && (
            <p className="rounded-[7px] border border-[var(--amber)]/40 bg-[var(--amber-tint)] px-3 py-2 text-[11.5px] text-[var(--amber)]">
              These columns were not found in the file and will stay blank: {missing.join(', ')}.
            </p>
          )}

          <div className="flex items-center justify-between">
            <Micro>
              {readyCount} of {companies.length} blocks complete
            </Micro>
            <Micro>{location}</Micro>
          </div>

          <ul className="space-y-2">
            {companies.map((company, index) => {
              const ready = isReady(company);
              return (
                <li key={`${company.company_name}-${index}`} className="card task-card px-3 py-2.5">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[13px] font-semibold text-[var(--ink)]">{company.company_name}</p>
                        <span className={`tag ${ready ? 'tag-forest' : 'tag-amber'}`}>
                          {ready ? 'Ready' : 'Needs details'}
                        </span>
                      </div>
                      <div className="mt-1 grid gap-x-5 gap-y-0.5 text-[11px] text-[var(--muted)] sm:grid-cols-2">
                        <span>Name of client: {company.supplier || '—'}</span>
                        <span>PO number: {company.po_number || '—'}</span>
                        <span>Pay terms: {company.pay_terms || '—'}</span>
                        <span>Gross total: {money(company.gross_total)}</span>
                        <span>Mobile: {company.mobile || 'not entered'}</span>
                        <span>Email: {company.email || 'not entered'}</span>
                        {company.items.length > 0 && (
                          <>
                            <span>
                              Items: {company.items.length} · qty {itemTotal(company)}
                            </span>
                            <span>Lead days: {company.lead_days || '—'}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        className={`btn btn-sm ${ready ? 'btn-outline' : 'btn-primary'}`}
                        onClick={() => openAdd(index)}
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => openView(index)}
                        disabled={!company.items.length && !company.mobile && !company.email}
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="grid gap-3 border-t border-[var(--line)] pt-3 sm:grid-cols-2">
            <Field label="Form filled by" required htmlFor="form-filled-by">
              <select
                id="form-filled-by"
                className="input"
                value={formFilledBy}
                onChange={(event) => setFormFilledBy(event.target.value)}
              >
                {peopleChoices.length === 0 && <option value="">No users yet</option>}
                {peopleChoices.map((person) => (
                  <option key={person} value={person}>
                    {person}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Remark" hint="optional" htmlFor="form-remark">
              <input
                id="form-remark"
                className="input"
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="Anything the purchase desk should know"
              />
            </Field>
          </div>

          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            Submitting creates one FMS per company — {companies.length}{' '}
            {companies.length === 1 ? 'record' : 'records'}, each with its own seven-step tracker.
          </p>
        </div>
      )}

      {stage === 'company' && draft && (
        <div className="space-y-3">
          <div className="sunken px-3 py-2">
            <Micro>From the sheet</Micro>
            <div className="mt-1 grid gap-x-5 gap-y-1 text-[11.5px] text-[var(--ink-2)] sm:grid-cols-2">
              <span>Company: {draft.company_name}</span>
              <span>Name of client: {draft.supplier || '—'}</span>
              <span>PO number: {draft.po_number || '—'}</span>
              <span>Pay terms: {draft.pay_terms || '—'}</span>
              <span>Gross total: {money(draft.gross_total)}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mobile number" required htmlFor="draft-mobile" hint="remembered for next time">
              <input
                id="draft-mobile"
                type="tel"
                className="input"
                value={draft.mobile}
                onChange={(event) => setDraft({ ...draft, mobile: event.target.value })}
                placeholder="+91 98200 00000"
              />
            </Field>
            <Field label="Email" required htmlFor="draft-email" hint="remembered for next time">
              <input
                id="draft-email"
                type="email"
                className="input"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                placeholder="purchase@company.in"
              />
            </Field>
            <Field label="Lead days" required hint="typed every time">
              <input
                type="number"
                min={1}
                className="input"
                value={draft.lead_days || ''}
                onChange={(event) => setDraft({ ...draft, lead_days: Number(event.target.value) })}
              />
            </Field>
            <Field label="Pay terms" hint="days, from the sheet">
              <input
                className="input"
                value={draft.pay_terms}
                onChange={(event) => setDraft({ ...draft, pay_terms: event.target.value })}
                placeholder="30"
              />
            </Field>
            <Field label="PO date" required>
              <input
                type="date"
                className="input"
                value={draft.po_date}
                onChange={(event) => setDraft({ ...draft, po_date: event.target.value })}
              />
            </Field>
            <Field label="Delivery date" required>
              <input
                type="date"
                className="input"
                value={draft.delivery_date}
                onChange={(event) => setDraft({ ...draft, delivery_date: event.target.value })}
              />
            </Field>
          </div>

          <div className="border-t border-[var(--line)] pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[12.5px] font-semibold text-[var(--ink)]">Items</p>
                <p className="text-[11px] text-[var(--muted)]">Item name, quantity and unit — add as many as needed.</p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() =>
                  setDraft({ ...draft, items: [...draft.items, { item_name: '', quantity: 0, unit: 'Nos' }] })
                }
              >
                <Plus className="h-3 w-3" />
                Add item
              </button>
            </div>

            {draft.items.length === 0 ? (
              <p className="rounded-[7px] border border-dashed border-[var(--line-strong)] px-3 py-4 text-center text-[11.5px] text-[var(--muted)]">
                No items yet. Add the first item for this company.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {draft.items.map((item, index) => (
                  <li key={index} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[160px] flex-1">
                      <input
                        className="input"
                        value={item.item_name}
                        placeholder="Item name"
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            items: draft.items.map((entry, position) =>
                              position === index ? { ...entry, item_name: event.target.value } : entry,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="w-[92px]">
                      <input
                        type="number"
                        min={0}
                        className="input"
                        value={item.quantity || ''}
                        placeholder="Qty"
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            items: draft.items.map((entry, position) =>
                              position === index ? { ...entry, quantity: Number(event.target.value) } : entry,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="w-[86px]">
                      <input
                        className="input"
                        value={item.unit}
                        placeholder="Unit"
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            items: draft.items.map((entry, position) =>
                              position === index ? { ...entry, unit: event.target.value } : entry,
                            ),
                          })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Remove ${item.item_name || 'item'}`}
                      onClick={() =>
                        setDraft({ ...draft, items: draft.items.filter((_, position) => position !== index) })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {draft.items.length > 0 && (
              <p className="mono mt-2 text-[10.5px] text-[var(--muted)]">
                Total quantity: {itemTotal(draft)} {draft.items[0]?.unit ?? ''}
              </p>
            )}
          </div>

          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStage('list')}>
            <ArrowLeft className="h-3 w-3" />
            Back to companies
          </button>
        </div>
      )}

      {stage === 'view' && viewingCompany && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-[var(--ink)]">{viewingCompany.company_name}</p>
            <span className={`tag ${isReady(viewingCompany) ? 'tag-forest' : 'tag-amber'}`}>
              {isReady(viewingCompany) ? 'Ready' : 'Needs details'}
            </span>
          </div>

          <div className="grid gap-x-5 gap-y-1.5 text-[12px] sm:grid-cols-2">
            {[
              ['Company name', viewingCompany.company_name],
              ['Name of client', viewingCompany.supplier || '—'],
              ['PO number', viewingCompany.po_number || '—'],
              ['Pay terms', viewingCompany.pay_terms || '—'],
              ['Gross total', money(viewingCompany.gross_total)],
              ['Location', location],
              ['Mobile number', viewingCompany.mobile || '—'],
              ['Email', viewingCompany.email || '—'],
              ['Lead days', viewingCompany.lead_days || '—'],
              ['PO date', viewingCompany.po_date || '—'],
              ['Delivery date', viewingCompany.delivery_date || '—'],
              ['Form filled by', formFilledBy],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-2 border-b border-[var(--line)]/60 py-1">
                <span className="w-[118px] shrink-0 text-[11px] font-semibold text-[var(--muted)]">{label}</span>
                <span className="min-w-0 flex-1 break-words text-[var(--ink)]">{value}</span>
              </div>
            ))}
            {remark && (
              <div className="flex items-baseline gap-2 py-1 sm:col-span-2">
                <span className="w-[118px] shrink-0 text-[11px] font-semibold text-[var(--muted)]">Remark</span>
                <span className="min-w-0 flex-1 break-words text-[var(--ink)]">{remark}</span>
              </div>
            )}
          </div>

          <div>
            <Micro className="mb-1 block">Items</Micro>
            {viewingCompany.items.length === 0 ? (
              <p className="rounded-[7px] border border-dashed border-[var(--line-strong)] px-3 py-3 text-center text-[11.5px] text-[var(--muted)]">
                No items added yet.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)] rounded-[7px] border border-[var(--line)]">
                {viewingCompany.items.map((item, index) => (
                  <li key={index} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                    <span className="mono w-5 shrink-0 text-[10px] text-[var(--faint)]">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{item.item_name}</span>
                    <span className="mono shrink-0 text-[11px] text-[var(--ink-2)]">
                      {item.quantity} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {viewingCompany.items.length > 0 && (
              <p className="mono mt-1.5 text-[10.5px] text-[var(--muted)]">
                Total quantity: {itemTotal(viewingCompany)} {viewingCompany.items[0]?.unit ?? ''}
              </p>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
};
