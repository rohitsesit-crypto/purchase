'use client';

import { ChevronRight } from 'lucide-react';
import { EmptyState, Micro, StatusTag } from './ui';
import { formatDate, money } from '@/lib/format';
import { dateKey, isOverdueKey } from '@/lib/fms/workflow';
import type { FmsSummary } from '@/lib/fms/types';

/**
 * One company, one box.
 *
 * Every module lists records this way: the box carries only the headline facts —
 * company, supplier, PO, where the job currently sits and what is still payable.
 * Opening it reveals the full seven-step timeline, because seven steps of detail
 * inside a list would bury the one thing the list is for.
 */
export const RecordBox = ({
  record,
  onOpen,
  today,
}: {
  record: FmsSummary;
  onOpen: (id: string) => void;
  /** Passed in from mounted state so no clock is read while prerendering. */
  today?: string;
}) => {
  const plannedKey = record.planned_at ? dateKey(record.planned_at) : '';
  const overdue =
    !record.is_completed && !record.is_stopped && Boolean(plannedKey) && isOverdueKey(plannedKey, today);
  const accent = record.is_stopped
    ? 'var(--rust)'
    : record.is_completed
      ? 'var(--forest)'
      : overdue
        ? 'var(--rust)'
        : 'var(--petrol)';

  return (
    <article
      className="task-card cursor-pointer rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
      style={{ borderLeft: `3px solid ${accent}` }}
      onClick={() => onOpen(record.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(record.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${record.company_name}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="min-w-0 truncate text-[13px] font-semibold text-[var(--ink)]">{record.company_name}</h3>
            <span className="mono shrink-0 rounded-[4px] bg-[var(--sunken)] px-1 py-[1px] text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
              {record.location}
            </span>
            <StatusTag label={record.overall_status} />
          </div>
          <p className="mono mt-0.5 truncate text-[10px] text-[var(--muted)]">
            {record.pid ? `${record.pid} · ` : ''}
            {record.id} · PO {record.po_number || '—'}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-[var(--ink-2)]">
            Name of client: {record.supplier || '—'}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-outline btn-sm shrink-0"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(record.id);
          }}
        >
          Open
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-2 grid gap-x-4 gap-y-1 border-t border-[var(--line)] pt-1.5 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Micro>Current step</Micro>
          <p className="truncate text-[var(--ink-2)]">
            {record.current_step}. {record.current_step_name}
          </p>
        </div>
        <div>
          <Micro>Planned</Micro>
          <p className="mono text-[var(--muted)]">{record.planned_at ? formatDate(record.planned_at) : '—'}</p>
        </div>
        <div>
          <Micro>Delay</Micro>
          <p
            className="mono"
            style={{ color: overdue ? 'var(--rust)' : 'var(--muted)' }}
          >
            {record.delay_display || '—'}
          </p>
        </div>
        <div>
          <Micro>Payout pending</Micro>
          <p className="mono" style={{ color: record.pending_amount > 0 ? 'var(--amber)' : 'var(--forest)' }}>
            {record.pending_amount > 0 ? money(record.pending_amount) : 'Settled'}
          </p>
        </div>
      </div>

      <p className="mono mt-1 text-[9.5px] text-[var(--faint)]">
        Gross {money(record.gross_total)} · paid {money(record.paid_amount)}
      </p>
    </article>
  );
};

/** A stack of company boxes. Records keep the order the caller supplied. */
export const RecordBoxList = ({
  records,
  onOpen,
  today,
  emptyTitle = 'No records match',
  emptyDescription = 'Clear the search or change the filter.',
}: {
  records: FmsSummary[];
  onOpen: (id: string) => void;
  today?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) => {
  if (!records.length) {
    return (
      <div className="card">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {records.map((record) => (
        <li key={record.id}>
          <RecordBox record={record} onOpen={onOpen} today={today} />
        </li>
      ))}
    </ul>
  );
};

