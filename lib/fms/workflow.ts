import type {
  AccessLevel,
  AdminUser,
  AllocationLine,
  FmsEntryState,
  PayoutRecord,
  StepStatus,
  WorkflowStep,
} from './types';

export interface StepDefinition {
  number: number;
  name: string;
  desk: string;
  route: 'COMMON' | 'STOCK' | 'DIRECT';
  /** Steps that can be submitted more than once (receipt rounds, payouts). */
  repeatable: boolean;
  purpose: string;
}

/**
 * Seven-step purchase workflow. Step 3 decides where material goes: stock
 * continues through 4 → 5 → 6, while material sent straight to the client skips
 * to step 7. Step 7 (payout) always applies and runs on its own clock.
 */
export const STEP_DEFS: StepDefinition[] = [
  { number: 1, name: 'Follow Up with Supplier', desk: 'Purchase', route: 'COMMON', repeatable: false, purpose: 'Chase the supplier and record the paperwork.' },
  { number: 2, name: 'Received Material', desk: 'Stores', route: 'COMMON', repeatable: true, purpose: 'Book what physically arrived, item by item.' },
  { number: 3, name: 'Material Status', desk: 'Stores', route: 'COMMON', repeatable: false, purpose: 'Split each item into stock or direct to client.' },
  { number: 4, name: 'GRN Creation', desk: 'Stores', route: 'STOCK', repeatable: false, purpose: 'Raise the goods receipt note against the PO.' },
  { number: 5, name: 'IMS Entry', desk: 'Accounts', route: 'STOCK', repeatable: false, purpose: 'Confirm the IMS posting matches the GRN.' },
  { number: 6, name: 'Purchase Bill Entry in Tally & Approved by ABS', desk: 'Accounts', route: 'STOCK', repeatable: false, purpose: 'Post the purchase bill and record ABS approval.' },
  { number: 7, name: 'Payout Made', desk: 'Accounts', route: 'DIRECT', repeatable: true, purpose: 'Pay the supplier until the gross total is settled.' },
];

export const ALL_STEPS = STEP_DEFS.map((definition) => definition.number);

/** Steps that only exist when material is taken into stock. */
export const STOCK_STEPS = [4, 5, 6];

export const STEP_TITLES: Record<number, string> = Object.fromEntries(
  STEP_DEFS.map((definition) => [definition.number, definition.name]),
);

export const stepDefinition = (step: number): StepDefinition =>
  STEP_DEFS.find((definition) => definition.number === step) ?? STEP_DEFS[0];

export const isStockStep = (step: number) => STOCK_STEPS.includes(step);

/* ------------------------------------------------------------------ access */

const uniqueSorted = (values: number[]) => Array.from(new Set(values)).sort((a, b) => a - b);

export const editStepsOf = (user: AdminUser): number[] =>
  uniqueSorted(
    user.permissions
      .filter((permission) => permission.access_level === 'EDIT')
      .map((permission) => permission.step_number),
  );

export const viewStepsOf = (user: AdminUser): number[] => uniqueSorted(user.view_steps ?? []);

export type StepMode = 'edit' | 'view' | 'both' | 'hidden';

/**
 * The three grantable states. "both" means the operator can submit the step and
 * it also stays in their always-visible list; "hidden" means it is unreachable.
 */
export const stepModeOf = (user: AdminUser, step: number): StepMode => {
  const edit = editStepsOf(user).includes(step);
  const view = viewStepsOf(user).includes(step);
  if (edit && view) return 'both';
  if (edit) return 'edit';
  if (view) return 'view';
  return 'hidden';
};

export const accessLevelOf = (user: AdminUser, step: number): AccessLevel => {
  if (user.is_admin) return 'EDIT';
  if (editStepsOf(user).includes(step)) return 'EDIT';
  if (viewStepsOf(user).includes(step)) return 'READ';
  return 'NONE';
};

export const canEditStep = (user: AdminUser, step: number) =>
  user.status === 'Active' && accessLevelOf(user, step) === 'EDIT';

export const canViewStep = (user: AdminUser, step: number) =>
  user.status === 'Active' && accessLevelOf(user, step) !== 'NONE';

export const visibleStepsOf = (user: AdminUser): number[] => {
  const own = uniqueSorted([...editStepsOf(user), ...viewStepsOf(user)]);
  if (own.length > 0) return own;
  if (user.can_view_all_steps || user.is_admin) return ALL_STEPS;
  return [];
};

export const readOnlyStepsOf = (user: AdminUser): number[] =>
  visibleStepsOf(user).filter((step) => accessLevelOf(user, step) !== 'EDIT');

