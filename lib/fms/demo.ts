import type {
  AdminUser,
  AllocationLine,
  AllocationSubmission,
  AttachmentRef,
  ClientRecord,
  FmsDraft,
  FmsEntryState,
  FmsRecord,
  FmsSummary,
  GrnRecord,
  GrnSubmission,
  HolidayEntry,
  PayoutRecord,
  PayoutSubmission,
  ReceiptPart,
  ReceiptSubmission,
  Requirement,
  StepPermission,
  UserTask,
  VerificationRecord,
  VerificationSubmission,
  WorkflowStep,
} from './types';
import {
  STEP_DEFS,
  canEditStep,
  delayLabel,
  isStepUnlocked,
  nonWorkingDaysOf,
  paidTotalOf,
  pendingAmountOf,
  plannedDatesOf,
  routeStateOf,
  totalQuantityOf,
  visibleStepsOf,
} from './workflow';

/**
 * Local demo backend.
 *
 * Mirrors the action names and payloads of appsscript/Code.gs so the UI works
 * before a deployment URL exists. Items are kept as plain arrays here; the real
 * backend stores them one-per-line inside a single spreadsheet cell.
 */

/**
 * Bumped whenever the shipped demo data changes shape.
 *
 * A new key means a browser holding the old sample operators and sample FMS
 * records starts clean instead of showing data the user never created.
 */
const KEY = 'fms-demo-store-v4';

interface DemoRecord {
  record: FmsRecord;
  requirements: Requirement[];
  steps: WorkflowStep[];
  receipts: ReceiptPart[];
  allocations: AllocationLine[];
  grn: GrnRecord | null;
  ims: VerificationRecord | null;
  tally: VerificationRecord | null;
  payouts: PayoutRecord[];
  attachments: AttachmentRef[];
}

