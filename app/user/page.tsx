'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Sun,
  Timer,
  X,
} from 'lucide-react';
import { MyAccessBar } from '@/components/fms/MyAccessBar';
import { PrimaryFormSheet } from '@/components/fms/PrimaryFormSheet';
import { StepSubmitSheet } from '@/components/fms/StepSubmitSheet';
import { FmsDetailSheet } from '@/components/fms/TaskDetailSheet';
import { ErrorStrip, Spinner, ToastViewport, type ToastTone } from '@/components/fms/ui';
import { adminApi, captureAccessFromUrl, fmsApi, getSessionEmail, setSessionEmail } from '@/lib/api';
import { formatDate, errorMessage, money } from '@/lib/format';
import {
  STEP_TITLES,
  dateKey,
  delayLabel,
  editStepsOf,
  isOverdueKey,
  officeLabelOf,
  visibleStepsOf,
} from '@/lib/fms/workflow';
import type { AdminUser, FmsEntryState, UserTask, UserTaskBoard, WorkflowStep } from '@/lib/fms/types';

type Section = 'pending' | 'completed' | 'all';

/** Reads a step's own status through the same vocabulary the backend uses. */
const isDone = (task: UserTask) => task.status === 'Completed' || task.status === 'Skipped';

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
 * Operator workspace.
 *
 * Opened from the personal link an administrator generates. Every card is one
 * step of one FMS record, grouped by its planned date, and the permanent access
 * bar states in words which steps this person can submit and which are read only.
 */
