export type StepStatus =
  | 'Locked'
  | 'Pending'
  | 'In Progress'
  | 'Completed'
  | 'Skipped'
  | 'Stopped';

export type AccessLevel = 'NONE' | 'READ' | 'EDIT';

export type OfficeScope = 'Mumbai' | 'Boisar' | 'Both';

export type MaterialRoute = 'Stock' | 'Direct to Client';

export interface StepPermission {
  step_number: number;
  access_level: AccessLevel;
}

export interface AdminUser {
  id: string;
  ses_code: string;
  name: string;
  email: string;
  mobile: string;
  role: 'admin' | 'user';
  location_scope: OfficeScope;
  status: 'Active' | 'Disabled';
  is_admin: boolean;
  locations: string[];
  /** Steps granted EDIT (can submit). */
  permissions: StepPermission[];
  /** Steps granted READ only. */
  view_steps: number[];
  can_fill_form: boolean;
  can_view_all_steps: boolean;
  /** Always null: identity is the email address, never a token. */
  token: string | null;
}

export interface Requirement {
  item_name: string;
  quantity: number;
  unit: string;
}

/** One uploaded file, kept per step and per part. */
export interface AttachmentRef {
  id: string;
  filename: string;
  file_url: string;
  step_number: number;
  part_number: number;
  uploaded_at: string | null;
}

/** Step 2: what arrived against each item on the primary form. */
export interface ReceiptLine {
  item_name: string;
  unit: string;
  ordered: number;
  received: number;
}

/** A step 2 receipt round. Part 2 onwards is created when quantity is short. */
export interface ReceiptPart {
  part_number: number;
  received_at: string | null;
  received_by: string;
  remark: string;
  lines: ReceiptLine[];
  attachments: AttachmentRef[];
}

/** Step 3: how much of each received item is stocked and how much goes direct. */
export interface AllocationLine {
  item_name: string;
  unit: string;
  quantity: number;
  route: MaterialRoute;
  /** Set when the other route is implied rather than chosen. */
  note: string;
}

/** Step 4: one GRN per PO, quantities editable at capture time. */
export interface GrnRecord {
  grn_number: string;
  po_number: string;
  created_at: string | null;
  created_by: string;
  lines: { item_name: string; unit: string; quantity: number }[];
  remark: string;
}

/** Steps 5 and 6: the same commercial facts, confirmed differently. */
export interface VerificationRecord {
  po_number: string;
  grn_number: string;
  quantity: number;
  answer: 'Yes' | 'No' | '';
  remark: string;
  approved: boolean;
  at: string | null;
  by: string;
}

/** Step 7: any number of payments until the gross total is settled. */
export interface PayoutRecord {
  part_number: number;
  amount: number;
  remark: string;
  paid_at: string | null;
  paid_by: string;
}

export interface WorkflowStep {
  step_number: number;
  step_name: string;
  route_id: 'COMMON' | 'STOCK' | 'DIRECT';
  planned_at: string | null;
  actual_completed_at: string | null;
  status: StepStatus;
  delay_display: string;
  remark: string;
  completed_by: string;
  attachment: string;
  /** Free-form state per step, e.g. receipt parts or allocations. */
  condition_answer: string;
  /** Number of submitted rounds: step 2 receipts, step 7 payouts. */
  part_count: number;
  unlocked: boolean;
  access_level?: AccessLevel;
}

export interface FmsCompanyInfo {
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
}

export interface FmsRecord {
  id: string;
  /**
   * Purchase ID, one per company per month and office:
   * `PID-M10OCTO0001` for Mumbai, `PID-B10OCTO0001` for Boisar.
   */
  pid: string;
  company_name: string;
  supplier: string;
  po_number: string;
  mobile: string;
  email: string;
  location: string;
  lead_days: number;
  pay_terms: string;
  delivery_date: string | null;
  po_date: string | null;
  gross_total: number;
  form_filled_by: string;
  remark: string;
  submitted_by: string;
  submitted_display: string;
  overall_status: string;
  is_stopped: boolean;
  is_completed: boolean;
}

