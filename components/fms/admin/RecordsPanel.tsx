'use client';

import { useMemo, useState } from 'react';
import { FileSpreadsheet, Search } from 'lucide-react';
import { RecordBoxList } from '../RecordBox';
import { formatDateTime } from '@/lib/format';
import { dateKey, isOverdueKey } from '@/lib/fms/workflow';
import type { FmsSummary } from '@/lib/fms/types';

type Filter = 'all' | 'open' | 'overdue' | 'completed' | 'stopped';

/**
 * The FMS register: one box per company, with the current step, its planned date,
 * the delay and how much payout is still outstanding. Opening a box shows all
 * seven steps of that record.
 */
export const RecordsPanel = ({
  records,
  onOpen,
  onNew,
}: {
  records: FmsSummary[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('open');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return records.filter((record) => {
      if (filter === 'open' && (record.is_completed || record.is_stopped)) return false;
      if (filter === 'completed' && !record.is_completed) return false;
      if (filter === 'stopped' && !record.is_stopped) return false;
      if (filter === 'overdue') {
        if (record.is_completed || !record.planned_at) return false;
        if (!isOverdueKey(dateKey(record.planned_at))) return false;
      }
      if (!term) return true;
      return [record.company_name, record.supplier, record.po_number, record.id, record.location]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [records, query, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">FMS register</h1>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            {records.length} records · {filtered.length} shown
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onNew}>
          <FileSpreadsheet className="h-3.5 w-3.5" />
          New FMS form
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
          <input
            className="input pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company, supplier, PO or FMS number"
            aria-label="Search records"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { key: 'open', label: 'Open' },
              { key: 'overdue', label: 'Overdue' },
              { key: 'completed', label: 'Completed' },
              { key: 'stopped', label: 'Stopped' },
              { key: 'all', label: 'All' },
            ] as { key: Filter; label: string }[]
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`rounded-[6px] border px-2.5 py-1 text-[11.5px] font-medium ${
                filter === option.key
                  ? 'border-[var(--petrol)] bg-[var(--petrol-tint)] text-[var(--petrol)]'
                  : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-2)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <RecordBoxList
        records={filtered}
        onOpen={onOpen}
        emptyTitle="No records match"
        emptyDescription="Clear the search or change the filter. New records appear here as soon as the primary form is submitted."
      />

      <p className="mono text-[10px] text-[var(--faint)]">
        Submitted timestamps use the dd Mon yyyy hh:mm:ss AM/PM format throughout.
        <span className="ml-2">Latest: {formatDateTime(records[0]?.submitted_display)}</span>
      </p>
    </div>
  );
};