interface DemoStore {
  users: AdminUser[];
  records: DemoRecord[];
  clients: ClientRecord[];
  holidays: HolidayEntry[];
  sundays: string[];
  active_email: string;
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();

const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

/** The single administrator a fresh store starts with. */
const ADMIN_NAME = 'Sunita Deshpande';
const ADMIN_EMAIL = 'admin@saraswateng.in';

/**
 * Purchase ID, one per company per month per office — `PID-M10OCTO0001`.
 *
 * The office letter, month number, first four letters of the month and a running
 * sequence that restarts every month for that office, matching the backend.
 */
const nextPid = (records: { pid: string }[], location: string, when: string) => {
  const office = String(location || '').toLowerCase() === 'boisar' ? 'B' : 'M';
  const date = new Date(when);
  const monthNumber = String(date.getMonth() + 1).padStart(2, '0');
  const monthName = MONTH_NAMES[date.getMonth()].slice(0, 4);
  const prefix = `PID-${office}${monthNumber}${monthName}`;

  const highest = records.reduce((max, record) => {
    if (!String(record.pid ?? '').startsWith(prefix)) return max;
    const sequence = Number(String(record.pid).slice(prefix.length));
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);

  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
};

/**
 * FMS ID, short but fully readable.
 *
 *   Mumbai, October → PFMS-MO100001
 *   Boisar, October → PFMS-BO100001
 *
 * `PFMS` marks the system, `M`/`B` the office, `O` the first letter of the month,
 * `10` the month number, and the last four digits a running sequence, matching the
 * backend exactly. The month number keeps January/June/July distinct even though
 * they share a first letter, so the sequence can restart each month safely.
 */
const nextFmsId = (records: { id: string }[], location: string, when: string) => {
  const office = String(location || '').toLowerCase() === 'boisar' ? 'B' : 'M';
  const date = new Date(when);
  const monthLetter = MONTH_NAMES[date.getMonth()].slice(0, 1);
  const monthNumber = String(date.getMonth() + 1).padStart(2, '0');
  const prefix = `PFMS-${office}${monthLetter}${monthNumber}`;

  const highest = records.reduce((max, record) => {
    if (!String(record.id ?? '').startsWith(prefix)) return max;
    const sequence = Number(String(record.id).slice(prefix.length));
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);

  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
};

const permission = (step: number, level: 'EDIT' | 'READ'): StepPermission => ({
  step_number: step,
  access_level: level,
});

/**
 * A person's email identifies them, so a link never needs a token.
 *
 * Kept as a tiny helper because several call sites need the same normalisation.
 */
const normalizeEmail = (email: string) => String(email ?? '').trim().toLowerCase();

const makeUser = (
  ses: string,
  name: string,
  email: string,
  role: 'admin' | 'user',
  edit: number[],
  view: number[],
  scope: 'Mumbai' | 'Boisar' | 'Both',
  extra: Partial<AdminUser> = {},
): AdminUser => ({
  id: uid('U'),
  ses_code: ses,
  name,
  email,
  role,
  location_scope: scope,
  status: 'Active',
  is_admin: role === 'admin',
  locations: scope === 'Both' ? ['Mumbai', 'Boisar'] : [scope],
  permissions: edit.map((step) => permission(step, 'EDIT')),
  view_steps: view,
  mobile: '',
  can_fill_form: role === 'admin',
  can_view_all_steps: role === 'admin',
  token: null,
  ...extra,
});

const blankSteps = (): WorkflowStep[] =>
  STEP_DEFS.map((definition) => ({
    step_number: definition.number,
    step_name: definition.name,
    route_id: definition.route,
    planned_at: null,
    actual_completed_at: null,
    status: definition.number === 1 ? 'Pending' : 'Locked',
    delay_display: '—',
    remark: '',
    completed_by: '',
    attachment: '',
    condition_answer: '',
    part_count: 0,
    unlocked: definition.number === 1,
  }));

const actualsOf = (steps: WorkflowStep[]) => {
  const map: Record<number, string | null> = {};
  steps.forEach((step) => {
    map[step.step_number] = step.actual_completed_at;
  });
  return map;
};

/** Re-derives every open step's planned date from its predecessor's actual date. */
const refreshPlan = (
  record: DemoRecord,
  skip: Set<string>,
  submittedAt?: string,
): WorkflowStep[] => {
  const steps = record.steps;
  const planned = plannedDatesOf({
    submittedAt: submittedAt ?? record.record.submitted_display,
    leadDays: record.record.lead_days,
    payTerms: record.record.pay_terms,
    poDate: record.record.po_date,
    skip,
    actuals: actualsOf(steps),
  });
  return steps.map((step) => ({
    ...step,
    planned_at: step.actual_completed_at ? step.planned_at : planned[step.step_number],
    delay_display: delayLabel(
      step.actual_completed_at ? step.planned_at : planned[step.step_number],
      step.actual_completed_at,
    ),
  }));
};

/**
 * Opens the steps whose prerequisites are met; never re-locks a submitted step.
 *
 * A step that has just become reachable must also drop `Locked`, because the
 * submit guard and the task list both look at the status, not just the flag.
 */
const applyUnlocks = (record: DemoRecord): WorkflowStep[] => {
  const route = routeStateOf(record.allocations);
  return record.steps.map((step) => {
    const unlocked = isStepUnlocked(step.step_number, record.steps, route);
    const status = step.status === 'Locked' && unlocked ? 'Pending' : step.status;
    return { ...step, unlocked, status };
  });
};

const makeRecord = (config: {
  /** FMS ID, assigned by the caller so a batch numbers sequentially. */
  fmsId?: string;
  /** Purchase ID; assigned by the caller so a batch numbers sequentially. */
  pid?: string;
  company: {
    company_name: string;
    supplier: string;
    po_number: string;
    mobile: string;
    email: string;
    lead_days: number;
    pay_terms: string;
    delivery_date: string;
    po_date: string;
    gross_total: number;
  };
  location: string;
  items: Requirement[];
  form_filled_by: string;
  remark: string;
  submitted_by: string;
  submittedAt: string;
  skip: Set<string>;
  depth?: number;
  allocations?: AllocationLine[];
  receipts?: ReceiptPart[];
  payouts?: PayoutRecord[];
}): DemoRecord => {
  const id = config.fmsId || nextFmsId([], config.location, config.submittedAt);
  const record: DemoRecord = {
    record: {
      id,
      pid: config.pid ?? '',
      company_name: config.company.company_name,
      supplier: config.company.supplier,
      po_number: config.company.po_number,
      mobile: config.company.mobile,
      email: config.company.email,
      location: config.location,
      lead_days: config.company.lead_days,
      pay_terms: config.company.pay_terms,
      delivery_date: config.company.delivery_date || null,
      po_date: config.company.po_date || null,
      gross_total: config.company.gross_total,
      form_filled_by: config.form_filled_by,
      remark: config.remark,
      submitted_by: config.submitted_by,
      submitted_display: config.submittedAt,
      overall_status: 'Pending',
      is_stopped: false,
      is_completed: false,
    },
    requirements: config.items,
    steps: blankSteps(),
    receipts: config.receipts ?? [],
    allocations: config.allocations ?? [],
    grn: null,
    ims: null,
    tally: null,
    payouts: config.payouts ?? [],
    attachments: [],
  };

  const depth = config.depth ?? 0;
  record.steps = refreshPlan(record, config.skip, config.submittedAt);

  /**
   * Demo records are advanced step by step so every screen has data.
   *
   * Each step is finished only after the one before it, and the plan is rebuilt
   * between steps — that mirrors the real workflow, where step N has no planned
   * date until step N−1 is completed.
   */
  for (let index = 0; index < record.steps.length; index += 1) {
    const target = record.steps[index];
    if (target.step_number > depth) break;

    record.steps = refreshPlan(record, config.skip, config.submittedAt);
    const step = record.steps.find((entry) => entry.step_number === target.step_number);
    if (!step) continue;

    const base = step.planned_at ?? config.submittedAt;
    const actual = new Date(new Date(base).getTime() + (step.step_number % 2 === 0 ? 5 : -3) * 3600000);
    step.actual_completed_at = actual.toISOString();
    step.status = 'Completed';
    step.completed_by = ADMIN_NAME;
    step.part_count = 1;
    step.delay_display = delayLabel(step.planned_at, step.actual_completed_at);
  }
  record.steps = refreshPlan(record, config.skip, config.submittedAt);
  record.steps = applyUnlocks(record);
  record.record.overall_status = depth > 0 ? 'In Progress' : 'Pending';
  return record;
};

/**
 * A brand-new store: the administrator only, and **no data of any kind**.
 *
 * Nothing is ever pre-filled — no sample operators, no sample FMS records, no
 * sample clients, no invented holidays. Whatever appears on screen got there
 * because someone in the app created it, which is the only way the demo store
 * and your real spreadsheet can behave the same.
 */
const buildSeed = (): DemoStore => ({
  users: [makeUser('SES-1001', ADMIN_NAME, ADMIN_EMAIL, 'admin', [1, 2, 3, 4, 5, 6, 7], [], 'Both')],
  records: [],
  clients: [],
  holidays: [],
  sundays: [],
  active_email: ADMIN_EMAIL,
});

/**
 * Reads the stored state, falling back to a fresh store only when there is
 * genuinely nothing saved yet.
 *
 * An empty `records` list is a *valid* state — it means the user has not created
 * any FMS yet. Treating that as "missing data" is what used to re-inject the
 * sample records on every load, so an empty list is now preserved as-is.
 */
const read = (): DemoStore => {
  if (typeof window === 'undefined') return buildSeed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return buildSeed();
    const parsed = JSON.parse(raw) as DemoStore;
    if (!Array.isArray(parsed.users) || !parsed.users.length) return buildSeed();
    return {
      users: parsed.users,
      records: Array.isArray(parsed.records) ? parsed.records : [],
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      holidays: Array.isArray(parsed.holidays) ? parsed.holidays : [],
      sundays: Array.isArray(parsed.sundays) ? parsed.sundays : [],
      active_email: parsed.active_email || ADMIN_EMAIL,
    };
  } catch {
    return buildSeed();
  }
};

const write = (store: DemoStore) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(store));
};