/**
 * The seven step blocks of one record, exactly as they sit in the Fms sheet.
 *
 * Each step occupies its own group of columns — name, planned, actual, delay,
 * status, by, part — so the sheet reads left to right as the workflow runs and an
 * edit made there is what the app reads back.
 */
export interface StepColumnBlock {
  step_number: number;
  planned_at: string | null;
  actual_completed_at: string | null;
  delay_display: string;
  status: string;
  completed_by: string;
  part_count: number;
}

export interface FmsEntryState {
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
  me: AdminUser | null;
}

export interface FmsSummary {
  id: string;
  pid: string;
  company_name: string;
  supplier: string;
  po_number: string;
  location: string;
  current_step: number;
  current_step_name: string;
  overall_status: string;
  is_stopped: boolean;
  is_completed: boolean;
  submitted_by: string;
  submitted_display: string;
  gross_total: number;
  planned_at: string | null;
  delay_display: string;
  pending_amount: number;
  paid_amount: number;
}

export interface UserTask {
  fms_id: string;
  company_name: string;
  supplier: string;
  po_number: string;
  location: string;
  step_number: number;
  step_name: string;
  route_id: 'COMMON' | 'STOCK' | 'DIRECT';
  status: StepStatus;
  planned_at: string | null;
  actual_completed_at: string | null;
  delay_display: string;
  access_level: AccessLevel;
  can_submit: boolean;
  overall_status: string;
  pending_amount: number;
  paid_amount: number;
  gross_total: number;
}

export interface UserTaskBoard {
  me: AdminUser;
  items: UserTask[];
  records: FmsSummary[];
  form_filled_by: string[];
}

/** One company row read out of the uploaded sheet, before the user completes it. */
export interface SheetCompanyRow {
  company_name: string;
  supplier: string;
  po_number: string;
  pay_terms: string;
  gross_total: number;
}

export interface DraftItem {
  item_name: string;
  quantity: number;
  unit: string;
}

export interface CompanyDraft extends FmsCompanyInfo {
  items: DraftItem[];
}

export interface FmsDraft {
  location: string;
  form_filled_by: string;
  remark: string;
  companies: CompanyDraft[];
}

export interface ClientRecord {
  company_name: string;
  supplier: string;
  mobile: string;
  email: string;
  updated_at: string | null;
}

export interface HolidayEntry {
  date: string;
  reason: string;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Step 1 submission: attachments only. */
export interface AttachmentSubmission {
  fms_id: string;
  step_number: number;
  remark?: string;
  attachment_keys?: { filename: string; object_key: string; mime_type: string; size_bytes: number }[];
}

/** Step 2 submission: one receipt round. */
export interface ReceiptSubmission {
  fms_id: string;
  step_number: number;
  remark?: string;
  lines: { item_name: string; received: number }[];
  attachment_keys?: { filename: string; object_key: string; mime_type: string; size_bytes: number }[];
}

/** Step 3 submission: stock / direct split. */
export interface AllocationSubmission {
  fms_id: string;
  step_number: number;
  remark?: string;
  allocations: { item_name: string; quantity: number; route: MaterialRoute; note?: string }[];
}

/** Step 4 submission: GRN number plus editable quantities. */
export interface GrnSubmission {
  fms_id: string;
  step_number: number;
  grn_number: string;
  remark?: string;
  lines: { item_name: string; quantity: number }[];
}

/** Steps 5 and 6 submission. */
export interface VerificationSubmission {
  fms_id: string;
  step_number: number;
  po_number: string;
  grn_number: string;
  quantity: number;
  answer?: 'Yes' | 'No';
  approved?: boolean;
  remark?: string;
}

/** Step 7 submission: one payout round. */
export interface PayoutSubmission {
  fms_id: string;
  step_number: number;
  amount: number;
  remark?: string;
}

export type SubmitStepPayload =
  | AttachmentSubmission
  | ReceiptSubmission
  | AllocationSubmission
  | GrnSubmission
  | VerificationSubmission
  | PayoutSubmission;
