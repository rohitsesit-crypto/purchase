'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarOff,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { AppShell, type ShellTab } from '@/components/fms/AppShell';
import { EmptyState, ErrorStrip, Micro, SectionBar, Spinner, StatusTag, ToastViewport, type ToastTone } from '@/components/fms/ui';
import { PrimaryFormSheet } from '@/components/fms/PrimaryFormSheet';
import { StepSubmitSheet } from '@/components/fms/StepSubmitSheet';
import { FmsDetailSheet } from '@/components/fms/TaskDetailSheet';
import { RecordBoxList } from '@/components/fms/RecordBox';
import { AccessSheet } from '@/components/fms/admin/AccessSheet';
import { OperatorsPanel } from '@/components/fms/admin/OperatorsPanel';
import { RecordsPanel } from '@/components/fms/admin/RecordsPanel';
import { ClientsPanel } from '@/components/fms/admin/ClientsPanel';
import { HolidaysPanel } from '@/components/fms/admin/HolidaysPanel';
import { adminApi, captureAccessFromUrl, fmsApi, isDemoMode, setSessionEmail, type AdminDashboard } from '@/lib/api';
import { resetDemoStore } from '@/lib/fms/demo';
import { formatDate, money, num, errorMessage } from '@/lib/format';
import { STEP_DEFS, dateKey, isOverdueKey, nextWorkingDayKey, nonWorkingDaysOf } from '@/lib/fms/workflow';
import type { AdminUser, FmsEntryState, FmsSummary, WorkflowStep } from '@/lib/fms/types';

const TABS: { key: ShellTab; label: string }[] = [
  { key: 'workspace', label: 'Control room' },
  { key: 'operators', label: 'Operators & access' },
  { key: 'records', label: 'FMS register' },
  { key: 'clients', label: 'Client memory' },
  { key: 'holidays', label: 'Holiday calendar' },
];

/**
 * Control room — the landing screen.
 *
 * Administrators see the whole purchase desk at once: what is due, what is late,
 * the payout position, and the seven-step spine with how much sits at each stage.
 */