const needUser = (store: DemoStore, email: string): AdminUser => {
  const found = store.users.find((user) => user.email.toLowerCase() === String(email).toLowerCase());
  if (!found) throw new Error('That email is not registered in the system.');
  if (found.status === 'Disabled') throw new Error('This account has been disabled.');
  return found;
};

/**
 * The next free SES code, one past the highest already in the list.
 *
 * Counting the users instead reissues a code as soon as somebody is deleted, and
 * two people sharing a code share their personal link too.
 */
const nextSesCode = (users: AdminUser[], wanted = '') => {
  const requested = wanted.trim();
  if (requested && !users.some((user) => user.ses_code === requested)) return requested;
  const highest = users.reduce((max, user) => {
    const match = String(user.ses_code ?? '').match(/(\d+)\s*$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1000);
  return `SES-${highest + 1}`;
};

/**
 * Resolves who is acting.
 *
 * The email address is the identity. A tab states its own email, so two tabs
 * opened from two different links stay two different people. `active_email` is
 * only a fallback for a browser that has not chosen anyone yet.
 */
const currentUser = (store: DemoStore, email = ''): AdminUser => {
  const wanted = String(email || '').trim().toLowerCase();
  if (wanted) {
    const found = store.users.find((user) => String(user.email || '').trim().toLowerCase() === wanted);
    if (found) return found;
    // A link for someone not in this store must fail loudly instead of quietly
    // opening the wrong person.
    throw new Error('This link is not valid any more. Ask an administrator for a new one.');
  }
  return (
    store.users.find((user) => user.email === store.active_email) ??
    store.users.find((user) => user.is_admin) ??
    store.users[0]
  );
};

const sameScope = (user: AdminUser, location: string) => {
  if (user.is_admin) return true;
  if (!user.location_scope || user.location_scope === 'Both') return true;
  return user.location_scope === location;
};

const skipDays = (store: DemoStore) => nonWorkingDaysOf(store.holidays, store.sundays);

/**
 * The people registered in this store, for the "Form filled by" list.
 *
 * Nothing is hardcoded: adding or renaming an operator is enough, exactly like
 * the AppUsers sheet on the real backend.
 */
const peopleNames = (store: DemoStore) => {
  const seen = new Set<string>();
  const names: string[] = [];
  store.users.forEach((user) => {
    const name = String(user.name ?? '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  });
  return names.sort((a, b) => a.localeCompare(b));
};

/** Arrays a demo record may be missing when it was saved by an older build. */
const asList = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const toState = (entry: DemoRecord, me: AdminUser): FmsEntryState => ({
  record: entry.record,
  requirements: asList<DemoRecord['requirements'][number]>(entry.requirements),
  steps: asList<DemoRecord['steps'][number]>(entry.steps).map((step) => ({
    ...step,
    access_level: canEditStep(me, step.step_number)
      ? 'EDIT'
      : visibleStepsOf(me).includes(step.step_number)
        ? 'READ'
        : 'NONE',
  })),
  // Receipts saved before `lines` existed must not break the operator screen.
  receipts: asList<ReceiptPart>(entry.receipts).map((part) => ({
    ...part,
    lines: asList<ReceiptPart['lines'][number]>(part.lines),
    attachments: asList<ReceiptPart['attachments'][number]>(part.attachments),
  })),
  allocations: asList<DemoRecord['allocations'][number]>(entry.allocations),
  grn: entry.grn ? { ...entry.grn, lines: asList<NonNullable<DemoRecord['grn']>['lines'][number]>(entry.grn.lines) } : null,
  ims: entry.ims,
  tally: entry.tally,
  payouts: asList<DemoRecord['payouts'][number]>(entry.payouts),
  attachments: asList<DemoRecord['attachments'][number]>(entry.attachments),
  me,
});

const toSummary = (entry: DemoRecord): FmsSummary => {
  const active =
    entry.steps.find((step) => step.status !== 'Completed' && step.status !== 'Skipped') ?? entry.steps[entry.steps.length - 1];
  return {
    id: entry.record.id,
    pid: entry.record.pid ?? '',
    company_name: entry.record.company_name,
    supplier: entry.record.supplier,
    po_number: entry.record.po_number,
    location: entry.record.location,
    current_step: active.step_number,
    current_step_name: active.step_name,
    overall_status: entry.record.overall_status,
    is_stopped: entry.record.is_stopped,
    is_completed: entry.record.is_completed,
    submitted_by: entry.record.submitted_by,
    submitted_display: entry.record.submitted_display,
    gross_total: entry.record.gross_total,
    planned_at: active.planned_at,
    delay_display: active.delay_display,
    paid_amount: paidTotalOf(entry.payouts),
    pending_amount: pendingAmountOf(entry.record.gross_total, entry.payouts),
  };
};

const findEntry = (store: DemoStore, id: string) => {
  const found = store.records.find((entry) => entry.record.id === String(id));
  if (!found) throw new Error('That FMS record could not be found.');
  return found;
};

const finishRecord = (entry: DemoRecord) => {
  entry.record.is_completed = entry.steps.every(
    (step) => step.status === 'Completed' || step.status === 'Skipped',
  );
  entry.record.overall_status = entry.record.is_completed
    ? 'Completed'
    : entry.steps.some((step) => step.actual_completed_at)
      ? 'In Progress'
      : 'Pending';
};

export const demoRequest = async <T,>(
  action: string,
  payload: Record<string, unknown> = {},
  email = '',
): Promise<T> => {
  const store = read();
  const commit = (next: DemoStore) => {
    write(next);
    return next;
  };

  /**
   * Resolving the actor can fail on a stale link. `me` is a probe — the sign-in
   * screen calls it on every load — so it reports "not signed in" instead of
   * throwing and blocking the page.
   */
  let me: AdminUser | null = null;
  let identityError = '';
  try {
    me = currentUser(store, email);
  } catch (caught) {
    identityError = String((caught as Error)?.message ?? '');
  }

  switch (action) {
    case 'me':
      return { authenticated: Boolean(me), me } as T;

    case 'verifyUser': {
      const user = needUser(store, String(payload.email ?? ''));
      commit({ ...store, active_email: user.email });
      return { ok: true, me: user, email: user.email } as T;
    }
  }

  if (!me) throw new Error(identityError || 'Sign in to continue.');

  switch (action) {
    case 'listTasks': {
      const items: UserTask[] = [];
      store.records.forEach((entry) => {
        if (!sameScope(me, entry.record.location)) return;
        visibleStepsOf(me).forEach((number) => {
          const step = entry.steps.find((candidate) => candidate.step_number === number);
          if (!step) return;
          items.push({
            fms_id: entry.record.id,
            company_name: entry.record.company_name,
            supplier: entry.record.supplier,
            po_number: entry.record.po_number,
            location: entry.record.location,
            step_number: number,
            step_name: step.step_name,
            route_id: step.route_id,
            status: step.status,
            planned_at: step.planned_at,
            actual_completed_at: step.actual_completed_at,
            delay_display: step.delay_display,
            access_level: canEditStep(me, number) ? 'EDIT' : 'READ',
            can_submit:
              canEditStep(me, number) &&
              step.unlocked &&
              !['Completed', 'Locked', 'Skipped', 'Stopped'].includes(step.status) &&
              !entry.record.is_stopped,
            overall_status: entry.record.overall_status,
            pending_amount: pendingAmountOf(entry.record.gross_total, entry.payouts),
            paid_amount: paidTotalOf(entry.payouts),
            gross_total: entry.record.gross_total,
          });
        });
      });
      items.sort((a, b) => {
        if (a.route_id !== b.route_id) return a.route_id === 'COMMON' ? -1 : 1;
        const left = a.planned_at ? new Date(a.planned_at).getTime() : 0;
        const right = b.planned_at ? new Date(b.planned_at).getTime() : 0;
        return left - right;
      });
      return {
        me,
        items,
        records: store.records
          .filter((entry) => sameScope(me, entry.record.location))
          .map(toSummary),
        form_filled_by: peopleNames(store),
      } as T;
    }

    case 'getFms': {
      const entry = findEntry(store, String(payload.fmsId ?? ''));
      return toState(entry, me) as T;
    }

    case 'listRecords':
      return store.records
        .filter((entry) => sameScope(me, entry.record.location))
        .map(toSummary) as T;

    case 'getClients': {
      const name = String(payload.company_name ?? '').trim().toLowerCase();
      const list = name
        ? store.clients.filter((client) => client.company_name.toLowerCase() === name)
        : store.clients;
      return list as T;
    }

    case 'submitNewFms': {
      const draft = payload as unknown as FmsDraft;
      if (!draft.companies?.length) throw new Error('Add at least one company before submitting.');
      const missingItems = draft.companies.filter((company) => !company.items?.length);
      if (missingItems.length) {
        throw new Error(`Add items for ${missingItems.map((company) => company.company_name).join(', ')}.`);
      }
      const skip = skipDays(store);
      const submittedAt = new Date().toISOString();
      const now = submittedAt;

      // Both IDs are handed out in order, so a batch of companies gets distinct
      // numbers instead of all reading the same store state.
      const issuedPid: { pid: string }[] = store.records.map((entry) => ({ pid: entry.record.pid ?? '' }));
      const issuedFms: { id: string }[] = store.records.map((entry) => ({ id: entry.record.id }));
      const created: DemoRecord[] = draft.companies.map((company) => {
        const pid = nextPid(issuedPid, draft.location, submittedAt);
        const fmsId = nextFmsId(issuedFms, draft.location, submittedAt);
        issuedPid.push({ pid });
        issuedFms.push({ id: fmsId });
        return makeRecord({
          fmsId,
          pid,
          company: {
            company_name: company.company_name,
            supplier: company.supplier,
            po_number: company.po_number,
            mobile: company.mobile,
            email: company.email,
            lead_days: Number(company.lead_days) || 0,
            pay_terms: company.pay_terms,
            delivery_date: company.delivery_date,
            po_date: company.po_date,
            gross_total: Number(company.gross_total) || 0,
          },
          location: draft.location,
          items: company.items.map((item) => ({
            item_name: item.item_name,
            quantity: Number(item.quantity) || 0,
            unit: item.unit || 'Nos',
          })),
          form_filled_by: draft.form_filled_by,
          remark: draft.remark,
          submitted_by: me.email,
          submittedAt: now,
          skip,
        });
      });

      // A company seen before keeps its saved contact details.
      const clients = [...store.clients];
      draft.companies.forEach((company) => {
        const index = clients.findIndex(
          (client) => client.company_name.toLowerCase() === company.company_name.toLowerCase(),
        );
        const record: ClientRecord = {
          company_name: company.company_name,
          supplier: company.supplier,
          mobile: company.mobile,
          email: company.email,
          updated_at: now,
        };
        if (index >= 0) clients[index] = record;
        else clients.push(record);
      });

      commit({ ...store, records: [...created, ...store.records], clients });
      return { ok: true, fms_ids: created.map((entry) => entry.record.id) } as T;
    }

    case 'submitStep': {
      const body = payload as unknown as {
        fms_id: string;
        step_number: number;
        remark?: string;
        attachment_keys?: { filename: string; object_key: string; mime_type: string; size_bytes: number }[];
      };
      const entry = findEntry(store, body.fms_id);
      if (entry.record.is_stopped) throw new Error('This FMS has been stopped.');
      if (!canEditStep(me, body.step_number)) {
        throw new Error(`You do not have submit access to step ${body.step_number}.`);
      }
      const step = entry.steps.find((candidate) => candidate.step_number === body.step_number);
      if (!step) throw new Error('That workflow step does not exist.');
      if (!step.unlocked) throw new Error(`Step ${body.step_number} is still locked.`);
      if (['Completed', 'Skipped'].includes(step.status)) {
        throw new Error(`Step ${body.step_number} is already finished.`);
      }

      const skip = skipDays(store);
      const now = new Date().toISOString();
      const total = totalQuantityOf(entry.requirements);

      const attach = () => {
        (body.attachment_keys ?? []).forEach((file) => {
          entry.attachments.push({
            id: uid('ATT'),
            filename: file.filename,
            file_url: file.object_key,
            step_number: body.step_number,
            part_number: step.part_count + 1,
            uploaded_at: now,
          });
        });
        if (body.attachment_keys?.length) {
          step.attachment = body.attachment_keys.map((file) => file.object_key).join(', ');
        }
      };

      switch (body.step_number) {
        case 1: {
          attach();
          step.status = 'Completed';
          step.actual_completed_at = now;
          step.completed_by = me.name;
          step.part_count += 1;
          step.remark = body.remark ?? '';
          break;
        }

        case 2: {
          const submission = payload as unknown as ReceiptSubmission;
          const lines = (submission.lines ?? []).filter((line) => Number(line.received) > 0);
          if (!lines.length) throw new Error('Enter the quantity received for at least one item.');
          const received = receivedTotals(entry.receipts);
          const part: ReceiptPart = {
            part_number: entry.receipts.length + 1,
            received_at: now,
            received_by: me.name,
            remark: body.remark ?? '',
            lines: entry.requirements.map((item) => ({
              item_name: item.item_name,
              unit: item.unit,
              ordered: item.quantity,
              received: Number(lines.find((line) => line.item_name === item.item_name)?.received) || 0,
            })),
            attachments: [],
          };
          (body.attachment_keys ?? []).forEach((file) => {
            const ref: AttachmentRef = {
              id: uid('ATT'),
              filename: file.filename,
              file_url: file.object_key,
              step_number: 2,
              part_number: part.part_number,
              uploaded_at: now,
            };
            entry.attachments.push(ref);
            part.attachments.push(ref);
          });
          entry.receipts.push(part);
          step.part_count += 1;
          step.remark = body.remark ?? '';

          const fullyReceived = entry.requirements.every(
            (item) => (received[item.item_name] ?? 0) + (part.lines.find((line) => line.item_name === item.item_name)?.received ?? 0) >= item.quantity,
          );
          if (fullyReceived) {
            step.status = 'Completed';
            step.actual_completed_at = now;
            step.completed_by = me.name;
          } else {
            step.status = 'In Progress';
            step.delay_display = delayLabel(step.planned_at, null);

            // The balance stays open here as part 2, so step 3 has to be able to
            // run again for it — otherwise the later quantity could never be split.
            entry.steps.forEach((candidate) => {
              if (candidate.step_number === 3 && candidate.status === 'Completed') {
                candidate.status = 'In Progress';
              }
            });
          }
          break;
        }

        case 3: {
          const submission = payload as unknown as AllocationSubmission;
          const allocations = submission.allocations
            .filter((line) => Number(line.quantity) > 0)
            .map<AllocationLine>((line) => ({
              item_name: line.item_name,
              unit: entry.requirements.find((item) => item.item_name === line.item_name)?.unit ?? 'Nos',
              quantity: Number(line.quantity),
              route: line.route,
              note: line.note ?? '',
            }));
          if (!allocations.length) throw new Error('Enter a quantity for stock or direct to client.');

          // A later receipt part is split on its own run, so earlier allocations
          // are added to rather than replaced.
          allocations.forEach((line) => {
            const existing = entry.allocations.find(
              (current) => current.item_name === line.item_name && current.route === line.route,
            );
            if (existing) existing.quantity += line.quantity;
            else entry.allocations.push(line);
          });

          step.status = 'Completed';
          step.actual_completed_at = now;
          step.completed_by = me.name;
          step.part_count += 1;
          step.remark = body.remark ?? '';

          const route = routeStateOf(entry.allocations);
          if (!route.hasStock) {
            entry.steps.forEach((candidate) => {
              if (candidate.step_number >= 4 && candidate.step_number <= 6) {
                candidate.status = 'Skipped';
                candidate.remark = 'All material went direct to the client.';
              }
            });
          } else {
            // Stock arrived later, so routes skipped by the first split come back.
            entry.steps.forEach((candidate) => {
              if (candidate.step_number >= 4 && candidate.step_number <= 6 && candidate.status === 'Skipped') {
                candidate.status = 'Locked';
                candidate.remark = '';
                candidate.actual_completed_at = null;
              }
            });
          }
          break;
        }

        case 4: {
          const submission = payload as unknown as GrnSubmission;
          if (!submission.grn_number?.trim()) throw new Error('GRN number is required.');
          entry.grn = {
            grn_number: submission.grn_number.trim(),
            po_number: entry.record.po_number,
            created_at: now,
            created_by: me.name,
            lines: (submission.lines ?? []).map((line) => ({
              item_name: line.item_name,
              unit: entry.requirements.find((item) => item.item_name === line.item_name)?.unit ?? 'Nos',
              quantity: Number(line.quantity) || 0,
            })),
            remark: body.remark ?? '',
          };
          step.status = 'Completed';
          step.actual_completed_at = now;
          step.completed_by = me.name;
          step.part_count += 1;
          step.remark = body.remark ?? '';
          break;
        }

        case 5: {
          const submission = payload as unknown as VerificationSubmission;
          entry.ims = {
            po_number: submission.po_number || entry.record.po_number,
            grn_number: submission.grn_number || entry.grn?.grn_number || '',
            quantity: Number(submission.quantity) || total,
            answer: submission.answer ?? 'Yes',
            remark: submission.remark ?? '',
            approved: submission.answer !== 'No',
            at: now,
            by: me.name,
          };
          step.status = 'Completed';
          step.actual_completed_at = now;
          step.completed_by = me.name;
          step.part_count += 1;
          step.remark = submission.remark ?? '';
          step.condition_answer = submission.answer ?? 'Yes';
          break;
        }

        case 6: {
          const submission = payload as unknown as VerificationSubmission;
          if (!submission.approved) throw new Error('Tick the confirmation box to post the bill.');
          entry.tally = {
            po_number: submission.po_number || entry.record.po_number,
            grn_number: submission.grn_number || entry.grn?.grn_number || '',
            quantity: Number(submission.quantity) || total,
            answer: 'Yes',
            remark: submission.remark ?? '',
            approved: true,
            at: now,
            by: me.name,
          };
          step.status = 'Completed';
          step.actual_completed_at = now;
          step.completed_by = me.name;
          step.part_count += 1;
          step.remark = submission.remark ?? '';
          break;
        }

        case 7: {
          const submission = payload as unknown as PayoutSubmission;
          const amount = Number(submission.amount) || 0;
          if (amount <= 0) throw new Error('Enter a payout amount greater than zero.');
          const pending = pendingAmountOf(entry.record.gross_total, entry.payouts);
          if (amount - pending > 0.009) {
            throw new Error(`Only ${pending.toFixed(2)} is still outstanding.`);
          }
          entry.payouts.push({
            part_number: entry.payouts.length + 1,
            amount,
            remark: body.remark ?? '',
            paid_at: now,
            paid_by: me.name,
          });
          step.part_count += 1;
          step.remark = body.remark ?? '';
          const remaining = pendingAmountOf(entry.record.gross_total, entry.payouts);
          if (remaining <= 0.009) {
            step.status = 'Completed';
            step.actual_completed_at = now;
            step.completed_by = me.name;
          } else {
            step.status = 'In Progress';
            step.delay_display = delayLabel(step.planned_at, null);
          }
          break;
        }

        default:
          throw new Error('Unknown workflow step.');
      }

      entry.steps = refreshPlan(entry, skip);
      entry.steps = applyUnlocks(entry);
      finishRecord(entry);
      commit(store);
      return toState(entry, me) as T;
    }

    case 'uploadAttachment': {
      const filename = String(payload.filename ?? 'attachment');
      const base64 = String(payload.base64 ?? '');
      // Demo mode keeps small files inline so previews work without storage.
      const url = base64.length < 400000 ? `data:${String(payload.mimeType ?? 'application/octet-stream')};base64,${base64}` : `demo://${filename}`;
      return {
        id: uid('ATT'),
        filename,
        file_url: url,
        mime_type: String(payload.mimeType ?? 'application/octet-stream'),
        size_bytes: Number(payload.sizeBytes) || 0,
      } as T;
    }

    case 'getAdminData': {
      if (!me.is_admin) throw new Error('Administrator access is required for this action.');
      return {
        users: store.users,
        records: store.records.map(toSummary),
        steps: STEP_DEFS.map((step) => ({ step_number: step.number, name: step.name })),
        locations: ['Mumbai', 'Boisar', 'Both'],
        clients: store.clients,
        holidays: store.holidays,
        sundays: store.sundays,
        form_filled_by: peopleNames(store),
      } as T;
    }

    case 'createUser': {
      const email = String(payload.email ?? '').trim().toLowerCase();
      if (!email || !String(payload.name ?? '').trim()) throw new Error('Email and name are required.');
      if (store.users.some((user) => user.email.toLowerCase() === email)) {
        throw new Error('That email is already registered.');
      }
      const created = makeUser(
        nextSesCode(store.users, String(payload.ses_code ?? '')),
        String(payload.name).trim(),
        email,
        'user',
        [],
        [],
        'Both',
        { can_view_all_steps: true, mobile: String(payload.mobile ?? '') },
      );
      commit({ ...store, users: [...store.users, created] });
      return { ok: true, user: created, email: created.email } as T;
    }

    case 'bulkCreateUsers': {
      const rows = (payload.users ?? []) as { email: string; name: string; mobile: string; ses_code: string }[];
      const created: AdminUser[] = [];
      const errors: { email: string; error: string }[] = [];
      const users = [...store.users];
      rows.forEach((row) => {
        const email = String(row.email ?? '').trim().toLowerCase();
        if (!email || !String(row.name ?? '').trim()) {
          errors.push({ email, error: 'Email and name are required.' });
          return;
        }
        if (users.some((user) => user.email.toLowerCase() === email)) {
          errors.push({ email, error: 'Already registered.' });
          return;
        }
        const person = makeUser(nextSesCode(users, row.ses_code || ''), String(row.name).trim(), email, 'user', [], [], 'Both', {
          can_view_all_steps: true,
          mobile: String(row.mobile ?? ''),
        });
        users.push(person);
        created.push(person);
      });
      commit({ ...store, users });
      return { ok: true, count: created.length, created, errors } as T;
    }

    case 'updateUser': {
      const id = String(payload.user_id ?? '');
      const users = store.users.map((user) => {
        if (user.id !== id) return user;
        const editSteps = (payload.permissions as StepPermission[] | undefined) ?? user.permissions;
        return {
          ...user,
          ses_code: String(payload.ses_code ?? user.ses_code),
          name: String(payload.name ?? user.name),
          email: String(payload.email ?? user.email),
          mobile: String(payload.mobile ?? user.mobile ?? ''),
          location_scope: (payload.location_scope as AdminUser['location_scope']) ?? user.location_scope,
          status: (payload.status as AdminUser['status']) ?? user.status,
          permissions: editSteps.filter((entry) => entry.access_level === 'EDIT'),
          view_steps: (payload.view_steps as number[] | undefined) ?? user.view_steps,
          can_fill_form: Boolean(payload.can_fill_form ?? user.can_fill_form),
          can_view_all_steps: Boolean(payload.can_view_all_steps ?? user.can_view_all_steps),
          locations:
            ((payload.location_scope as string) ?? user.location_scope) === 'Both'
              ? ['Mumbai', 'Boisar']
              : [String(payload.location_scope ?? user.location_scope)],
        };
      });
      commit({ ...store, users });
      return { ok: true, user: users.find((user) => user.id === id) } as T;
    }

    case 'deleteUser': {
      const id = String(payload.user_id ?? '');
      if (store.users.find((user) => user.id === id)?.is_admin) {
        throw new Error('The administrator account cannot be removed.');
      }
      commit({ ...store, users: store.users.filter((user) => user.id !== id) });
      return { ok: true } as T;
    }

    case 'generateUserLink': {
      const user = store.users.find((candidate) => candidate.id === String(payload.user_id));
      if (!user) throw new Error('User not found.');
      const email = String(user.email ?? '').trim().toLowerCase();
      if (!email) throw new Error('That user has no email address, so no link can be built.');
      // The link carries the email and nothing else, so it never rotates.
      return {
        ok: true,
        email,
        link: `${typeof window === 'undefined' ? '' : window.location.origin}/user?email=${encodeURIComponent(email)}`,
      } as T;
    }

    case 'getHolidaysAndSundays':
      return { holidays: store.holidays, sundays: store.sundays } as T;

    case 'addHoliday': {
      const date = String(payload.date ?? '');
      const reason = String(payload.reason ?? 'Holiday');
      if (!date) throw new Error('Pick a date.');
      const holidays = [...store.holidays.filter((entry) => entry.date !== date), { date, reason }];
      commit({ ...store, holidays });
      return { ok: true, holidays } as T;
    }

    case 'removeHoliday': {
      const date = String(payload.date ?? '');
      commit({ ...store, holidays: store.holidays.filter((entry) => entry.date !== date) });
      return { ok: true } as T;
    }

    case 'addSunday': {
      const date = String(payload.date ?? '');
      if (!date) throw new Error('Pick a date.');
      const sundays = Array.from(new Set([...store.sundays, date])).sort();
      commit({ ...store, sundays });
      return { ok: true, sundays } as T;
    }

    case 'removeSunday': {
      const date = String(payload.date ?? '');
      commit({ ...store, sundays: store.sundays.filter((entry) => entry !== date) });
      return { ok: true } as T;
    }

    default:
      throw new Error(`Unknown action "${action}".`);
  }
};

const receivedTotals = (parts: ReceiptPart[]) =>
  (Array.isArray(parts) ? parts : []).reduce<Record<string, number>>((totals, part) => {
    (Array.isArray(part?.lines) ? part.lines : []).forEach((line) => {
      if (!line?.item_name) return;
      totals[line.item_name] = (totals[line.item_name] ?? 0) + (Number(line.received) || 0);
    });
    return totals;
  }, {});

export const resetDemoStore = () => {
  if (typeof window !== 'undefined') window.localStorage.removeItem(KEY);
};

export const resolveDemoEmail = (email: string) => {
  const store = read();
  const wanted = normalizeEmail(email);
  const user = store.users.find((candidate) => normalizeEmail(candidate.email) === wanted);
  if (!user) return null;
  write({ ...store, active_email: user.email });
  return user;
};
