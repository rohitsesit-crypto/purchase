import type {
  AdminUser,
  ApiEnvelope,
  ClientRecord,
  FmsDraft,
  FmsEntryState,
  FmsSummary,
  HolidayEntry,
  StepPermission,
  SubmitStepPayload,
  UserTaskBoard,
} from './fms/types';

import { demoRequest } from './fms/demo';

/**
 * Thin client for the Google Apps Script Web App (appsscript/Code.gs).
 *
 * Deploy the script as a Web App (Execute as: Me, Access: Anyone with the link),
 * then set the /exec URL on the server in .env.local:
 *
 *   APPS_SCRIPT_URL="https://script.google.com/macros/s/AKfy.../exec"
 *
 * The variable is deliberately private: the browser only ever calls this app's
 * own `/api/fms` route, which forwards the request. Without the variable that
 * route reports demo mode and the in-browser store in lib/fms/demo.ts is used.
 */
const PROXY = '/api/fms';
const ADMIN_EMAIL_KEY = 'fms_admin_email';
const USER_EMAIL_KEY = 'fms_user_email';

const hasWindow = () => typeof window !== 'undefined';

const isAdminPage = () => hasWindow() && window.location.pathname.startsWith('/admin');

/**
 * Identity is the email address — there is no token anywhere in this app.
 *
 * The administrator console keeps its email in localStorage; an operator tab
 * keeps its email in sessionStorage, which is per-tab. Two links open in two
 * tabs therefore stay two different people, and generating a link for one person
 * can never change anybody else's.
 */
export const getSessionEmail = () => {
  if (!hasWindow()) return '';
  const store = isAdminPage() ? window.localStorage : window.sessionStorage;
  return store.getItem(isAdminPage() ? ADMIN_EMAIL_KEY : USER_EMAIL_KEY) ?? '';
};

/** Writes the identity for the page being viewed; an empty string signs that tab out. */
export const setSessionEmail = (email: string) => {
  if (!hasWindow()) return;
  const value = String(email ?? '').trim().toLowerCase();
  if (isAdminPage()) {
    if (value) window.localStorage.setItem(ADMIN_EMAIL_KEY, value);
    else window.localStorage.removeItem(ADMIN_EMAIL_KEY);
    return;
  }
  if (value) window.sessionStorage.setItem(USER_EMAIL_KEY, value);
  else window.sessionStorage.removeItem(USER_EMAIL_KEY);
};

/**
 * Reads the `?email=...` link.
 *
 * The address bar is deliberately left **untouched**: a link must stay exactly as
 * it was sent, so reloading, bookmarking, or forwarding it keeps working instead
 * of collapsing to a bare `/user`.
 */
export const captureAccessFromUrl = () => {
  if (!hasWindow()) return { email: '' };
  const params = new URLSearchParams(window.location.search);
  const email = (params.get('email') ?? '').trim().toLowerCase();
  if (email) setSessionEmail(email);
  return { email: email || getSessionEmail() };
};

/**
 * Announces that the backend refused an action because this browser is not
 * signed in as the administrator.
 *
 * The administrator console listens for this so a replaced or expired session
 * lands on the sign-in card, instead of leaving a screen that looks functional
 * and fails one button at a time.
 */
const notifyAdminDenied = (message: string) => {
  if (!hasWindow()) return;
  if (message.indexOf('Administrator access is required') < 0) return;
  window.dispatchEvent(new CustomEvent('fms-admin-denied', { detail: message }));
};

const request = async <T,>(action: string, payload: object = {}): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload, email: getSessionEmail() }),
      cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach the FMS backend. Check your network.');
  }

  if (!response.ok) throw new Error(`The FMS backend responded with ${response.status}.`);

  const body = (await response.json()) as { demo?: boolean } & ApiEnvelope<T>;

  // The server reports demo mode when no deployment URL is configured. The email
  // goes with it so a link opens the right person, not the last visitor.
  if (body.demo) {
    try {
      return await demoRequest<T>(action, payload as Record<string, unknown>, getSessionEmail());
    } catch (caught) {
      notifyAdminDenied(String((caught as Error)?.message ?? ''));
      throw caught;
    }
  }

  if (!body.ok) {
    const message = body.error || 'The Apps Script backend returned an error.';
    notifyAdminDenied(message);
    throw new Error(message);
  }
  return body.data as T;
};

/**
 * True when the app is serving the local demo store instead of your Google Sheet.
 *
 * Anything shown in that mode was created in this browser, not read from the
 * spreadsheet, so the interface says so plainly rather than letting sample data
 * pass for real records.
 */
export const isDemoMode = async (): Promise<boolean> => {
  if (!hasWindow()) return false;
  try {
    const response = await fetch(PROXY, { method: 'GET', cache: 'no-store' });
    if (!response.ok) return false;
    const body = (await response.json()) as { connected?: boolean };
    return !body.connected;
  } catch {
    return false;
  }
};

export interface UserPayload {
  ses_code: string;
  name: string;
  email: string;
  mobile: string;
  location_scope: string;
  status: string;
  permissions: StepPermission[];
  view_steps: number[];
  can_fill_form: boolean;
  can_view_all_steps: boolean;
}

