'use client';

import { useEffect, useState } from 'react';
import { Paperclip, Pencil } from 'lucide-react';
import { InfoRow, Meter, Micro, Sheet, StepStamp, StatusTag } from './ui';
import { fmsApi } from '@/lib/api';
import { formatDate, formatDateTime, money, num, errorMessage } from '@/lib/format';
import {
  canEditStep,
  delayLabel,
  paidTotalOf,
  pendingAmountOf,
  receivedByItem,
  routeStateOf,
  stepStatusTone,
  totalQuantityOf,
} from '@/lib/fms/workflow';
import type { FmsEntryState, WorkflowStep } from '@/lib/fms/types';
import { ErrorStrip, Spinner } from './ui';

/**
 * One FMS record in full: company facts, the seven-step timeline with planned /
 * actual / delay, the stock-versus-direct split, attachments and payouts.
 */
export const FmsDetailSheet = ({
  open,
  fmsId,
  onClose,
  onOpenStep,
  refreshKey = 0,
}: {
  open: boolean;
  fmsId: string | null;
  onClose: () => void;
  onOpenStep: (state: FmsEntryState, step: WorkflowStep) => void;
  refreshKey?: number;
}) => {
  const [state, setState] = useState<FmsEntryState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !fmsId) return;
    let alive = true;
    setLoading(true);
    setError('');
    fmsApi
      .getFms(fmsId)
      .then((next) => {
        if (alive) setState(next);
      })
      .catch((caught) => {
        if (alive) setError(errorMessage(caught, 'That record could not be loaded.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, fmsId, refreshKey]);

  if (!open) return null;

  const me = state?.me ?? null;
  const route = state ? routeStateOf(state.allocations) : { hasStock: false, hasDirect: false, decided: false };
  const total = state ? totalQuantityOf(state.requirements) : 0;
  const alreadyReceived = state ? receivedByItem(state.receipts) : {};
  const paid = state ? paidTotalOf(state.payouts) : 0;
  const pending = state ? pendingAmountOf(state.record.gross_total, state.payouts) : 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={state ? `FMS ${state.record.pid || state.record.id}` : 'Loading'}
      title={state?.record.company_name ?? 'FMS record'}
      subtitle={
        state
          ? `${state.record.location} · PO ${state.record.po_number || '—'} · ${state.record.overall_status}`
          : 'Fetching the latest values'
      }
      width={900}
    >
      {loading && (
        <div className="flex items-center gap-2 py-6 text-[12px] text-[var(--muted)]">
          <Spinner dark />
          Loading record…
        </div>
      )}

      {error && <ErrorStrip message={error} />}

      {state && (
        <div className="space-y-4">
          <div className="card px-3 py-1">
            <div className="grid gap-x-6 sm:grid-cols-2">
              <div>
                <InfoRow label="Company" value={state.record.company_name} />
                <InfoRow label="Supplier" value={state.record.supplier} />
                <InfoRow label="PO number" value={state.record.po_number} />
                <InfoRow label="PO date" value={formatDate(state.record.po_date)} />
                <InfoRow label="Delivery date" value={formatDate(state.record.delivery_date)} />
              </div>
              <div>
                <InfoRow label="Lead days" value={state.record.lead_days || '—'} />
                <InfoRow label="Pay terms" value={state.record.pay_terms ? `${state.record.pay_terms} days` : '—'} />
                <InfoRow label="Gross total" value={money(state.record.gross_total)} />
                <InfoRow label="Mobile" value={state.record.mobile} />
                <InfoRow label="Email" value={state.record.email} />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-[var(--line)] py-1.5">
              <InfoRow label="Filled by" value={state.record.form_filled_by} />
              <InfoRow label="Submitted" value={formatDateTime(state.record.submitted_display)} />
              {state.record.remark && <InfoRow label="Remark" value={state.record.remark} />}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Micro>Items</Micro>
              <Micro>Total {num(total)}</Micro>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                    <th className="py-1.5 font-semibold">Item</th>
                    <th className="py-1.5 text-right font-semibold">Quantity</th>
                    <th className="py-1.5 text-right font-semibold">Received</th>
                    <th className="py-1.5 text-right font-semibold">Route</th>
                  </tr>
                </thead>
                <tbody>
                  {state.requirements.map((item) => {
                    const got = alreadyReceived[item.item_name] ?? 0;
                    // One item can split across both routes, so every line is shown.
                    const lines = state.allocations.filter((line) => line.item_name === item.item_name);
                    return (
                      <tr key={item.item_name} className="border-b border-[var(--line)]/60">
                        <td className="py-1.5 text-[var(--ink)]">{item.item_name}</td>
                        <td className="mono py-1.5 text-right text-[var(--muted)]">
                          {num(item.quantity)} {item.unit}
                        </td>
                        <td className="mono py-1.5 text-right">
                          <span style={{ color: got >= item.quantity ? 'var(--forest)' : 'var(--amber)' }}>{num(got)}</span>
                        </td>
                        <td className="py-1.5 text-right">
                          {lines.length > 0 ? (
                            <span className="flex flex-wrap items-center justify-end gap-1">
                              {lines.map((line) => (
                                <span key={line.route} className="inline-flex items-center gap-1">
                                  <span className="mono text-[10.5px] text-[var(--muted)]">
                                    {num(line.quantity)}
                                  </span>
                                  <StatusTag
                                    label={line.route === 'Stock' ? 'Stock' : 'Direct'}
                                    tone={line.route === 'Stock' ? 'petrol' : 'amber'}
                                  />
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--faint)]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {route.decided && (
            <div className="sunken flex flex-wrap items-center gap-3 px-3 py-2">
              <Micro>Routes</Micro>
              <span className={`tag ${route.hasStock ? 'tag-petrol' : 'tag-quiet'}`}>
                Stock {route.hasStock ? 'active' : 'not used'}
              </span>
              <span className={`tag ${route.hasDirect ? 'tag-amber' : 'tag-quiet'}`}>
                Direct {route.hasDirect ? 'active' : 'not used'}
              </span>
              <span className="ml-auto text-[11px] text-[var(--muted)]">
                {route.hasStock && route.hasDirect
                  ? 'Steps 4–6 and step 7 run in parallel.'
                  : route.hasStock
                    ? 'Steps 4–6 run, step 7 on the payout clock.'
                    : 'Steps 4–6 skipped — everything went direct.'}
              </span>
            </div>
          )}

          <div>
            <Micro>Timeline</Micro>
            <ol className="mt-2 space-y-2">
              {state.steps.map((step) => {
                const editable = me ? canEditStep(me, step.step_number) : false;
                const canSubmit =
                  editable &&
                  step.unlocked &&
                  !state.record.is_stopped &&
                  !['Completed', 'Skipped', 'Locked'].includes(step.status);
                return (
                  <li key={step.step_number} className="flex gap-2.5">
                    <div className="flex flex-col items-center">
                      <StepStamp
                        step={step.status === 'Completed' ? '✓' : step.step_number}
                        tone={stepStatusTone(step)}
                        outline={step.status === 'Locked'}
                      />
                      <span className="mt-1 w-px flex-1 bg-[var(--line)]" aria-hidden="true" />
                    </div>

                    <div className="min-w-0 flex-1 rounded-[8px] border border-[var(--line)] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[12.5px] font-semibold text-[var(--ink)]">{step.step_name}</p>
                        <StatusTag label={step.status} tone={stepStatusTone(step)} />
                        {step.route_id !== 'COMMON' && (
                          <span className="tag tag-quiet">{step.route_id === 'STOCK' ? 'Stock' : 'Direct'}</span>
                        )}
                        {(step.part_count > 1 || (step.step_number === 2 && step.part_count > 0)) && (
                          <span className="mono text-[10px] text-[var(--muted)]">part {step.part_count}</span>
                        )}
                        {canSubmit && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm ml-auto"
                            onClick={() => onOpenStep(state, step)}
                          >
                            <Pencil className="h-3 w-3" />
                            Submit
                          </button>
                        )}
                      </div>

                      <div className="mt-1 grid gap-x-4 gap-y-0.5 text-[11px] text-[var(--muted)] sm:grid-cols-3">
                        <span>Planned: {formatDateTime(step.planned_at)}</span>
                        <span>Actual: {step.actual_completed_at ? formatDateTime(step.actual_completed_at) : '—'}</span>
                        <span>
                          Delay:{' '}
                          <span
                            style={{
                              color:
                                step.delay_display.includes('late') || step.delay_display === 'Overdue'
                                  ? 'var(--rust)'
                                  : step.delay_display === 'On time'
                                    ? 'var(--forest)'
                                    : undefined,
                            }}
                          >
                            {step.step_number === 7 && !step.actual_completed_at
                              ? delayLabel(step.planned_at, null)
                              : step.delay_display || '—'}
                          </span>
                        </span>
                      </div>

                      {step.remark && (
                        <p className="mt-1 text-[11.5px] text-[var(--ink-2)]">
                          <span className="font-semibold">Remark:</span> {step.remark}
                        </p>
                      )}
                      {step.completed_by && (
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">Submitted by {step.completed_by}</p>
                      )}

                      {step.step_number === 2 && state.receipts.length > 0 && (
                        <ul className="mt-1.5 space-y-1 border-t border-[var(--line)]/60 pt-1.5">
                          {state.receipts.map((part) => (
                            <li key={part.part_number} className="text-[11px] text-[var(--ink-2)]">
                              <span className="mono text-[10px] text-[var(--muted)]">Part {part.part_number}</span>{' '}
                              {formatDateTime(part.received_at)} —{' '}
                              {(part.lines ?? [])
                                .filter((line) => line.received > 0)
                                .map((line) => `${line.item_name} ${num(line.received)} ${line.unit}`)
                                .join(', ') || 'nothing received'}
                              {(part.attachments ?? []).length > 0 && (
                                <span className="mono ml-1 text-[10px] text-[var(--muted)]">
                                  · {(part.attachments ?? []).length} file(s)
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {step.step_number === 3 && state.allocations.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 border-t border-[var(--line)]/60 pt-1.5">
                          {state.allocations.map((line, index) => (
                            // One material can be split across both routes, so the
                            // name alone is not unique — the index keeps React keys stable.
                            <li
                              key={`${line.item_name}|${line.route}|${index}`}
                              className="flex items-center gap-2 text-[11px]"
                            >
                              <span className="min-w-0 flex-1 truncate text-[var(--ink-2)]">{line.item_name}</span>
                              <span className="mono text-[var(--muted)]">
                                {num(line.quantity)} {line.unit}
                              </span>
                              <StatusTag
                                label={line.route === 'Stock' ? 'Stock' : 'Direct'}
                                tone={line.route === 'Stock' ? 'petrol' : 'amber'}
                              />
                            </li>
                          ))}
                        </ul>
                      )}

                      {step.step_number === 4 && state.grn && (
                        <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                          GRN <span className="mono">{state.grn.grn_number}</span> ·{' '}
                          {state.grn.lines.map((line) => `${num(line.quantity)} ${line.unit}`).join(', ')}
                        </p>
                      )}

                      {step.step_number === 5 && state.ims && (
                        <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                          IMS posted: <strong>{state.ims.answer}</strong>
                          {state.ims.grn_number ? ` · GRN ${state.ims.grn_number}` : ''}
                        </p>
                      )}

                      {step.step_number === 6 && state.tally && (
                        <p className="mt-1 text-[11px] text-[var(--ink-2)]">
                          Bill posted in Tally and approved by ABS.
                        </p>
                      )}

                      {step.step_number === 7 && (
                        <div className="mt-1.5 border-t border-[var(--line)]/60 pt-1.5">
                          <Meter value={paid} max={state.record.gross_total} unit="₹" tone={pending > 0 ? 'amber' : 'forest'} />
                          <p className="mono mt-0.5 text-[10.5px] text-[var(--muted)]">
                            Paid {money(paid)} · Remaining {money(pending)}
                          </p>
                          {state.payouts.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {state.payouts.map((payout) => (
                                <li key={payout.part_number} className="flex flex-wrap gap-2 text-[11px]">
                                  <span className="mono text-[10px] text-[var(--muted)]">#{payout.part_number}</span>
                                  <span className="mono font-semibold text-[var(--ink)]">{money(payout.amount)}</span>
                                  <span className="text-[var(--muted)]">{formatDateTime(payout.paid_at)}</span>
                                  {payout.remark && <span className="text-[var(--muted)]">· {payout.remark}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {state.attachments.length > 0 && (
            <div>
              <Micro>Attachments</Micro>
              <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {state.attachments.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-2 rounded-[6px] border border-[var(--line)] px-2 py-1"
                  >
                    <Paperclip className="h-3 w-3 shrink-0 text-[var(--muted)]" />
                    <a
                      href={file.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--petrol)] underline underline-offset-2"
                    >
                      {file.filename}
                    </a>
                    <span className="mono shrink-0 text-[9.5px] text-[var(--muted)]">step {file.step_number}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
};
