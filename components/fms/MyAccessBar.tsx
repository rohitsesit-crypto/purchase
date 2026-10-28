'use client';

import { STEP_TITLES } from '@/lib/fms/workflow';

/**
 * The permanent access strip.
 *
 * Operators previously could not tell which steps they actually owned, so this
 * bar states it in words: a fixed 96px label column keeps "Can submit",
 * "View only" and the office badge aligned no matter how many steps are granted.
 */

const StepChips = ({ steps, tone }: { steps: number[]; tone: 'edit' | 'view' }) => {
  if (steps.length === 0) {
    return <span className="text-[11px] text-[var(--faint)]">None</span>;
  }

  const toneClass =
    tone === 'edit'
      ? 'border-[var(--petrol)] bg-[var(--petrol-tint)] text-[var(--petrol)]'
      : 'border-[var(--steel)] bg-[var(--steel-tint)] text-[var(--steel)]';
  const badgeClass = tone === 'edit' ? 'bg-[var(--petrol)]' : 'bg-[var(--steel)]';

  return (
    <div className="flex flex-wrap gap-1.5">
      {steps.map((step) => (
        <span
          key={step}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[5px] border py-[2px] pl-[3px] pr-1.5 ${toneClass}`}
        >
          <span
            className={`mono inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] text-[9px] font-semibold text-white ${badgeClass}`}
          >
            {step}
          </span>
          <span className="text-[10.5px] font-semibold">{STEP_TITLES[step]}</span>
          <span className="mono text-[8px] font-semibold opacity-75">{tone === 'edit' ? 'EDIT' : 'VIEW'}</span>
        </span>
      ))}
    </div>
  );
};

export const MyAccessBar = ({
  assignedSteps,
  viewOnlySteps,
  officeLabel,
  canFillForm,
}: {
  assignedSteps: number[];
  viewOnlySteps: number[];
  officeLabel: string;
  canFillForm: boolean;
}) => {
  const nothingAssigned = assignedSteps.length === 0 && viewOnlySteps.length === 0;

  return (
    <div className="border-b border-[var(--line)] bg-[var(--sunken)] px-4 py-3 sm:px-6">
      <div className="mx-auto w-full max-w-[1480px]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="micro">My access</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mono whitespace-nowrap rounded-[5px] border border-[var(--steel)] bg-[var(--steel-tint)] px-2 py-[2px] text-[10px] font-semibold text-[var(--steel)]">
              Office: {officeLabel}
            </span>
            <span
              className={`mono whitespace-nowrap rounded-[5px] border px-2 py-[2px] text-[10px] font-semibold ${
                canFillForm
                  ? 'border-[var(--forest)] bg-[var(--forest-tint)] text-[var(--forest)]'
                  : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--faint)]'
              }`}
            >
              New entry: {canFillForm ? 'allowed' : 'not allowed'}
            </span>
          </div>
        </div>

        <div className="grid items-start gap-2" style={{ gridTemplateColumns: '96px 1fr' }}>
          <span className="pt-1 text-[11px] font-semibold text-[var(--muted)]">Can submit</span>
          <StepChips steps={assignedSteps} tone="edit" />
          <span className="pt-1 text-[11px] font-semibold text-[var(--muted)]">View only</span>
          <StepChips steps={viewOnlySteps} tone="view" />
        </div>

        {nothingAssigned && (
          <p className="mt-2 text-[11px] font-semibold text-[var(--rust)]">
            No steps are assigned to you yet. Ask an administrator to set your step access under Operators &amp;
            access.
          </p>
        )}
      </div>
    </div>
  );
};
