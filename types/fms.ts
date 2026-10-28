export type StepStatus =
  | 'Locked'
  | 'Pending'
  | 'In Progress'
  | 'Overdue'
  | 'Completed'
  | 'Not Applicable';

export type RouteId = 'COMMON' | 'STOCK' | 'DIRECT';

export type AccessLevel = 'NONE' | 'READ' | 'EDIT';

export interface StepPermission {
  step_number: number;
  access_level: AccessLevel;
}

export interface AdminUser {
  id: number | string;
  ses_code: string;
  name: string;
  email: string;
  role: string;
  location_scope: string;
  status: string;
  is_admin: boolean;
  locations: string[];
  permissions: StepPermission[];
  token?: string | null;
}

export interface LineItem {
  name: string;
  qty: number;
  unit: string;
}

export interface ItemRow extends LineItem {
  received: number;
  pending: number;
  extra: number;
  eligible: number;
  allocated: number;
  stock: number;
  direct: number;
}

export interface WorkflowStep {
  step_number: number;
  step_name: string;
  route_id: RouteId;
  planned_at: string | null;
  planned_display: string;
  actual_completed_at: string | null;
  actual_display: string;
  delay_minutes: number | null;
  delay_display: string;
  status: StepStatus;
  remark: string;
  unlocked: boolean;
  access_level?: AccessLevel;
}

export interface OrderState {
  order: {
    id: string;
    location: string;
    company_name: string;
    supplier_name: string;
    mobile: string;
    email: string;
    po_number: string;
    lead_days: number;
    payment_terms: string;
    delivery_date: string;
    po_date: string;
    gross_total: number;
    items_raw: string;
    form_filled_by: string;
    remark: string;
    submission_timestamp: string;
    submitted_display: string;
    overall_status: string;
  };
  items: ItemRow[];
  steps: WorkflowStep[];
  receipts: { id: string; item_name: string; quantity: number; unit: string; entered_by: string; at_display: string }[];
  allocations: { id: string; item_name: string; destination: string; route_id: RouteId; quantity: number; at_display: string }[];
  grns: {
    id: string;
    item_name: string;
    grn_number: string;
    quantity: number;
    unit: string;
    original_quantity: number;
    at_display: string;
  }[];
  ims: { id: string; item_name: string; grn_number: string; quantity: number; verified: string; remark: string; at_display: string }[];
  bills: { id: string; grn_numbers: string; approved: boolean; remark: string; at_display: string }[];
  payouts: { id: string; amount: number; entered_by: string; remark: string; at_display: string }[];
  attachments: { id: string; filename: string; file_url: string; mime_type: string; size_bytes: number; at_display: string }[];
  finance: {
    gross_total: number;
    paid_total: number;
    outstanding: number;
    payment_term_days: number | null;
    terms_flagged: boolean;
    payout_planned: string | null;
    payout_planned_display: string;
    payout_status: string;
  };
  routes: { STOCK: { applicable: boolean; status: string }; DIRECT: { applicable: boolean; status: string } };
  flags: { ims_discrepancy: boolean; terms_flagged: boolean };
  me?: AdminUser | null;
}

export interface OrderSummary {
  id: string;
  company_name: string;
  supplier_name: string;
  po_number: string;
  location: string;
  gross_total: number;
  payment_terms: string;
  submitted_display: string;
  item_count: number;
  overall_status: string;
  outstanding: number;
  flags: { ims_discrepancy: boolean; terms_flagged: boolean };
}

export interface UserTask {
  order_id: string;
  company_name: string;
  supplier_name: string;
  po_number: string;
  location: string;
  step_number: number;
  step_name: string;
  route_id: RouteId;
  status: StepStatus;
  planned_at: string | null;
  planned_display: string;
  actual_completed_at: string | null;
  actual_display: string;
  delay_display: string;
  access_level: AccessLevel;
  can_submit: boolean;
  pending_qty: number;
}

export interface UserTaskBoard {
  me: AdminUser;
  items: UserTask[];
  orders: {
    id: string;
    company_name: string;
    supplier_name: string;
    po_number: string;
    location: string;
    overall_status: string;
    submitted_display: string;
  }[];
}

export interface SupplierContact {
  id(id: any): import("react").Key | null | undefined;
  supplier_name: string;
  mobile: string;
  email: string;
  last_used_at: string;
}

export interface ImportRow {
  row: number;
  company_name: string;
  supplier_name: string;
  po_number: string;
  payment_terms: string;
  gross_total: number;
  problems?: string[];
}

export interface DraftOrder {
  key: string;
  company_name: string;
  supplier_name: string;
  po_number: string;
  payment_terms: string;
  gross_total: number;
  mobile: string;
  email: string;
  lead_days: string;
  delivery_date: string;
  po_date: string;
  items: LineItem[];
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
