'use client';

import { useEffect, useState } from 'react';
import { Copy, Link2, ShieldCheck } from 'lucide-react';
import { ErrorStrip, Field, Sheet, Spinner } from '../ui';
import { adminApi } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { ALL_STEPS, STEP_DEFS, editStepsOf, viewStepsOf, type StepMode } from '@/lib/fms/workflow';
import type { AdminUser, OfficeScope, StepPermission } from '@/lib/fms/types';

const MODES: { value: StepMode; label: string; title: string }[] = [
  { value: 'edit', label: 'Edit', title: 'Can submit this step' },
  { value: 'view', label: 'View', title: 'Read only' },
  { value: 'both', label: 'Both', title: 'Can submit and always visible' },
  { value: 'hidden', label: 'Hidden', title: 'Never reaches this user' },
];

const OFFICES: { value: OfficeScope; label: string }[] = [
  { value: 'Mumbai', label: 'Mumbai' },
  { value: 'Boisar', label: 'Boisar' },
  { value: 'Both', label: 'Mumbai & Boisar' },
];

const modeOf = (edits: number[], views: number[], step: number): StepMode => {
  const edit = edits.includes(step);
  const view = views.includes(step);
  if (edit && view) return 'both';
  if (edit) return 'edit';
  if (view) return 'view';
  return 'hidden';
};

/**
 * Per-operator access: office scope, the primary-form switch, and one explicit
 * state per step.
 *
 * Every step resolves to exactly one of Edit / View / Both / Hidden, so there is
 * no way to save a half-defined grant. "Both" keeps the step in the visible list
 * as well as the submit list, which is what the operator dashboard reads.
 */