export const officeLabelOf = (scope: string) => (scope === 'Both' ? 'All offices' : scope || 'All offices');

export const officeMatches = (user: AdminUser, location: string) => {
  if (user.is_admin) return true;
  if (!user.location_scope || user.location_scope === 'Both') return true;
  return user.location_scope === location;
};

/* ------------------------------------------------------------------- dates */

export const IST = 'Asia/Kolkata';

const partsOf = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

export const dateKey = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = partsOf(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
};

export const todayKey = () => dateKey(new Date().toISOString());

export const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

/** 20 Sep 2026 12:45:00 AM — the format used through the whole system. */
export const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
  return formatted.replace(',', '').replace(/\b(am|pm)\b/i, (match) => match.toUpperCase());
};

export const offsetDaysKey = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date.toISOString());
};

export const relativeDayLabel = (key: string, today: string = todayKey()): string => {
  if (!key) return 'No date';
  if (!today) return key;
  const target = new Date(`${key}T00:00:00`);
  if (Number.isNaN(target.getTime())) return key;
  const start = new Date(`${today}T00:00:00`);
  const diff = Math.round((target.getTime() - start.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 2 && diff <= 7) return `In ${diff} days`;
  if (diff < -2 && diff >= -7) return `${Math.abs(diff)} days ago`;
  return formatDate(key);
};

/**
 * `today` is passed in explicitly wherever this runs during render, so the clock
 * is never read while a page is being prerendered.
 */
export const isOverdueKey = (key: string, today: string = todayKey()) =>
  Boolean(key) && Boolean(today) && key < today;

/* -------------------------------------------------------- working calendar */

/**
 * Sundays and every date on the Holidays sheet are closed days. Nothing is ever
 * planned on one of them: the date rolls forward to the next working day.
 */

/** Shifts a `YYYY-MM-DD` key by whole days without timezone drift. */
export const shiftKey = (key: string, days: number): string => {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return key;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOfKey = (key: string): number => {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return -1;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

export const isSundayKey = (key: string) => weekdayOfKey(key) === 0;

export const nonWorkingDaysOf = (
  holidays: { date?: string | null }[] = [],
  sundays: (string | null | undefined)[] = [],
): Set<string> => {
  const keys = new Set<string>();
  holidays.forEach((holiday) => {
    const key = dateKey(holiday?.date);
    if (key) keys.add(key);
  });
  sundays.forEach((value) => {
    const key = dateKey(value);
    if (key) keys.add(key);
  });
  return keys;
};

export const isNonWorkingKey = (key: string, skip?: Set<string>) =>
  Boolean(key) && (isSundayKey(key) || Boolean(skip?.has(key)));

export const nextWorkingDayKey = (key: string, skip?: Set<string>): string => {
  if (!key) return key;
  let cursor = key;
  for (let guard = 0; guard < 400; guard += 1) {
    if (!isNonWorkingKey(cursor, skip)) return cursor;
    cursor = shiftKey(cursor, 1);
  }
  return cursor;
};

/** `days` working days from `base`; negative walks backwards. */
export const addWorkingDays = (base: string, days: number, skip?: Set<string>): string => {
  const start = dateKey(base) || todayKey();
  const target = Math.round(days) || 0;
  if (target === 0) return nextWorkingDayKey(start, skip);
  const direction = target > 0 ? 1 : -1;
  let cursor = start;
  let remaining = Math.abs(target);
  for (let guard = 0; guard < 800 && remaining > 0; guard += 1) {
    cursor = shiftKey(cursor, direction);
    if (!isNonWorkingKey(cursor, skip)) remaining -= 1;
  }
  return cursor;
};

/**
 * Clock-based planning (step 3 takes +2 hours, step 5 +1 hour). The date part
 * still skips closed days, so a Friday-evening hand-off never lands on a Sunday.
 */
export const addWorkingHours = (base: string, hours: number, skip?: Set<string>): string => {
  const start = new Date(base);
  if (Number.isNaN(start.getTime())) return base;
  const shifted = new Date(start.getTime() + hours * 3600000);
  const shiftedKey = dateKey(shifted.toISOString());
  const key = nextWorkingDayKey(shiftedKey, skip);
  if (!key || key === shiftedKey) return shifted.toISOString();
  const [year, month, day] = key.split('-').map(Number);
  const fixed = new Date(shifted);
  fixed.setUTCFullYear(year, month - 1, day);
  return fixed.toISOString();
};

/** Midday IST timestamp so a `YYYY-MM-DD` key survives a round trip. */
export const keyToTimestamp = (key: string): string => `${key}T06:30:00.000Z`;

export const workingDayNote = (key: string, skip?: Set<string>): string => {
  if (!key || !isNonWorkingKey(key, skip)) return '';
  return isSundayKey(key) ? 'Sunday' : 'Holiday';
};

/** Human delay: `On time`, `2 days late`, `3 hours late`, `1 day early`. */
export const delayLabel = (
  plannedAt?: string | null,
  actualAt?: string | null,
  today: string = todayKey(),
): string => {
  if (!plannedAt) return '—';
  if (!actualAt) return isOverdueKey(dateKey(plannedAt), today) ? 'Overdue' : '—';
  const planned = new Date(plannedAt).getTime();
  const actual = new Date(actualAt).getTime();
  if (Number.isNaN(planned) || Number.isNaN(actual)) return '—';
  const diff = actual - planned;
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 30) return 'On time';
  const late = minutes > 0;
  const abs = Math.abs(minutes);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const value = days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return late ? `${value} late` : `${value} early`;
};

/* ---------------------------------------------------------------- planning */

export interface PlanningContext {
  /** When the primary form was submitted. */
  submittedAt: string;
  leadDays: number;
  payTerms: string;
  poDate: string | null;
  skip: Set<string>;
  /** Actual completion timestamps keyed by step number. */
  actuals: Record<number, string | null>;
}

/**
 * Planned dates for the seven steps.
 *
 * Only the step that is actually running carries a planned date. Step 1 is
 * scheduled from the submission date; every later step stays undated until the
 * step before it is finished, because until then nobody can say when it will
 * start. A record sitting on step 1 therefore shows one date, not seven
 * projections that all shift the moment something slips.
 */
export const plannedDatesOf = (context: PlanningContext): Record<number, string | null> => {
  const { skip } = context;
  const submitted = context.submittedAt || new Date().toISOString();

  // Step 1: submission + lead days − 2 days, counted over working days.
  const leadDays = Number(context.leadDays) || 0;
  const step1 = keyToTimestamp(addWorkingDays(submitted, leadDays - 2, skip));

  /**
   * The moment `step` finished, or null while it is still open. Using this as the
   * base is what keeps step N undated until step N−1 is actually completed.
   */
  const after = (step: number, offset: (base: string) => string): string | null => {
    const finishedAt = context.actuals?.[step];
    return finishedAt ? offset(finishedAt) : null;
  };

  const step2 = after(1, (base) => keyToTimestamp(addWorkingDays(base, 5, skip)));
  const step3 = after(2, (base) => addWorkingHours(base, 2, skip));
  const step4 = after(3, (base) => keyToTimestamp(addWorkingDays(base, 3, skip)));
  const step5 = after(4, (base) => addWorkingHours(base, 1, skip));
  const step6 = after(5, (base) => addWorkingHours(base, 2, skip));

  // Payout runs off the supplier clock, so it is dated from the PO date and pay
  // terms — but only once step 3 has split the material (or stock closed at 6).
  const payDays = Number(String(context.payTerms).replace(/[^\d.-]/g, '')) || 0;
  const step7Base = context.poDate || submitted;
  const step7 =
    context.actuals?.[3] || context.actuals?.[6]
      ? keyToTimestamp(addWorkingDays(step7Base, payDays, skip))
      : null;

  return { 1: step1, 2: step2, 3: step3, 4: step4, 5: step5, 6: step6, 7: step7 };
};

/* ------------------------------------------------------------- progression */

export interface RouteState {
  /** True when any quantity was taken into stock at step 3. */
  hasStock: boolean;
  /** True when any quantity went straight to the client. */
  hasDirect: boolean;
  decided: boolean;
}

export const routeStateOf = (allocations: AllocationLine[]): RouteState => {
  const stock = allocations.filter((line) => line.route === 'Stock').reduce((sum, line) => sum + line.quantity, 0);
  const direct = allocations
    .filter((line) => line.route === 'Direct to Client')
    .reduce((sum, line) => sum + line.quantity, 0);
  return { hasStock: stock > 0, hasDirect: direct > 0, decided: allocations.length > 0 };
};

/**
 * Step availability. Steps run in order, except that 4 and 7 both open once step
 * 3 has split the material — that is the parallel stock / direct pair.
 */
export const isStepUnlocked = (stepNumber: number, steps: WorkflowStep[], route: RouteState): boolean => {
  const byNumber = (number: number) => steps.find((step) => step.step_number === number);
  const done = (number: number) => {
    const step = byNumber(number);
    return Boolean(step && (step.status === 'Completed' || step.status === 'Skipped'));
  };

  if (stepNumber === 1) return true;
  if (stepNumber === 2) return done(1);
  // A short delivery keeps step 2 open for part 2 while step 3 starts on what arrived.
  if (stepNumber === 3) {
    const receipt = byNumber(2);
    return done(2) || Boolean(receipt && receipt.part_count > 0);
  }
  if (stepNumber === 7) {
    // A later receipt part can reopen step 3; payouts must stay reachable once the
    // split has happened, so a part count also counts as "decided".
    const split = byNumber(3);
    return done(3) || done(6) || Boolean(split && split.part_count > 0);
  }
  if (stepNumber === 4) return done(3);
  if (stepNumber === 5) return done(4);
  if (stepNumber === 6) return done(5);
  return false;
};

/** Steps 4–6 are skipped when nothing went into stock. */
export const skippedStepsOf = (route: RouteState): number[] =>
  route.decided && !route.hasStock ? STOCK_STEPS : [];

export const overallStatusOf = (state: Pick<FmsEntryState, 'record' | 'steps'>): string => {
  if (state.record.is_stopped) return 'Stopped';
  if (state.record.is_completed) return 'Completed';
  if (state.steps.some((step) => step.actual_completed_at)) return 'In Progress';
  return 'Pending';
};

export const statusTone = (status: string): 'petrol' | 'steel' | 'amber' | 'rust' | 'forest' | 'quiet' => {
  if (status === 'Completed') return 'forest';
  if (status === 'Stopped' || status === 'Overdue') return 'rust';
  if (status === 'In Progress' || status === 'Partially Submitted' || status === 'Partly received') return 'amber';
  if (status === 'Pending') return 'petrol';
  if (status === 'Locked' || status === 'Skipped') return 'quiet';
  return 'quiet';
};

export const stepStatusTone = (
  step: { status: StepStatus; planned_at?: string | null },
  today?: string,
): ReturnType<typeof statusTone> => {
  if (step.status === 'Pending' && today && step.planned_at && isOverdueKey(dateKey(step.planned_at), today)) {
    return 'rust';
  }
  return statusTone(step.status);
};

/* ------------------------------------------------------------------ money */

export const paidTotalOf = (payouts: PayoutRecord[]) =>
  payouts.reduce((sum, payout) => sum + (Number(payout.amount) || 0), 0);

export const pendingAmountOf = (grossTotal: number, payouts: PayoutRecord[]) => {
  const remaining = (Number(grossTotal) || 0) - paidTotalOf(payouts);
  return remaining > 0.009 ? Math.round(remaining * 100) / 100 : 0;
};

/* ------------------------------------------------------------- quantities */

export const totalQuantityOf = (requirements: { quantity: number }[]) =>
  requirements.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);

export const totalReceivedOf = (lines: { received: number }[]) =>
  lines.reduce((sum, line) => sum + (Number(line.received) || 0), 0);

/**
 * Received so far across every receipt round, keyed by item name.
 *
 * Receipts travel through the sheet as JSON, so a row written by an older build
 * (or edited by hand) can come back with `lines` missing. Totals treat that as
 * "nothing received" instead of throwing, which is what the operator screen
 * needs: a record with a half-written receipt must still open.
 */
export const receivedByItem = (
  parts: { lines?: { item_name: string; received: number }[] | null }[] | null | undefined,
) =>
  (Array.isArray(parts) ? parts : []).reduce<Record<string, number>>((totals, part) => {
    const lines = Array.isArray(part?.lines) ? part.lines : [];
    lines.forEach((line) => {
      if (!line?.item_name) return;
      totals[line.item_name] = (totals[line.item_name] ?? 0) + (Number(line.received) || 0);
    });
    return totals;
  }, {});

export const receivedStatusOf = (ordered: number, received: number): 'Pending' | 'Partly received' | 'Received' | 'Excess' => {
  if (received <= 0) return 'Pending';
  if (received > ordered) return 'Excess';
  if (received < ordered) return 'Partly received';
  return 'Received';
};

/**
 * Quantity already sent to a route, keyed by item name.
 *
 * Step 3 appends to the stored allocations rather than replacing them, so a later
 * receipt part must only be offered what is still un-routed. Without this the
 * same quantity would be split twice.
 */
export const allocatedByItem = (
  lines: { item_name?: string | null; quantity?: number | null }[] | null | undefined,
) =>
  (Array.isArray(lines) ? lines : []).reduce<Record<string, number>>((totals, line) => {
    const name = String(line?.item_name ?? '').trim();
    if (!name) return totals;
    totals[name] = (totals[name] ?? 0) + (Number(line?.quantity) || 0);
    return totals;
  }, {});