/**
 * Makes a record safe to render.
 *
 * Steps, receipts, allocations, attachments and payouts all travel through the
 * spreadsheet as JSON cells. A row written by an older build, edited by hand, or
 * saved before a step ever ran can arrive with those fields missing or null, and
 * every screen would then fail on a `.forEach`/`.map` of undefined. Normalising
 * once here means no page has to defend itself individually.
 */
const asList = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const normalizeState = (state: FmsEntryState): FmsEntryState => {
  type Part = FmsEntryState['receipts'][number];
  type PartLine = Part['lines'][number];
  type PartAttachment = Part['attachments'][number];
  type Grn = NonNullable<FmsEntryState['grn']>;
  type GrnLine = Grn['lines'][number];

  const receipts: Part[] = asList<Part>(state.receipts).map((part) => ({
    ...part,
    lines: asList<PartLine>(part?.lines),
    attachments: asList<PartAttachment>(part?.attachments),
  }));
  const grn: Grn | null = state.grn
    ? { ...state.grn, lines: asList<GrnLine>(state.grn.lines) }
    : null;

  return {
    ...state,
    requirements: asList(state.requirements),
    steps: asList(state.steps),
    receipts,
    allocations: asList(state.allocations),
    grn,
    payouts: asList(state.payouts),
    attachments: asList(state.attachments),
  };
};

export interface AdminDashboard {
  users: AdminUser[];
  records: FmsSummary[];
  steps: { step_number: number; name: string }[];
  locations: string[];
  clients: ClientRecord[];
  holidays: HolidayEntry[];
  sundays: string[];
  form_filled_by: string[];
}

export const fmsApi = {
  /** Resolves the personal link into an operator and their assigned tasks. */
  tasks: () => request<UserTaskBoard>('listTasks'),

  getFms: async (fmsId: string) => normalizeState(await request<FmsEntryState>('getFms', { fmsId })),

  listRecords: () => request<FmsSummary[]>('listRecords'),

  getClients: (companyName?: string) => request<ClientRecord[]>('getClients', { company_name: companyName ?? '' }),

  /** The real people registered in AppUsers, for the "Form filled by" dropdown. */
  formFilledBy: async () => (await request<UserTaskBoard>('listTasks')).form_filled_by ?? [],

  submitNewFms: (draft: FmsDraft, requestKey: string) =>
    request<{ ok: boolean; fms_ids: string[] }>('submitNewFms', { ...draft, request_key: requestKey }),

  submitStep: async (payload: SubmitStepPayload) =>
    normalizeState(await request<FmsEntryState>('submitStep', payload)),

  uploadAttachment: async (file: File, fmsId: string, stepNumber: number) => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return request<{ id: string; filename: string; file_url: string; mime_type: string; size_bytes: number }>(
      'uploadAttachment',
      {
        fmsId,
        stepNumber,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        base64: btoa(binary),
      },
    );
  },
};

export const adminApi = {
  me: () => request<{ authenticated: boolean; me: AdminUser | null }>('me'),

  verifyUser: (email: string) => request<{ ok: boolean; me: AdminUser; email: string }>('verifyUser', { email }),

  getDashboard: () => request<AdminDashboard>('getAdminData'),

  addUser: (payload: { email: string; name: string; mobile?: string; ses_code?: string }) =>
    request<{ ok: boolean; user: AdminUser; email: string }>('createUser', payload),

  bulkCreateUsers: (users: { email: string; name: string; mobile?: string; ses_code: string }[]) =>
    request<{
      ok: boolean;
      count: number;
      created: AdminUser[];
      errors: { email: string; error: string }[];
    }>('bulkCreateUsers', { users }),

  updateUserAccess: (payload: UserPayload & { user_id: string }) =>
    request<{ ok: boolean; user: AdminUser }>('updateUser', payload),

  setUserStatus: (userId: string, status: 'Active' | 'Disabled') =>
    request<{ ok: boolean }>('updateUser', { user_id: userId, status }),

  deleteUser: (userId: string) => request<{ ok: boolean }>('deleteUser', { user_id: userId }),

  generateUserLink: (userId: string) =>
    request<{ ok: boolean; link: string; email: string }>('generateUserLink', {
      user_id: userId,
      // Without an absolute base the backend can only return '/user?email=…',
      // which is unusable once pasted into WhatsApp or an email.
      base_url: typeof window === 'undefined' ? '' : window.location.origin,
    }),

  getHolidays: () => request<{ holidays: HolidayEntry[]; sundays: string[] }>('getHolidaysAndSundays'),

  addHoliday: (date: string, reason: string) =>
    request<{ ok: boolean; holidays: HolidayEntry[] }>('addHoliday', { date, reason }),

  removeHoliday: (date: string) => request<{ ok: boolean }>('removeHoliday', { date }),

  addSunday: (date: string) => request<{ ok: boolean; sundays: string[] }>('addSunday', { date }),

  removeSunday: (date: string) => request<{ ok: boolean }>('removeSunday', { date }),
};