export const AccessSheet = ({
  open,
  user,
  onClose,
  onSaved,
  onToast,
}: {
  open: boolean;
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
  onToast: (message: string, tone: 'success' | 'error' | 'info') => void;
}) => {
  const [edits, setEdits] = useState<number[]>([]);
  const [views, setViews] = useState<number[]>([]);
  const [scope, setScope] = useState<OfficeScope>('Both');
  const [canFillForm, setCanFillForm] = useState(false);
  const [canViewAll, setCanViewAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [link, setLink] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEdits(editStepsOf(user));
    setViews(viewStepsOf(user));
    setScope(user.location_scope);
    setCanFillForm(user.can_fill_form);
    setCanViewAll(user.can_view_all_steps);
    setFormError('');
    setLink('');
    setCopied(false);
    setSaving(false);
    setGenerating(false);
  }, [open, user]);

  const setMode = (step: number, mode: StepMode) => {
    setEdits((current) => {
      const next = current.filter((value) => value !== step);
      return mode === 'edit' || mode === 'both' ? [...next, step].sort((a, b) => a - b) : next;
    });
    setViews((current) => {
      const next = current.filter((value) => value !== step);
      return mode === 'view' || mode === 'both' ? [...next, step].sort((a, b) => a - b) : next;
    });
  };

  const save = async () => {
    setFormError('');
    if (!edits.length && !views.length && !canViewAll) {
      setFormError('This operator would see nothing. Grant at least one step, or enable "show all steps".');
      return;
    }
    setSaving(true);
    try {
      const permissions: StepPermission[] = edits.map((step) => ({ step_number: step, access_level: 'EDIT' }));
      await adminApi.updateUserAccess({
        user_id: user.id,
        ses_code: user.ses_code,
        name: user.name,
        email: user.email,
        mobile: user.mobile ?? '',
        location_scope: scope,
        status: user.status,
        permissions,
        // "Both" steps stay in the view list too, so all four states round-trip.
        view_steps: views,
        can_fill_form: canFillForm,
        can_view_all_steps: canViewAll,
      });
      onSaved();
      onClose();
    } catch (error) {
      const message = errorMessage(error, 'Could not save access.');
      setFormError(message);
      onToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateLink = async () => {
    setGenerating(true);
    setLink('');
    try {
      const result = await adminApi.generateUserLink(user.id);
      setLink(result.link);
      onSaved();
      onToast('Permanent link generated.', 'success');
    } catch (error) {
      onToast(errorMessage(error, 'Could not generate a link.'), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFormError('Copy was blocked by the browser. Select the link and copy it manually.');
    }
  };

  const submitCount = edits.length;
  const viewOnlyCount = views.filter((step) => !edits.includes(step)).length;
  const hiddenCount = ALL_STEPS.length - new Set([...edits, ...views]).size;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={`${user.email} · ${user.ses_code}`}
      title={`Access — ${user.name}`}
      subtitle="Pick one state per step: Edit, View, Both, or Hidden."
      width={820}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving && <Spinner />}
            {saving ? 'Saving…' : 'Save access'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <ErrorStrip message={formError} />}

        <div className="rounded-[7px] border border-[var(--line)] bg-[var(--sunken)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--ink-2)]">
          <span className="font-semibold text-[var(--ink)]">How it works.</span> <strong>Edit</strong> lets them submit
          the step. <strong>View</strong> is read only. <strong>Both</strong> lets them submit and keeps it always
          visible. <strong>Hidden</strong> never reaches them. Office access limits which location&apos;s FMS records
          they can open.
        </div>

        <div>
          <p className="mb-1.5 text-[11.5px] font-semibold text-[var(--ink-2)]">Office access</p>
          <div className="flex flex-wrap gap-1.5">
            {OFFICES.map((office) => {
              const active = scope === office.value;
              return (
                <button
                  key={office.value}
                  type="button"
                  onClick={() => setScope(office.value)}
                  aria-pressed={active}
                  className={`rounded-[6px] border px-3 py-1.5 text-[11.5px] font-semibold ${
                    active
                      ? 'border-[var(--petrol)] bg-[var(--petrol)] text-white'
                      : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-2)] hover:bg-[var(--sunken)]'
                  }`}
                >
                  {office.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--muted)]">
            {scope === 'Both'
              ? 'No restriction — this operator sees records from both offices.'
              : `Only ${scope} records will be visible to this operator.`}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-[7px] border border-[var(--line)] px-2.5 py-1.5">
            <input
              type="checkbox"
              className="checkbox"
              checked={canFillForm}
              onChange={(event) => setCanFillForm(event.target.checked)}
            />
            <span className="text-[11.5px] font-medium text-[var(--ink)]">Can submit the primary FMS form</span>
          </label>
          <label className="flex items-center gap-2 rounded-[7px] border border-[var(--line)] px-2.5 py-1.5">
            <input
              type="checkbox"
              className="checkbox"
              checked={canViewAll}
              onChange={(event) => setCanViewAll(event.target.checked)}
            />
            <span className="text-[11.5px] font-medium text-[var(--ink)]">Show all steps (read only master switch)</span>
          </label>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[11.5px] font-semibold text-[var(--ink-2)]">Step-wise access</p>
              <p className="mono mt-0.5 text-[10.5px] text-[var(--muted)]">
                {submitCount} submit · {viewOnlyCount} view · {hiddenCount} hidden
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setEdits([...ALL_STEPS]);
                  setViews([]);
                }}
              >
                All edit
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setEdits([]);
                  setViews([...ALL_STEPS]);
                }}
              >
                All view
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setEdits([...ALL_STEPS]);
                  setViews([...ALL_STEPS]);
                }}
              >
                All both
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setEdits([]);
                  setViews([]);
                }}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[7px] border border-[var(--line)]">
            {STEP_DEFS.map((definition) => {
              const mode = modeOf(edits, views, definition.number);
              return (
                <div
                  key={definition.number}
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-2 py-1.5 last:border-b-0"
                >
                  <span className="mono flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-[var(--sunken)] text-[10px] font-semibold text-[var(--ink-2)]">
                    {definition.number}
                  </span>
                  <div className="min-w-[130px] flex-1">
                    <p className="truncate text-[12px] font-medium text-[var(--ink)]">{definition.name}</p>
                    <p className="mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--muted)]">
                      {definition.desk}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-[6px] bg-[var(--sunken)] p-0.5">
                    {MODES.map((option) => {
                      const active = option.value === mode;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          title={option.title}
                          onClick={() => setMode(definition.number, option.value)}
                          aria-pressed={active}
                          className={`rounded-[4px] px-2 py-[3px] text-[10.5px] font-medium ${
                            active
                              ? option.value === 'edit'
                                ? 'bg-[var(--petrol)] text-white'
                                : option.value === 'view'
                                  ? 'bg-[var(--steel)] text-white'
                                  : option.value === 'both'
                                    ? 'bg-[var(--forest)] text-white'
                                    : 'bg-[var(--line-strong)] text-[var(--ink)]'
                              : 'text-[var(--muted)]'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[7px] border border-[var(--line)] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--petrol)]" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-[var(--ink)]">Personal workspace link</p>
              <p className="text-[11px] text-[var(--muted)]">
                Opens this operator&apos;s dashboard. Generating again replaces the previous link.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void generateLink()}
              disabled={generating}
            >
              {generating ? <Spinner dark /> : <Link2 className="h-3 w-3" />}
              {generating ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {link && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="mono min-w-0 flex-1 break-all rounded-[6px] bg-[var(--sunken)] px-2 py-1.5 text-[11px] text-[var(--petrol)]">
                {link}
              </code>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void copyLink()}>
                <Copy className="h-3 w-3" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        <Field label="Operator">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--muted)]">
            <span className="font-semibold text-[var(--ink)]">{user.name}</span>
            <span className="mono">{user.email}</span>
            <span>{user.status}</span>
            {user.is_admin && <span className="tag tag-petrol">Admin</span>}
          </div>
        </Field>
      </div>
    </Sheet>
  );
};
