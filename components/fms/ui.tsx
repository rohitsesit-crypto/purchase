'use client';

import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, Check, Inbox, X } from 'lucide-react';
import { statusTone } from '@/lib/fms/workflow';

export type Tone = 'petrol' | 'steel' | 'amber' | 'rust' | 'forest' | 'quiet';

const STAMP_BACKGROUND: Record<Tone, string> = {
  petrol: 'var(--petrol)',
  steel: 'var(--steel)',
  amber: 'var(--amber)',
  rust: 'var(--rust)',
  forest: 'var(--forest)',
  quiet: 'var(--sunken)',
};

const STAMP_FOREGROUND: Record<Tone, string> = {
  petrol: '#ffffff',
  steel: '#ffffff',
  amber: '#ffffff',
  rust: '#ffffff',
  forest: '#ffffff',
  quiet: 'var(--muted)',
};

/** The single geometry that carries the whole system: a mono step numeral. */
export const StepStamp = ({
  step,
  tone = 'petrol',
  size = 26,
  outline = false,
  title,
}: {
  step: number | string;
  tone?: Tone;
  size?: number;
  outline?: boolean;
  title?: string;
}) => (
  <span
    className={`stamp${outline ? ' stamp-outline' : ''}`}
    title={title}
    style={{
      width: size,
      height: size,
      fontSize: Math.max(10, Math.round(size * 0.46)),
      background: outline ? undefined : STAMP_BACKGROUND[tone],
      color: outline ? undefined : STAMP_FOREGROUND[tone],
    }}
  >
    {step}
  </span>
);

export const StatusTag = ({ label, tone }: { label: string; tone?: Tone }) => (
  <span className={`tag tag-${tone ?? statusTone(label)}`}>{label}</span>
);

export const Micro = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`micro ${className}`}>{children}</span>
);

export const Field = ({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={`min-w-0 ${className}`}>
    <label htmlFor={htmlFor} className="mb-1 flex items-baseline gap-1 text-[11.5px] font-semibold text-[var(--ink-2)]">
      <span>{label}</span>
      {required && <span className="text-[var(--rust)]">*</span>}
      {hint && <span className="font-normal text-[var(--faint)]">· {hint}</span>}
    </label>
    {children}
    {error && <p className="mt-1 text-[11px] font-medium text-[var(--rust)]">{error}</p>}
  </div>
);

export const Sheet = ({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  width = 760,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="overlay flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-6"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet card my-auto w-full overflow-hidden"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="micro mb-1">{eyebrow}</p>}
            <h2 className="truncate text-[16px] font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[12px] text-[var(--muted)]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="btn btn-ghost btn-icon">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[calc(100dvh-190px)] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] bg-[var(--row-hover)] px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

export const Spinner = ({ dark = false }: { dark?: boolean }) => (
  <span className={dark ? 'spinner spinner-dark' : 'spinner'} aria-hidden="true" />
);

export const EmptyState = ({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
    <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--sunken)] text-[var(--muted)]">
      {icon ?? <Inbox className="h-5 w-5" />}
    </span>
    <p className="text-[13px] font-semibold text-[var(--ink)]">{title}</p>
    <p className="max-w-[400px] text-[12px] leading-relaxed text-[var(--muted)]">{description}</p>
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export const ErrorStrip = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex flex-wrap items-center gap-2 rounded-[7px] border border-[var(--rust)]/30 bg-[var(--rust-tint)] px-3 py-2 text-[12px] text-[var(--rust)]">
    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
    <span className="min-w-0 flex-1 break-words">{message}</span>
    {onRetry && (
      <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
        Retry
      </button>
    )}
  </div>
);

export const Meter = ({
  value,
  max,
  unit = '',
  tone = 'amber',
}: {
  value: number;
  max: number;
  unit?: string;
  tone?: 'amber' | 'petrol' | 'forest';
}) => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill = tone === 'forest' ? 'var(--forest)' : tone === 'petrol' ? 'var(--petrol)' : 'var(--amber)';
  return (
    <div className="w-full">
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--sunken)]">
        <div
          className="h-full rounded-full transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>
      <p className="mono mt-1 text-[10.5px] text-[var(--muted)]">
        {(value ?? 0).toLocaleString('en-IN')} / {(max ?? 0).toLocaleString('en-IN')} {unit}
      </p>
    </div>
  );
};

export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
  label?: string;
}) => (
  <div className="inline-flex items-center gap-0.5 rounded-[7px] bg-[var(--sunken)] p-0.5" role="tablist" aria-label={label}>
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(option.value)}
          className={`rounded-[5px] font-medium transition-colors duration-150 ${
            size === 'sm' ? 'px-2 py-[3px] text-[11px]' : 'px-2.5 py-[5px] text-[12px]'
          } ${active ? 'bg-[var(--petrol)] text-white' : 'text-[var(--ink-2)] hover:bg-[var(--surface)]'}`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-start gap-3 py-[6px]">
      <span className="w-[112px] shrink-0 text-[11px] font-semibold text-[var(--muted)]">{label}</span>
      <span className="min-w-0 flex-1 break-words text-[12.5px] text-[var(--ink)]">{value}</span>
    </div>
  );
};

export const SectionBar = ({
  title,
  count,
  description,
  action,
}: {
  title: string;
  count?: number | string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
    <div className="min-w-0">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[var(--ink)]">
        {title}
        {count !== undefined && (
          <span className="mono rounded-full bg-[var(--petrol-tint)] px-1.5 py-[1px] text-[10.5px] font-semibold text-[var(--petrol)]">
            {count}
          </span>
        )}
      </h2>
      {description && <p className="mt-0.5 text-[12px] text-[var(--muted)]">{description}</p>}
    </div>
    {action}
  </div>
);

export type ToastTone = 'success' | 'error' | 'info';

export const ToastViewport = ({
  toast,
  onDismiss,
}: {
  toast: { message: string; tone: ToastTone } | null;
  onDismiss: () => void;
}) => {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const background =
    toast.tone === 'success' ? 'var(--forest)' : toast.tone === 'error' ? 'var(--rust)' : 'var(--petrol)';

  return (
    <div
      className="fixed bottom-5 left-1/2 z-[80] flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-[8px] px-3.5 py-2 text-[12px] font-medium text-white"
      style={{ background, boxShadow: '0 12px 32px -12px rgba(11,32,28,.5)' }}
      role="status"
      aria-live="polite"
    >
      {toast.tone === 'success' ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
      <span>{toast.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="ml-1 opacity-70 hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
