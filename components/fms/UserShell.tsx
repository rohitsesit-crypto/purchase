'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, LogOut, Moon, Sun } from 'lucide-react';
import { STEP_DEFS, editStepsOf, officeLabelOf, visibleStepsOf } from '@/lib/fms/workflow';
import type { AdminUser } from '@/lib/fms/types';

const ThemeToggle = () => {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('fms-theme') === 'dark';
    setDark(stored);
    document.documentElement.classList.toggle('dark', stored);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    window.localStorage.setItem('fms-theme', next ? 'dark' : 'light');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-icon"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
};

/**
 * Operator chrome: one brand bar, an explicit access summary, and nothing else.
 *
 * The access bar exists because the previous build left operators unable to tell
 * which steps they actually owned — here every granted step is printed with an
 * EDIT or VIEW label, and office scope plus form permission are stated in words.
 */
export const UserShell = ({
  me,
  children,
  lastSync,
  refreshing,
  onRefresh,
  onSignOut,
}: {
  me: AdminUser;
  children: React.ReactNode;
  lastSync: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
}) => {
  const editSteps = editStepsOf(me);
  const viewOnly = visibleStepsOf(me).filter((step) => !editSteps.includes(step));
  const nothingAssigned = editSteps.length === 0 && viewOnly.length === 0;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--paper)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <span className="mono flex h-7 w-7 items-center justify-center rounded-[6px] bg-[var(--petrol)] text-[12px] font-semibold text-white">
            S
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[var(--ink)]">Flowchart Monitoring System</p>
            <p className="mono truncate text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
              Saraswat Engineering Services
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-[6px] border border-[var(--line)] px-2 py-1 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--forest)]" aria-hidden="true" />
              <span className="mono text-[10px] text-[var(--muted)]">
                {lastSync ? `Synced ${lastSync}` : 'Live'}
              </span>
            </span>
            <span className="rounded-[6px] border border-[var(--line)] px-2 py-1">
              <span className="mono text-[10px] font-semibold text-[var(--ink)]">{me.name}</span>
            </span>
            <button type="button" className="btn btn-outline btn-sm" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'Syncing…' : 'Refresh'}
            </button>
            <ThemeToggle />
            {me.is_admin && (
              <Link href="/admin" className="btn btn-ghost btn-icon" aria-label="Open control room">
                <LayoutDashboard className="h-4 w-4" />
              </Link>
            )}
            <button type="button" className="btn btn-ghost btn-icon" onClick={onSignOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-t border-[var(--line)] bg-[var(--sunken)]">
          <div className="mx-auto w-full max-w-[1480px] px-4 py-2 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="micro">My access</span>

              <span className="flex flex-wrap items-center gap-1">
                <span className="mono text-[10px] font-semibold text-[var(--muted)]">Can submit</span>
                {editSteps.length === 0 ? (
                  <span className="text-[11px] text-[var(--faint)]">none</span>
                ) : (
                  editSteps.map((step) => (
                    <span
                      key={`edit-${step}`}
                      className="mono inline-flex items-center gap-1 rounded-[4px] border border-[var(--petrol)] bg-[var(--petrol-tint)] px-1 py-[1px] text-[9.5px] font-semibold text-[var(--petrol)]"
                      title={STEP_DEFS.find((definition) => definition.number === step)?.name}
                    >
                      {step}
                      <span className="text-[8px] opacity-75">EDIT</span>
                    </span>
                  ))
                )}
              </span>

              <span className="flex flex-wrap items-center gap-1">
                <span className="mono text-[10px] font-semibold text-[var(--muted)]">View only</span>
                {viewOnly.length === 0 ? (
                  <span className="text-[11px] text-[var(--faint)]">none</span>
                ) : (
                  viewOnly.map((step) => (
                    <span
                      key={`view-${step}`}
                      className="mono inline-flex items-center gap-1 rounded-[4px] border border-[var(--steel)] bg-[var(--steel-tint)] px-1 py-[1px] text-[9.5px] font-semibold text-[var(--steel)]"
                      title={STEP_DEFS.find((definition) => definition.number === step)?.name}
                    >
                      {step}
                      <span className="text-[8px] opacity-75">VIEW</span>
                    </span>
                  ))
                )}
              </span>

              <span className="mono rounded-[4px] bg-[var(--surface)] px-1.5 py-[1px] text-[9.5px] font-semibold text-[var(--muted)]">
                Office: {officeLabelOf(me.location_scope)}
              </span>
              <span
                className={`mono rounded-[4px] px-1.5 py-[1px] text-[9.5px] font-semibold ${
                  me.can_fill_form
                    ? 'bg-[var(--forest-tint)] text-[var(--forest)]'
                    : 'bg-[var(--surface)] text-[var(--faint)]'
                }`}
              >
                New entry: {me.can_fill_form ? 'allowed' : 'not allowed'}
              </span>
            </div>

            {nothingAssigned && (
              <p className="mt-1.5 text-[11px] font-semibold text-[var(--rust)]">
                No steps are assigned to you yet. Ask an administrator to grant step access.
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
};