export default function UserPage() {
  const [board, setBoard] = useState<UserTaskBoard | null>(null);
  const [me, setMe] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [section, setSection] = useState<Section>('pending');
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [submitTarget, setSubmitTarget] = useState<{ state: FmsEntryState; step: WorkflowStep } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  /** Read after mount so no clock call happens during prerendering. */
  const [today, setToday] = useState('');
  const todayColumnRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setToday(dateKey(new Date().toISOString()));
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const access = captureAccessFromUrl();
      if (access.email) {
        // A user tab belongs to exactly one person. If this tab was opened from a
        // different email link — or holds no identity yet — verify that email so
        // the workspace can never show the previous person's tasks.
        if (access.email !== getSessionEmail()) {
          const verified = await adminApi.verifyUser(access.email);
          setSessionEmail(verified.email || access.email);
        }
      }
      const next = await fmsApi.tasks();
      setBoard(next);
      setMe(next.me);
    } catch (caught) {
      setError(errorMessage(caught, 'Your workspace could not be loaded.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Poll and re-sync on focus so sheet edits appear without a hard reload. */
  useEffect(() => {
    if (!board) return;
    const interval = setInterval(() => void load(true), 15000);
    const onFocus = () => void load(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [board, load]);

  const signIn = async () => {
    setLoading(true);
    setError('');
    try {
      const verified = await adminApi.verifyUser(email.trim());
      setSessionEmail(verified.me.email || email.trim());
      await load();
    } catch (caught) {
      setError(errorMessage(caught, 'That email could not be verified.'));
      setLoading(false);
    }
  };

  const signOut = () => {
    setSessionEmail('');
    setBoard(null);
    setMe(null);
    setEmail('');
  };

  const items = useMemo(() => board?.items ?? [], [board]);
  const editSteps = useMemo(() => (me ? editStepsOf(me) : []), [me]);
  const viewOnlySteps = useMemo(
    () => (me ? visibleStepsOf(me).filter((step) => !editSteps.includes(step)) : []),
    [me, editSteps],
  );

  /**
   * A locked step is not work yet, so it never becomes a card. Only steps whose
   * predecessor is done reach the board.
   */
  const openItems = useMemo(() => items.filter((item) => item.status !== 'Locked'), [items]);

  /**
   * One live step per FMS record — the earliest unfinished one.
   *
   * The desk works a single step at a time, so showing all seven steps of the
   * same company as seven cards is noise.
   */
  const currentItems = useMemo(() => {
    const earliest = new Map<string, UserTask>();
    openItems.forEach((item) => {
      if (isDone(item)) return;
      const existing = earliest.get(item.fms_id);
      if (!existing || item.step_number < existing.step_number) earliest.set(item.fms_id, item);
    });
    return Array.from(earliest.values());
  }, [openItems]);

  /**
   * Completed tab: one card per FMS record, not one per finished step.
   *
   * A record that has run six steps would otherwise repeat the same company six
   * times in the list. The card shows the latest step that finished.
   */
  const doneItems = useMemo(() => {
    const latest = new Map<string, UserTask>();
    openItems.filter(isDone).forEach((item) => {
      const existing = latest.get(item.fms_id);
      if (!existing || item.step_number > existing.step_number) latest.set(item.fms_id, item);
    });
    return Array.from(latest.values());
  }, [openItems]);
  const boardTotal = currentItems.length + doneItems.length;

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const source =
      section === 'pending'
        ? currentItems
        : section === 'completed'
          ? doneItems
          : [...currentItems, ...doneItems];
    return source
      .filter((item) => {
        if (!term) return true;
        return [item.company_name, item.supplier, item.po_number, item.location, item.step_name, item.fms_id]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .sort((a, b) => a.step_number - b.step_number);
  }, [section, query, currentItems, doneItems]);

  /** Cards grouped into date lanes, most recent first, undated last. */
  const lanes = useMemo(() => {
    const grouped = new Map<string, UserTask[]>();
    visible.forEach((task) => {
      const key = task.planned_at ? dateKey(task.planned_at) : '';
      const bucket = grouped.get(key);
      if (bucket) bucket.push(task);
      else grouped.set(key, [task]);
    });
    return Array.from(grouped.entries())
      .map(([key, tasks]) => ({
        key,
        tasks: tasks.sort((a, b) => a.step_number - b.step_number),
      }))
      .sort((a, b) => {
        if (!a.key) return 1;
        if (!b.key) return -1;
        return a.key.localeCompare(b.key);
      });
  }, [visible]);

  useEffect(() => {
    if (!today || section !== 'pending') return;
    const timer = setTimeout(() => {
      const container = scrollContainerRef.current;
      const column = todayColumnRef.current;
      if (!container || !column) return;
      container.scrollTo({ left: Math.max(0, column.offsetLeft - 16), behavior: 'smooth' });
    }, 250);
    return () => clearTimeout(timer);
  }, [lanes, today, section]);

  const openSubmit = async (task: UserTask) => {
    if (!task.can_submit) {
      setToast({ message: `Step ${task.step_number} is not yours to submit.`, tone: 'error' });
      return;
    }
    try {
      const state = await fmsApi.getFms(task.fms_id);
      const step = state.steps.find((entry) => entry.step_number === task.step_number);
      if (step) setSubmitTarget({ state, step });
    } catch (caught) {
      setToast({ message: errorMessage(caught, 'Could not open that step.'), tone: 'error' });
    }
  };

  const submitSuccess = (next: FmsEntryState) => {
    setSubmitTarget({ state: next, step: next.steps.find((step) => step.step_number === submitTarget?.step.step_number) ?? next.steps[0] });
    setToast({ message: 'Step submitted. The next step is now open.', tone: 'success' });
    setRefreshKey((key) => key + 1);
    void load(true);
  };

  if (loading && !board) {
    return (
      <div className="ref-theme flex min-h-dvh items-center justify-center bg-[var(--paper)]">
        <span className="flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
          <Spinner dark />
          Loading your tasks…
        </span>
      </div>
    );
  }

  if (!me || !board) {
    return (
      <div className="ref-theme flex min-h-dvh items-center justify-center bg-[var(--paper)] px-4">
        <div className="card w-full max-w-[440px] px-5 py-6">
          <p className="micro mb-1">Saraswat Purchase FMS</p>
          <h1 className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">Open your workspace</h1>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
            Use the personal link your administrator sent, or enter the email registered for you.
          </p>
          {error && (
            <div className="mt-3">
              <ErrorStrip message={error} />
            </div>
          )}
          <div className="mt-4 space-y-2">
            <input
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@saraswateng.in"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void signIn();
              }}
            />
            <button type="button" className="btn btn-primary btn-block" onClick={signIn}>
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  const officeLabel = officeLabelOf(me.location_scope);
  const pendingCount = currentItems.length;
  const doneCount = doneItems.length;

  return (
    <div className="ref-theme flex min-h-dvh flex-col bg-[var(--paper)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <span className="mono flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--petrol)] text-[12px] font-semibold text-white">
            S
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[var(--ink)]">Flowchart Monitoring System</p>
            <p className="mono truncate text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
              Saraswat Engineering Services
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="mono rounded-[6px] border border-[var(--line)] px-2 py-1 text-[10px] font-semibold text-[var(--ink)]">
              {me.name}
            </span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void load(true)} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <ThemeToggle />
            {me.is_admin && (
              <a href="/admin" className="btn btn-ghost btn-icon" aria-label="Open control room">
                <LayoutDashboard className="h-4 w-4" />
              </a>
            )}
            <button type="button" className="btn btn-ghost btn-icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="ref-hero px-4 py-4 text-white sm:px-6">
        <div className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold tracking-tight">Purchase FMS</h1>
            <p className="mt-0.5 truncate text-[12px] text-white/80">
              Welcome, <strong className="font-semibold text-white">{me.name || me.email}</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {me.can_fill_form && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-white/25 bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/25"
                onClick={() => setFormOpen(true)}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                New FMS form
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-white/25 bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/20 disabled:opacity-70"
              onClick={() => void load(true)}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <MyAccessBar
        assignedSteps={editSteps}
        viewOnlySteps={viewOnlySteps}
        officeLabel={officeLabel}
        canFillForm={me.can_fill_form}
      />

      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-[232px]">
          <div
            className="overflow-hidden rounded-[10px]"
            style={{ background: 'var(--sidebar-bg)' }}
          >
            <p
              className="mono px-4 pt-4 pb-2 text-[9.5px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'rgba(255,255,255,0.32)' }}
            >
              Navigation
            </p>
            <nav className="px-2 pb-2" aria-label="Sections">
              {(
                [
                  { key: 'pending', label: 'Pending tasks', count: pendingCount, Icon: Timer },
                  { key: 'completed', label: 'Completed', count: doneCount, Icon: CheckCircle2 },
                  { key: 'all', label: 'Everything I see', count: boardTotal, Icon: ClipboardList },
                ] as { key: Section; label: string; count: number; Icon: typeof Timer }[]
              ).map((entry) => {
                const active = section === entry.key;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setSection(entry.key)}
                    aria-current={active ? 'page' : undefined}
                    className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-[12.5px] transition-colors"
                    style={{
                      color: active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                      background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    <entry.Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    <span className="mono shrink-0 rounded-full bg-white/15 px-1.5 text-[10px] font-semibold text-white">
                      {entry.count}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-white/10 px-4 py-3">
              <p
                className="mono mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'rgba(255,255,255,0.32)' }}
              >
                Legend
              </p>
              <ul className="space-y-1">
                {[
                  { color: 'var(--petrol)', label: 'Assigned to you' },
                  { color: 'var(--steel)', label: 'View only' },
                  { color: 'var(--rust)', label: 'Overdue' },
                  { color: 'var(--forest)', label: 'Completed' },
                ].map((entry) => (
                  <li
                    key={entry.label}
                    className="flex items-center gap-2 text-[10.5px]"
                    style={{ color: 'var(--sidebar-text)' }}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: entry.color }} />
                    {entry.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {error && (
            <div className="mb-3">
              <ErrorStrip message={error} onRetry={() => void load(true)} />
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">
                {section === 'pending' ? 'Pending tasks' : section === 'completed' ? 'Completed' : 'Everything I can see'}
              </h1>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                {visible.length} of {boardTotal} current {boardTotal === 1 ? 'step' : 'steps'} across{' '}
                {board.records.length} {board.records.length === 1 ? 'FMS record' : 'FMS records'}.
              </p>
            </div>
            <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
              <input
                className="input pl-8"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search company, PO, supplier, step"
                aria-label="Search tasks"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--faint)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {visibleStepsOf(me).length === 0 ? (
            <div className="card">
              <div className="px-6 py-14 text-center">
                <p className="text-[13px] font-semibold text-[var(--ink)]">No steps assigned</p>
                <p className="mx-auto mt-1 max-w-[380px] text-[12px] leading-relaxed text-[var(--muted)]">
                  Ask your administrator to grant step access in the control room under Operators &amp; access.
                </p>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="card">
              <div className="px-6 py-14 text-center">
                <p className="text-[13px] font-semibold text-[var(--ink)]">
                  {section === 'completed' ? 'Nothing completed yet' : 'All caught up'}
                </p>
                <p className="mx-auto mt-1 max-w-[380px] text-[12px] leading-relaxed text-[var(--muted)]">
                  {query
                    ? 'No tasks match that search.'
                    : section === 'completed'
                      ? 'Completed steps appear here as they are submitted.'
                      : 'Every record is waiting on someone else. The next step appears here when it opens.'}
                </p>
              </div>
            </div>
          ) : (
            <div ref={scrollContainerRef} className="lane-scroll flex gap-3 overflow-x-auto pb-2">
              {lanes.map((lane) => {
                const overdue = Boolean(lane.key) && isOverdueKey(lane.key, today);
                const isToday = Boolean(lane.key) && lane.key === today;
                return (
                  <div
                    key={lane.key || 'undated'}
                    ref={isToday ? todayColumnRef : undefined}
                    className="flex w-full min-w-[280px] max-w-[340px] shrink-0 flex-col overflow-hidden rounded-[9px] border bg-[var(--surface)] sm:w-[320px]"
                    style={{
                      borderColor: isToday ? 'var(--amber)' : 'var(--line)',
                      boxShadow: isToday ? '0 6px 18px -14px rgba(11,32,28,.45)' : undefined,
                    }}
                  >
                    <div
                      className="border-b px-3 py-2.5"
                      style={{
                        borderColor: overdue ? 'var(--rust)' : isToday ? 'var(--amber)' : 'var(--line)',
                        background: isToday ? 'var(--amber-tint)' : undefined,
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h2 className="text-[12.5px] font-semibold text-[var(--ink)]">
                          {lane.key ? formatDate(lane.key) : 'No planned date'}
                        </h2>
                        {isToday && <span className="tag tag-amber">Today</span>}
                        {overdue && <span className="tag tag-rust">Overdue</span>}
                      </div>
                      <p className="mono mt-0.5 text-[10px] text-[var(--muted)]">
                        {lane.tasks.length} {lane.tasks.length === 1 ? 'task' : 'tasks'}
                      </p>
                    </div>

                    <div className="flex max-h-[620px] flex-col gap-2 overflow-y-auto p-2">
                      {lane.tasks.map((task) => {
                        const editable = task.access_level === 'EDIT';
                        const done = isDone(task);
                        const late = Boolean(task.planned_at) && isOverdueKey(dateKey(task.planned_at), today);
                        const accent = done
                          ? 'var(--forest)'
                          : late
                            ? 'var(--rust)'
                            : editable
                              ? 'var(--petrol)'
                              : 'var(--steel)';
                        return (
                          <article
                            key={`${task.fms_id}-${task.step_number}`}
                            className="task-card rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-2.5"
                            style={{ borderLeft: `3px solid ${accent}` }}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className="mono inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[5px] text-[11px] font-semibold text-white"
                                style={{ background: accent }}
                              >
                                {task.step_number}
                              </span>
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => setDetailId(task.fms_id)}
                                  className="block w-full truncate text-left text-[12.5px] font-semibold text-[var(--ink)]"
                                >
                                  {task.company_name}
                                </button>
                                <p className="mono truncate text-[10px] text-[var(--muted)]">
                                  {task.fms_id} · PO {task.po_number || '—'}
                                </p>
                              </div>
                              <span className="mono shrink-0 rounded-[4px] bg-[var(--sunken)] px-1 py-[1px] text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
                                {task.location}
                              </span>
                            </div>

                            <p className="mt-1.5 truncate text-[11.5px] text-[var(--ink-2)]">
                              {task.step_number}. {STEP_TITLES[task.step_number] ?? task.step_name}
                            </p>

                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-[var(--muted)]">
                              <span
                                className={`mono rounded-[4px] border px-1 py-[1px] text-[9px] font-semibold uppercase tracking-[0.06em] ${
                                  editable
                                    ? 'border-[var(--petrol)] bg-[var(--petrol-tint)] text-[var(--petrol)]'
                                    : 'border-[var(--steel)] bg-[var(--steel-tint)] text-[var(--steel)]'
                                }`}
                              >
                                {editable ? 'Assigned to you' : 'View only'}
                              </span>
                              <span className="font-semibold text-[var(--ink-2)]">{task.status}</span>
                              <span
                                style={{
                                  color: done ? 'var(--forest)' : late ? 'var(--rust)' : undefined,
                                }}
                              >
                                {task.delay_display || delayLabel(task.planned_at, task.actual_completed_at, today)}
                              </span>
                            </div>

                            {task.step_number === 7 && (
                              <p className="mono mt-1 text-[10.5px] text-[var(--muted)]">
                                Paid {money(task.paid_amount)} of {money(task.gross_total)}
                              </p>
                            )}

                            <div className="mt-2 flex items-center justify-end gap-1.5">
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailId(task.fms_id)}>
                                Open
                              </button>
                              {task.can_submit && (
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => void openSubmit(task)}>
                                  Submit
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      <PrimaryFormSheet
        open={formOpen}
        people={board?.form_filled_by ?? []}
        onClose={() => setFormOpen(false)}
        onSubmitted={(count) => {
          setToast({
            message: `${count} ${count === 1 ? 'FMS record' : 'FMS records'} created.`,
            tone: 'success',
          });
          void load(true);
        }}
      />

      <StepSubmitSheet
        open={Boolean(submitTarget)}
        state={submitTarget?.state ?? null}
        step={submitTarget?.step ?? null}
        onClose={() => setSubmitTarget(null)}
        onSubmitted={submitSuccess}
      />

      <FmsDetailSheet
        open={Boolean(detailId)}
        fmsId={detailId}
        onClose={() => setDetailId(null)}
        refreshKey={refreshKey}
        onOpenStep={(state, step) => {
          setDetailId(null);
          setSubmitTarget({ state, step });
        }}
      />

      <ToastViewport toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
