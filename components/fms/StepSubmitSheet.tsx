'use client';

import { useEffect, useMemo, useState } from 'react';
import { Paperclip, Trash2, Upload } from 'lucide-react';
import { Field, Micro, Sheet } from './ui';
import { fmsApi } from '@/lib/api';
import {
  formatDate,
  formatDateTime,
  money,
  num,
  errorMessage,
} from '@/lib/format';
import {
  allocatedByItem,
  delayLabel,
  paidTotalOf,
  pendingAmountOf,
  receivedByItem,
  totalQuantityOf,
} from '@/lib/fms/workflow';
import type {
  AllocationSubmission,
  FmsEntryState,
  GrnSubmission,
  MaterialRoute,
  PayoutSubmission,
  ReceiptSubmission,
  VerificationSubmission,
  WorkflowStep,
} from '@/lib/fms/types';

type UploadedFile = { filename: string; object_key: string; mime_type: string; size_bytes: number };

const AttachmentPicker = ({
  files,
  onChange,
  hint,
}: {
  files: UploadedFile[];
  onChange: (next: UploadedFile[]) => void;
  hint: string;
}) => (
  <div>
    <div className="flex items-center gap-2">
      <label className="btn btn-outline btn-sm cursor-pointer">
        <Upload className="h-3 w-3" />
        Add files
        <input
          type="file"
          multiple
          className="hidden"
          onChange={async (event) => {
            const list = Array.from(event.target.files ?? []);
            const uploaded: UploadedFile[] = [];
            for (const file of list) {
              const result = await fmsApi.uploadAttachment(file, 'pending', 0);
              uploaded.push({
                filename: result.filename,
                object_key: result.file_url,
                mime_type: result.mime_type,
                size_bytes: result.size_bytes,
              });
            }
            onChange([...files, ...uploaded]);
            event.target.value = '';
          }}
        />
      </label>
      <span className="text-[11px] text-[var(--muted)]">{hint}</span>
    </div>
    {files.length > 0 && (
      <ul className="mt-1.5 space-y-1">
        {files.map((file, index) => (
          <li
            key={`${file.filename}-${index}`}
            className="flex items-center gap-2 rounded-[6px] border border-[var(--line)] px-2 py-1"
          >
            <Paperclip className="h-3 w-3 shrink-0 text-[var(--muted)]" />
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink)]">{file.filename}</span>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label={`Remove ${file.filename}`}
              onClick={() => onChange(files.filter((_, position) => position !== index))}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

/**
 * One sheet for every step. Each step keeps its own input contract: attachments
 * for step 1, item-wise receipts for step 2, the stock/direct split for step 3,
 * GRN capture for step 4, confirmations for steps 5–6 and part payments for 7.
 */
export const StepSubmitSheet = ({
  open,
  state,
  step,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  state: FmsEntryState | null;
  step: WorkflowStep | null;
  onClose: () => void;
  onSubmitted: (next: FmsEntryState) => void;
}) => {
  const [remark, setRemark] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [routes, setRoutes] = useState<Record<string, { route: MaterialRoute; quantity: string }>>({});
  const [grnNumber, setGrnNumber] = useState('');
  const [grnLines, setGrnLines] = useState<Record<string, string>>({});
  const [answer, setAnswer] = useState<'Yes' | 'No'>('Yes');
  const [approved, setApproved] = useState(false);
  const [amount, setAmount] = useState('');
  /** Steps 5 and 6 show the received quantity, editable before confirming. */
  const [imsQuantity, setImsQuantity] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** Set on open, so the delay preview never reads the clock during render. */
  const [openedAt, setOpenedAt] = useState('');

  const stepNumber = step?.step_number ?? 0;

  useEffect(() => {
    if (!open || !state || !step) return;
    setOpenedAt(new Date().toISOString());
    setRemark('');
    setFiles([]);
    setError('');
    setBusy(false);
    setAnswer('Yes');
    setApproved(false);
    setAmount('');
    setImsQuantity(String(totalQuantityOf(state.requirements) || ''));

    const already = receivedByItem(state.receipts);
    setReceived(
      Object.fromEntries(
        state.requirements.map((item) => [
          item.item_name,
          String(Math.max(item.quantity - (already[item.item_name] ?? 0), 0) || ''),
        ]),
      ),
    );

    setRoutes(
      Object.fromEntries(
        state.requirements.map((item) => {
          // Step 3 works on what actually arrived in step 2, not what was ordered.
          const available = (already[item.item_name] ?? 0) || item.quantity;
          return [item.item_name, { route: 'Stock' as MaterialRoute, quantity: String(available) }];
        }),
      ),
    );

    setGrnNumber(state.grn?.grn_number ?? '');
    setGrnLines(
      Object.fromEntries(
        state.requirements.map((item) => {
          const fromGrn = state.grn?.lines.find((line) => line.item_name === item.item_name);
          return [item.item_name, String(fromGrn?.quantity ?? item.quantity)];
        }),
      ),
    );
  }, [open, state, step]);

  const totalQty = state ? totalQuantityOf(state.requirements) : 0;
  const paid = state ? paidTotalOf(state.payouts) : 0;
  const pending = state ? pendingAmountOf(state.record.gross_total, state.payouts) : 0;
  /** Step 3 sent this material straight to the client, bypassing the stock route. */
  const directLines = (state?.allocations ?? []).filter((line) => line.route === 'Direct to Client');

  const receivedSummary = useMemo(() => {
    if (!state) return { ordered: 0, received: 0, pending: 0, extra: 0 };
    const already = receivedByItem(state.receipts);
    let ordered = 0;
    let got = 0;
    let extra = 0;
    state.requirements.forEach((item) => {
      ordered += item.quantity;
      const total = (already[item.item_name] ?? 0) + (Number(received[item.item_name]) || 0);
      got += Math.min(total, item.quantity);
      if (total > item.quantity) extra += total - item.quantity;
    });
    return { ordered, received: got, pending: Math.max(ordered - got, 0), extra };
  }, [state, received]);

  /**
   * Every item splits in two: the quantity typed for the chosen route, and the
   * balance automatically pushed to the other route.
   *
   * Both lines are submitted, which is what makes the two routes real — stock
   * continues through steps 4–6 while the remainder opens step 7 in parallel.
   */
  const allocationPlan = useMemo(() => {
    const lines: { item_name: string; route: MaterialRoute; quantity: number; note: string }[] = [];
    if (!state) return { lines, stock: 0, direct: 0 };

    const already = receivedByItem(state.receipts);
    // A later receipt part must only offer what has not been routed yet: the
    // earlier part's split is already stored and is added to, not replaced.
    const routed = allocatedByItem(state.allocations);
    state.requirements.forEach((item) => {
      const arrived = already[item.item_name] ?? 0;
      const available = Math.max((arrived > 0 ? arrived : item.quantity) - (routed[item.item_name] ?? 0), 0);
      if (available <= 0) return;
      const entry = routes[item.item_name];
      const chosen: MaterialRoute = entry?.route ?? 'Stock';
      const typed = Math.min(Math.max(Number(entry?.quantity) || 0, 0), available);
      const rest = Math.max(available - typed, 0);
      const otherRoute: MaterialRoute = chosen === 'Stock' ? 'Direct to Client' : 'Stock';

      if (typed > 0) lines.push({ item_name: item.item_name, route: chosen, quantity: typed, note: '' });
      if (rest > 0) {
        lines.push({
          item_name: item.item_name,
          route: otherRoute,
          quantity: rest,
          // The reason travels with the line, so step 7 can say why material
          // arrived there without passing through the stock route.
          note: `Balance of ${available} — ${typed} chosen for ${chosen}, so ${rest} went to ${otherRoute}.`,
        });
      }
    });

    const stock = lines.filter((line) => line.route === 'Stock').reduce((sum, line) => sum + line.quantity, 0);
    const direct = lines
      .filter((line) => line.route === 'Direct to Client')
      .reduce((sum, line) => sum + line.quantity, 0);
    return { lines, stock, direct };
  }, [state, routes]);

  if (!state || !step) return null;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      let next: FmsEntryState;

      if (stepNumber === 1) {
        next = await fmsApi.submitStep({
          fms_id: state.record.id,
          step_number: 1,
          remark,
          attachment_keys: files,
        });
      } else if (stepNumber === 2) {
        const lines = state.requirements.map((item) => ({
          item_name: item.item_name,
          received: Number(received[item.item_name]) || 0,
        }));
        if (!lines.some((line) => line.received > 0)) throw new Error('Enter the quantity received for at least one item.');
        const payload: ReceiptSubmission = {
          fms_id: state.record.id,
          step_number: 2,
          remark,
          lines,
          attachment_keys: files,
        };
        next = await fmsApi.submitStep(payload);
      } else if (stepNumber === 3) {
        if (!allocationPlan.lines.length) throw new Error('Enter a quantity for stock or direct to client.');
        const payload: AllocationSubmission = {
          fms_id: state.record.id,
          step_number: 3,
          remark,
          allocations: allocationPlan.lines,
        };
        next = await fmsApi.submitStep(payload);
      } else if (stepNumber === 4) {
        if (!grnNumber.trim()) throw new Error('GRN number is required.');
        const payload: GrnSubmission = {
          fms_id: state.record.id,
          step_number: 4,
          grn_number: grnNumber.trim(),
          remark,
          lines: state.requirements.map((item) => ({
            item_name: item.item_name,
            quantity: Number(grnLines[item.item_name]) || 0,
          })),
        };
        next = await fmsApi.submitStep(payload);
      } else if (stepNumber === 5) {
        const payload: VerificationSubmission = {
          fms_id: state.record.id,
          step_number: 5,
          po_number: state.record.po_number,
          grn_number: state.grn?.grn_number ?? '',
          quantity: Number(imsQuantity) || totalQty,
          answer,
          remark,
        };
        next = await fmsApi.submitStep(payload);
      } else if (stepNumber === 6) {
        if (!approved) throw new Error('Tick the confirmation box to post the bill.');
        const payload: VerificationSubmission = {
          fms_id: state.record.id,
          step_number: 6,
          po_number: state.record.po_number,
          grn_number: state.grn?.grn_number ?? '',
          quantity: Number(imsQuantity) || totalQty,
          approved: true,
          remark,
        };
        next = await fmsApi.submitStep(payload);
      } else {
        const value = Number(amount) || 0;
        if (value <= 0) throw new Error('Enter a payout amount greater than zero.');
        if (value - pending > 0.009) throw new Error(`Only ${money(pending)} is still outstanding.`);
        const payload: PayoutSubmission = { fms_id: state.record.id, step_number: 7, amount: value, remark };
        next = await fmsApi.submitStep(payload);
      }

      onSubmitted(next);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, 'That submission could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const alreadyReceived = receivedByItem(state.receipts);
  const routedByItem = allocatedByItem(state.allocations);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={`Step ${stepNumber} · ${state.record.company_name}`}
      title={step.step_name}
      subtitle={`Planned ${formatDateTime(step.planned_at)}${
        step.actual_completed_at ? ` · Actual ${formatDateTime(step.actual_completed_at)}` : ''
      }`}
      width={860}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : stepNumber === 7 ? 'Record payout' : 'Submit step'}
          </button>
        </>
      }
    >
      {error && (
        <p className="mb-3 rounded-[7px] border border-[var(--rust)]/30 bg-[var(--rust-tint)] px-3 py-2 text-[12px] font-medium text-[var(--rust)]">
          {error}
        </p>
      )}

      {stepNumber === 1 && (
        <div className="space-y-3">
          <div className="sunken px-3 py-2 text-[11.5px] text-[var(--ink-2)]">
            <p>
              Supplier: <strong>{state.record.supplier || '—'}</strong> · PO {state.record.po_number || '—'}
            </p>
            <p className="mt-0.5 text-[var(--muted)]">
              Follow up on the order and attach whatever the supplier sent back. Any number of files is fine.
            </p>
          </div>
          <AttachmentPicker files={files} onChange={setFiles} hint="Photos, PDFs, drawings worth keeping with the record." />
          <Field label="Remark" hint="optional">
            <textarea
              className="input"
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="What the supplier confirmed"
            />
          </Field>
        </div>
      )}

      {stepNumber === 2 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Ordered', value: num(receivedSummary.ordered) },
              { label: 'Received', value: num(receivedSummary.received) },
              { label: 'Pending', value: num(receivedSummary.pending) },
              { label: 'Extra', value: num(receivedSummary.extra) },
            ].map((cell) => (
              <div key={cell.label} className="sunken px-2.5 py-1.5">
                <Micro>{cell.label}</Micro>
                <p className="mono mt-0.5 text-[13px] font-semibold text-[var(--ink)]">{cell.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                  <th className="py-1.5 font-semibold">Item</th>
                  <th className="py-1.5 text-right font-semibold">Quantity</th>
                  <th className="py-1.5 text-right font-semibold">Received</th>
                  <th className="py-1.5 text-right font-semibold">Pending</th>
                </tr>
              </thead>
              <tbody>
                {state.requirements.map((item) => {
                  const earlier = alreadyReceived[item.item_name] ?? 0;
                  const now = Number(received[item.item_name]) || 0;
                  const total = earlier + now;
                  const left = Math.max(item.quantity - total, 0);
                  const extra = Math.max(total - item.quantity, 0);
                  return (
                    <tr key={item.item_name} className="border-b border-[var(--line)]/60">
                      <td className="py-1.5 pr-2">
                        <span className="text-[var(--ink)]">{item.item_name}</span>
                        {earlier > 0 && (
                          <span className="mono ml-1 text-[10px] text-[var(--muted)]">({num(earlier)} before)</span>
                        )}
                      </td>
                      <td className="mono py-1.5 text-right text-[var(--muted)]">
                        {num(item.quantity)} {item.unit}
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        <input
                          type="number"
                          min={0}
                          className="input text-right"
                          value={received[item.item_name] ?? ''}
                          onChange={(event) =>
                            setReceived((current) => ({ ...current, [item.item_name]: event.target.value }))
                          }
                        />
                      </td>
                      <td className="mono py-1.5 text-right">
                        {left > 0 ? (
                          <span className="text-[var(--amber)]">{num(left)}</span>
                        ) : extra > 0 ? (
                          <span className="text-[var(--rust)]">+{num(extra)} extra</span>
                        ) : (
                          <span className="text-[var(--forest)]">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {receivedSummary.pending > 0 && (
            <p className="rounded-[7px] border border-[var(--amber)]/40 bg-[var(--amber-tint)] px-3 py-2 text-[11.5px] text-[var(--amber)]">
              {num(receivedSummary.pending)} still pending. Submitting now closes part 1 and opens step 3 on what
              arrived; the balance stays available as part 2 of this step.
            </p>
          )}

          <AttachmentPicker files={files} onChange={setFiles} hint="Photos of the delivery, if any." />
          <Field label="Remark" hint="optional">
            <textarea
              className="input"
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="Damaged cartons, short supply, transport note…"
            />
          </Field>
        </div>
      )}

      {stepNumber === 3 && (
        <div className="space-y-3">
          <p className="text-[11.5px] text-[var(--muted)]">
            Split what arrived. Stock continues through GRN, IMS and tally; direct-to-client jumps straight to payout.
            Whatever you leave unassigned goes to the other route automatically.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="sunken px-2.5 py-1.5">
              <Micro>Stock</Micro>
              <p className="mono mt-0.5 text-[13px] font-semibold text-[var(--petrol)]">{num(allocationPlan.stock)}</p>
            </div>
            <div className="sunken px-2.5 py-1.5">
              <Micro>Direct to client</Micro>
              <p className="mono mt-0.5 text-[13px] font-semibold text-[var(--amber)]">{num(allocationPlan.direct)}</p>
            </div>
          </div>

          <ul className="space-y-2">
            {state.requirements.map((item) => {
              const entry = routes[item.item_name] ?? { route: 'Stock' as MaterialRoute, quantity: '' };
              const arrived = alreadyReceived[item.item_name] ?? 0;
              // Only what is still un-routed: a later part is split on its own run
              // and the earlier split is kept, so the same quantity must not show twice.
              const available = Math.max(
                (arrived > 0 ? arrived : item.quantity) - (routedByItem[item.item_name] ?? 0),
                0,
              );
              const quantity = Math.min(Number(entry.quantity) || 0, available);
              const leftover = Math.max(available - quantity, 0);
              const otherRoute: MaterialRoute = entry.route === 'Stock' ? 'Direct to Client' : 'Stock';
              return (
                <li key={item.item_name} className="rounded-[8px] border border-[var(--line)] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-[var(--ink)]">
                      {item.item_name}
                      <span className="mono ml-1.5 text-[10.5px] font-normal text-[var(--muted)]">
                        received {num(available)} {item.unit}
                      </span>
                    </span>
                    <div className="flex gap-1">
                      {(['Stock', 'Direct to Client'] as MaterialRoute[]).map((route) => (
                        <button
                          key={route}
                          type="button"
                          onClick={() =>
                            setRoutes((current) => ({
                              ...current,
                              [item.item_name]: { route, quantity: entry.quantity },
                            }))
                          }
                          className={`rounded-[6px] border px-2 py-[3px] text-[11px] font-medium ${
                            entry.route === route
                              ? 'border-[var(--petrol)] bg-[var(--petrol-tint)] text-[var(--petrol)]'
                              : 'border-[var(--line-strong)] text-[var(--ink-2)]'
                          }`}
                        >
                          {route}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={available}
                      className="input w-[92px] text-right"
                      value={entry.quantity}
                      onChange={(event) =>
                        setRoutes((current) => ({
                          ...current,
                          [item.item_name]: { route: entry.route, quantity: event.target.value },
                        }))
                      }
                    />
                  </div>
                  {leftover > 0 && (
                    <p className="mt-1 text-[11px] text-[var(--amber)]">
                      {num(leftover)} {item.unit} left over — goes to {otherRoute}.
                      {otherRoute === 'Direct to Client'
                        ? ' That quantity opens step 7 on its own route.'
                        : ' That quantity continues through step 4.'}
                    </p>
                  )}
                  {leftover === 0 && available > 0 && (
                    <p className="mt-1 text-[11px] text-[var(--forest)]">
                      All {num(available)} {item.unit} goes to {entry.route}.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <Field label="Remark" hint="optional">
            <textarea
              className="input"
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="Why material went direct to client"
            />
          </Field>
        </div>
      )}

      {stepNumber === 4 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="PO number">
              <input className="input" value={state.record.po_number} readOnly />
            </Field>
            <Field label="GRN number" required htmlFor="grn-number">
              <input
                id="grn-number"
                className="input"
                value={grnNumber}
                onChange={(event) => setGrnNumber(event.target.value)}
                placeholder="GRN-1042"
              />
            </Field>
          </div>

          <div>
            <Micro>Received quantity (editable)</Micro>
            <ul className="mt-1.5 space-y-1.5">
              {state.requirements.map((item) => (
                <li key={item.item_name} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink)]">{item.item_name}</span>
                  <input
                    type="number"
                    min={0}
                    className="input w-[104px] text-right"
                    value={grnLines[item.item_name] ?? ''}
                    onChange={(event) =>
                      setGrnLines((current) => ({ ...current, [item.item_name]: event.target.value }))
                    }
                  />
                  <span className="mono w-[44px] shrink-0 text-[10.5px] text-[var(--muted)]">{item.unit}</span>
                </li>
              ))}
            </ul>
          </div>

          <Field label="Remark" hint="optional">
            <textarea className="input" value={remark} onChange={(event) => setRemark(event.target.value)} />
          </Field>
        </div>
      )}

      {(stepNumber === 5 || stepNumber === 6) && (
        <div className="space-y-3">
          <div className="sunken grid gap-x-5 gap-y-1 px-3 py-2 text-[12px] sm:grid-cols-2">
            <span>PO number: {state.record.po_number || '—'}</span>
            <span>GRN number: {state.grn?.grn_number || '—'}</span>
            <span>Supplier: {state.record.supplier || '—'}</span>
            <span>Items: {state.requirements.length}</span>
          </div>

          <Field label="Quantity received" hint="editable if it differs from the GRN">
            <input
              type="number"
              min={0}
              className="input"
              value={imsQuantity}
              onChange={(event) => setImsQuantity(event.target.value)}
            />
          </Field>

          <ul className="space-y-1 rounded-[8px] border border-[var(--line)] px-3 py-2">
            {state.requirements.map((item) => (
              <li key={item.item_name} className="flex items-center gap-2 text-[11.5px]">
                <span className="min-w-0 flex-1 truncate text-[var(--ink-2)]">{item.item_name}</span>
                <span className="mono shrink-0 text-[var(--muted)]">
                  {num(item.quantity)} {item.unit}
                </span>
              </li>
            ))}
          </ul>

          {stepNumber === 5 ? (
            <>
              <Field label="Does the IMS entry match this GRN?" required>
                <div className="flex gap-2">
                  {(['Yes', 'No'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAnswer(option)}
                      className={`rounded-[7px] border px-4 py-2 text-[12.5px] font-medium ${
                        answer === option
                          ? option === 'Yes'
                            ? 'border-[var(--forest)] bg-[var(--forest-tint)] text-[var(--forest)]'
                            : 'border-[var(--rust)] bg-[var(--rust-tint)] text-[var(--rust)]'
                          : 'border-[var(--line-strong)] text-[var(--ink-2)]'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Remark" hint={answer === 'No' ? 'explain the mismatch' : 'optional'}>
                <textarea className="input" value={remark} onChange={(event) => setRemark(event.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <label className="flex items-start gap-2 rounded-[7px] border border-[var(--line)] px-3 py-2">
                <input
                  type="checkbox"
                  className="checkbox mt-0.5"
                  checked={approved}
                  onChange={(event) => setApproved(event.target.checked)}
                />
                <span className="text-[12px] text-[var(--ink-2)]">
                  Purchase bill entered in Tally and approved by ABS.
                </span>
              </label>
              <Field label="Remark" hint="optional">
                <textarea className="input" value={remark} onChange={(event) => setRemark(event.target.value)} />
              </Field>
            </>
          )}
        </div>
      )}

      {stepNumber === 7 && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { label: 'Gross total', value: money(state.record.gross_total), tone: 'var(--ink)' },
              { label: 'Paid so far', value: money(paid), tone: 'var(--forest)' },
              { label: 'Remaining', value: money(pending), tone: pending > 0 ? 'var(--rust)' : 'var(--forest)' },
            ].map((cell) => (
              <div key={cell.label} className="sunken px-2.5 py-1.5">
                <Micro>{cell.label}</Micro>
                <p className="mono mt-0.5 text-[13px] font-semibold" style={{ color: cell.tone }}>
                  {cell.value}
                </p>
              </div>
            ))}
          </div>

          <p className="text-[11.5px] text-[var(--muted)]">
            Pay terms {state.record.pay_terms || '—'} days · PO date {formatDate(state.record.po_date)} · planned{' '}
            {formatDate(step.planned_at)}
            {pending > 0 ? ' · this step stays open until the amount is fully settled.' : ''}
          </p>

          {directLines.length > 0 && (
            <div className="rounded-[7px] border border-[var(--amber)]/40 bg-[var(--amber-tint)] px-3 py-2">
              <Micro>Sent direct to client</Micro>
              <ul className="mt-1 space-y-0.5">
                {directLines.map((line) => (
                  <li key={`${line.item_name}-${line.quantity}`} className="text-[11.5px] text-[var(--ink-2)]">
                    <span className="mono font-semibold">
                      {num(line.quantity)} {line.unit}
                    </span>{' '}
                    {line.item_name}
                    {line.note ? <span className="text-[var(--muted)]"> — {line.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Field label="Outstanding amount to pay now" required htmlFor="payout-amount">
            <input
              id="payout-amount"
              type="number"
              min={0}
              className="input"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={String(pending)}
            />
          </Field>

          <Field label="Remark" hint="optional">
            <input className="input" value={remark} onChange={(event) => setRemark(event.target.value)} />
          </Field>

          {state.payouts.length > 0 && (
            <div>
              <Micro>Payment history</Micro>
              <ul className="mt-1.5 space-y-1">
                {state.payouts.map((payout) => (
                  <li
                    key={payout.part_number}
                    className="flex flex-wrap items-center gap-2 rounded-[6px] border border-[var(--line)] px-2 py-1 text-[11.5px]"
                  >
                    <span className="mono text-[10px] text-[var(--muted)]">#{payout.part_number}</span>
                    <span className="mono font-semibold text-[var(--ink)]">{money(payout.amount)}</span>
                    <span className="text-[var(--muted)]">{formatDateTime(payout.paid_at)}</span>
                    <span className="ml-auto truncate text-[var(--muted)]">{payout.remark || payout.paid_by}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mono text-[10.5px] text-[var(--muted)]">
            {openedAt ? `Delay if submitted now: ${delayLabel(step.planned_at, openedAt)}` : null}
          </p>
        </div>
      )}
    </Sheet>
  );
};
