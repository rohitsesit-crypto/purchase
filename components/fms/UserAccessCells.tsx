'use client';

import { STEP_TITLES, ALL_STEPS, editStepsOf, stepModeOf, viewStepsOf, visibleStepsOf } from '@/lib/fms/workflow';
import type { AdminUser } from '@/lib/fms/types';

/**
 * Compact read-outs for the users table.
 *
 * Every chip states its own mode in words ("EDIT", "VIEW", "BOTH") so the table
 * never depends on colour alone, and so an operator's access can be audited
 * without opening the modal.
 */

const CHIP: Record<'edit' | 'view' | 'both', string> = {
  edit: 'border-[var(--petrol)] bg-[var(--petrol-tint)] text-[var(--petrol)]',
  view: 'border-[var(--steel)] bg-[var(--steel-tint)] text-[var(--steel)]',
  both: 'border-[var(--forest)] bg-[var(--forest-tint)] text-[var(--forest)]',
};

const LABEL: Record<'edit' | 'view' | 'both', string> = {
  edit: 'EDIT',
  view: 'VIEW',
  both: 'BOTH',
};

export const StepAccessCell = ({ user }: { user: AdminUser }) => {
  const steps = visibleStepsOf(user);

  if (steps.length === 0) {
    return <span className="text-[11px] text-[var(--faint)]">No steps</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {steps.map((step) => {
        const mode = stepModeOf(user, step);
        const tone = mode === 'hidden' ? 'view' : mode;
        return (
          <span
            key={step}
            title={`${step}. ${STEP_TITLES[step]} — ${LABEL[tone].toLowerCase()}`}
            className={`mono inline-flex items-center gap-1 rounded-[4px] border px-1 py-[1px] text-[9.5px] font-semibold whitespace-nowrap ${CHIP[tone]}`}
          >
            {step}
            <span className="text-[8px] opacity-80">{LABEL[tone]}</span>
          </span>
        );
      })}
    </div>
  );
};

export const OfficeAccessCell = ({ user }: { user: AdminUser }) => {
  const scope = user.location_scope || 'Both';
  const label = scope === 'Both' ? 'Mumbai & Boisar' : scope;
  return (
    <span className="mono whitespace-nowrap rounded-[4px] bg-[var(--sunken)] px-1.5 py-[2px] text-[10px] font-semibold text-[var(--ink-2)]">
      {label}
    </span>
  );
};

export const AccessFlagsCell = ({ user }: { user: AdminUser }) => (
  <div className="flex flex-wrap gap-1">
    {user.can_fill_form && (
      <span className="mono whitespace-nowrap rounded-[4px] bg-[var(--forest-tint)] px-1.5 py-[2px] text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--forest)]">
        Form
      </span>
    )}
    {user.can_view_all_steps && (
      <span className="mono whitespace-nowrap rounded-[4px] bg-[var(--steel-tint)] px-1.5 py-[2px] text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--steel)]">
        Read all
      </span>
    )}
    {user.is_admin && (
      <span className="mono whitespace-nowrap rounded-[4px] bg-[var(--petrol-tint)] px-1.5 py-[2px] text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--petrol)]">
        Admin
      </span>
    )}
    {!user.can_fill_form && !user.can_view_all_steps && !user.is_admin && (
      <span className="text-[11px] text-[var(--faint)]">—</span>
    )}
  </div>
);

/** Counts used by the access summary line. */
export const accessCountsOf = (user: AdminUser) => {
  const edit = editStepsOf(user);
  const view = viewStepsOf(user);
  return {
    edit: edit.length,
    view: view.filter((step) => !edit.includes(step)).length,
    hidden: ALL_STEPS.length - new Set([...edit, ...view]).size,
  };
};