export default function AdminPage() {
  const [tab, setTab] = useState<ShellTab>('workspace');
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [me, setMe] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [email, setEmail] = useState('');
  const [authError, setAuthError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [submitTarget, setSubmitTarget] = useState<{ state: FmsEntryState; step: WorkflowStep } | null>(null);
  const [accessUser, setAccessUser] = useState<AdminUser | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  /**
   * True while the app is serving this browser's local store instead of the
   * Google Sheet. Surfaced in the header, because demo records otherwise look
   * exactly like real ones.
   */
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    void isDemoMode().then(setDemoMode);
  }, []);
  /**
   * The current day is read after mount, never during render: reading the clock
   * while prerendering is unstable and makes the static HTML guess a date.
   */
  const [today, setToday] = useState('');

  useEffect(() => {
    setToday(dateKey(new Date().toISOString()));
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      captureAccessFromUrl();
      const session = await adminApi.me();
      if (!session.authenticated || !session.me) {
        setMe(null);
        setData(null);
        return;
      }
      // A browser can be holding another person's email link. That is not an
      // error — it just means this person is not the administrator, so show the
      // sign-in form instead of a red "administrator access required" banner.
      if (!session.me.is_admin) {
        setMe(null);
        setData(null);
        return;
      }
      setMe(session.me);
      const dashboard = await adminApi.getDashboard();
      setData(dashboard);
    } catch (caught) {
      setError(errorMessage(caught, 'The control room could not be loaded.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Drop back to the sign-in card when an action is refused for lack of admin.
   *
   * A session can be replaced by a personal link opened elsewhere in this
   * browser. When that happens the control room must stop looking usable and show
   * the reason, instead of failing one button at a time.
   */
  useEffect(() => {
    const onDenied = (event: Event) => {
      const detail = String((event as CustomEvent<string>).detail ?? '');
      setMe(null);
      setData(null);
      setAuthError(detail || 'Administrator access is required for this action.');
    };
    window.addEventListener('fms-admin-denied', onDenied);
    return () => window.removeEventListener('fms-admin-denied', onDenied);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('tab') as ShellTab | null;
    if (requested && TABS.some((entry) => entry.key === requested)) setTab(requested);
  }, []);

  /** Keeps the address bar in step with the sidebar without remounting the page. */
  const goToTab = useCallback((next: ShellTab) => {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === 'workspace') params.delete('tab');
    else params.set('tab', next);
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, []);

  const signIn = async () => {
    setLoading(true);
    setAuthError('');
    try {
      const verified = await adminApi.verifyUser(email.trim());
      setSessionEmail(verified.email || email.trim());
      if (!verified.me.is_admin) {
        setAuthError('That account is an operator. Open your workspace instead.');
        setLoading(false);
        return;
      }
      await load();
    } catch (caught) {
      setAuthError(errorMessage(caught, 'That email could not be verified.'));
      setLoading(false);
    }
  };

  const records = data?.records ?? [];
  const skip = useMemo(
    () => nonWorkingDaysOf(data?.holidays ?? [], data?.sundays ?? []),
    [data?.holidays, data?.sundays],
  );

  const stats = useMemo(() => {
    const active = records.filter((record) => !record.is_completed && !record.is_stopped);
    const overdue = active.filter(
      (record) => record.planned_at && isOverdueKey(dateKey(record.planned_at), today),
    );
    const dueToday = active.filter((record) => record.planned_at && dateKey(record.planned_at) === today);
    const payable = records.reduce((sum, record) => sum + record.pending_amount, 0);
    return {
      active: active.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      completed: records.filter((record) => record.is_completed).length,
      payable,
    };
  }, [records, today]);

  /** How many records sit at each step right now. */
  const byStep = useMemo(
    () =>
      STEP_DEFS.map((definition) => ({
        ...definition,
        count: records.filter((record) => record.current_step === definition.number && !record.is_completed).length,
      })),
    [records],
  );

  const attention = useMemo(
    () =>
      records
        .filter(
          (record) =>
            !record.is_completed &&
            !record.is_stopped &&
            record.planned_at &&
            isOverdueKey(dateKey(record.planned_at), today),
        )
        .sort((a, b) => (a.planned_at ?? '').localeCompare(b.planned_at ?? ''))
        .slice(0, 8),
    [records, today],
  );

  const refresh = () => {
    setRefreshKey((key) => key + 1);
    void load(true);
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--paper)]">
        <span className="flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
          <Spinner dark />
          Opening the control room…
        </span>
      </div>
    );
  }

  if (!me || !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--paper)] px-4">
        <div className="card w-full max-w-[440px] px-5 py-6">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Saraswat Purchase FMS</p>
          <h1 className="mt-1 text-[17px] font-semibold tracking-tight text-[var(--ink)]">Administrator sign in</h1>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
            Enter the administrator email registered in the AppUsers sheet. Operators sign in through their personal
            link instead.
          </p>
          {authError && (
            <div className="mt-3 space-y-2">
              <ErrorStrip message={authError} />
              <div className="rounded-[7px] border border-[var(--line)] bg-[var(--sunken)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
                <p className="font-semibold text-[var(--ink)]">Already ran the setup? Check these three things.</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                  <li>
                    In Apps Script, run <span className="mono">setupFms()</span> again — it now repairs an empty or
                    outdated AppUsers sheet and re-creates the admin row.
                  </li>
                  <li>
                    Redeploy so the new code is live: <em>Deploy ▸ Manage deployments ▸ Edit ▸ Version: New version ▸
                    Deploy</em>.
                  </li>
                  <li>
                    Run <span className="mono">diagnoseFms()</span> and read the execution log — it prints every email
                    the sheet actually contains.
                  </li>
                </ol>
              </div>
            </div>
          )}
          <div className="mt-4 space-y-2">
            <input
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@saraswateng.in"
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

  return (
    <AppShell
      active={tab}
      me={me}
      syncLabel={`${records.length} FMS records`}
      onRefresh={refresh}
      refreshing={refreshing}
      onNavigate={goToTab}
    >
      {error && (
        <div className="mb-3">
          <ErrorStrip message={error} onRetry={() => void load(true)} />
        </div>
      )}

      {demoMode && (
        <div className="mb-3 rounded-[7px] border border-[var(--amber)]/45 bg-[var(--amber-tint,#fdf4e3)] px-3 py-2">
          <p className="text-[12px] font-semibold text-[var(--ink)]">Not connected to your Google Sheet</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--ink-2)]">
            Everything below lives in this browser only — it is not your spreadsheet, so names and records here may
            differ from the sheet. Set <span className="mono">APPS_SCRIPT_URL</span> in{' '}
            <span className="mono">.env.local</span> to the deployed <span className="mono">/exec</span> URL and the app
            will read your real AppUsers, Fms and Clients sheets instead.
          </p>
          <button
            type="button"
            className="btn btn-outline btn-sm mt-2"
            onClick={() => {
              resetDemoStore();
              setDemoMode(true);
              void load();
            }}
          >
            Clear local data
          </button>
        </div>
      )}

      {tab === 'workspace' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight text-[var(--ink)]">Control room</h1>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                Seven-step purchase flow across Mumbai and Boisar.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                New FMS form
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Active FMS', value: num(stats.active), Icon: Clock, tone: 'var(--petrol)' },
              { label: 'Due today', value: num(stats.dueToday), Icon: CalendarOff, tone: 'var(--steel)' },
              { label: 'Overdue', value: num(stats.overdue), Icon: AlertTriangle, tone: 'var(--rust)' },
              { label: 'Payout pending', value: money(stats.payable), Icon: Wallet, tone: 'var(--amber)' },
            ].map((stat) => (
              <div key={stat.label} className="card px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <stat.Icon className="h-3 w-3" style={{ color: stat.tone }} />
                  <Micro>{stat.label}</Micro>
                </div>
                <p className="mono mt-1 text-[16px] font-semibold text-[var(--ink)]">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
            <section className="card px-3 py-3">
              <SectionBar title="Workflow spine" description="Where the open records are sitting right now." />
              <ol className="space-y-1">
                {byStep.map((step) => (
                  <li key={step.number} className="flex items-center gap-2 rounded-[6px] px-1.5 py-1">
                    <span className="mono flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[5px] bg-[var(--petrol-tint)] text-[10px] font-semibold text-[var(--petrol)]">
                      {step.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink)]">{step.name}</span>
                    {step.route !== 'COMMON' && (
                      <span className="tag tag-quiet">{step.route === 'STOCK' ? 'Stock' : 'Direct'}</span>
                    )}
                    <span className="mono w-[26px] shrink-0 text-right text-[11px] font-semibold text-[var(--ink)]">
                      {step.count}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 border-t border-[var(--line)] pt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                Step 3 splits the material. Stock continues through 4 → 6; anything sent direct to the client jumps to
                step 7, and both routes run on the same record.
              </p>
            </section>

            <section className="card px-3 py-3">
              <SectionBar
                title="Needs attention"
                count={stats.overdue}
                description="Past the planned date and still open."
              />
              {attention.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  title="Nothing overdue"
                  description="Every open FMS is inside its planned dates."
                />
              ) : (
                <ul className="space-y-1">
                  {attention.map((record) => (
                    <li key={record.id} className="row-hover flex flex-wrap items-center gap-2 rounded-[6px] px-1.5 py-1">
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-[var(--ink)]"
                        onClick={() => setDetailId(record.id)}
                      >
                        {record.company_name}
                      </button>
                      <span className="mono hidden text-[10px] text-[var(--muted)] sm:inline">
                        step {record.current_step}
                      </span>
                      <span className="mono text-[10px] text-[var(--rust)]">{formatDate(record.planned_at)}</span>
                      <ChevronRight className="h-3 w-3 shrink-0 text-[var(--faint)]" />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <div className="px-3 pt-3">
              <SectionBar
                title="Latest records"
                count={records.length}
                description="Open any record to see the full step timeline, receipts and payouts."
                action={
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setTab('records')}>
                    View register
                    <ArrowRight className="h-3 w-3" />
                  </button>
                }
              />
            </div>
            <RecordTable records={records.slice(0, 8)} onOpen={setDetailId} />
          </section>

          <section className="card px-3 py-3">
            <SectionBar
              title="Operators"
              count={data.users.length}
              description="Add people, decide which steps they can submit, then send their link."
              action={
                <button type="button" className="btn btn-primary btn-sm" onClick={() => goToTab('operators')}>
                  <UserPlus className="h-3 w-3" />
                  Add operator
                </button>
              }
            />
            <div className="flex flex-wrap gap-1.5">
              {data.users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="flex items-center gap-1.5 rounded-[6px] border border-[var(--line)] px-2 py-1 text-[11.5px] text-[var(--ink-2)] hover:bg-[var(--sunken)]"
                  onClick={() => setAccessUser(user)}
                  title="Open step access and the personal link"
                >
                  <Users className="h-3 w-3 text-[var(--muted)]" />
                  {user.name}
                  <span className="mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    {user.is_admin ? 'admin' : user.status === 'Disabled' ? 'disabled' : `${user.permissions.length} edit`}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'operators' && (
        <OperatorsPanel
          users={data.users}
          onRefresh={() => void load(true)}
          onOpenAccess={setAccessUser}
          onToast={(message, tone) => setToast({ message, tone })}
        />
      )}

      {tab === 'records' && (
        <RecordsPanel
          records={records}
          onOpen={setDetailId}
          onNew={() => setFormOpen(true)}
        />
      )}

      {tab === 'clients' && (
        <ClientsPanel
          clients={data.clients}
          onToast={(message, tone) => setToast({ message, tone })}
          onRefresh={() => void load(true)}
        />
      )}

      {tab === 'holidays' && (
        <HolidaysPanel
          holidays={data.holidays}
          sundays={data.sundays}
          onToast={(message, tone) => setToast({ message, tone })}
          onChanged={() => void load(true)}
        />
      )}

      <PrimaryFormSheet
        open={formOpen}
        people={data?.form_filled_by ?? []}
        onClose={() => setFormOpen(false)}
        onSubmitted={(count) => {
          setToast({
            message: `${count} ${count === 1 ? 'FMS record' : 'FMS records'} created.`,
            tone: 'success',
          });
          refresh();
        }}
      />

      <StepSubmitSheet
        open={Boolean(submitTarget)}
        state={submitTarget?.state ?? null}
        step={submitTarget?.step ?? null}
        onClose={() => setSubmitTarget(null)}
        onSubmitted={() => {
          setToast({ message: 'Step submitted.', tone: 'success' });
          refresh();
        }}
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

      {accessUser && (
        <AccessSheet
          open={Boolean(accessUser)}
          user={accessUser}
          onClose={() => setAccessUser(null)}
          onSaved={() => {
            setToast({ message: 'Access updated.', tone: 'success' });
            refresh();
          }}
          onToast={(message, tone) => setToast({ message, tone })}
        />
      )}

      <ToastViewport toast={toast} onDismiss={() => setToast(null)} />

      <div className="mt-6 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-3">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => goToTab(entry.key)}
            className={`rounded-[6px] px-2 py-1 text-[11.5px] font-medium ${
              tab === entry.key ? 'bg-[var(--petrol-tint)] text-[var(--petrol)]' : 'text-[var(--muted)]'
            }`}
          >
            {entry.label}
          </button>
        ))}
        <span className="mono ml-auto text-[10px] text-[var(--faint)]">
          {today ? `Next working day after today: ${formatDate(nextWorkingDayKey(today, skip))}` : null}
        </span>
      </div>
    </AppShell>
  );
}

const RecordTable = ({
  records,
  onOpen,
}: {
  records: FmsSummary[];
  onOpen: (id: string) => void;
}) => (
  <div className="px-3 pb-3">
    <RecordBoxList records={records} onOpen={onOpen} emptyTitle="No records yet" emptyDescription="Submit the primary form to create the first FMS record." />
  </div>
);
