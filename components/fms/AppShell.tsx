'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  CalendarOff,
  ClipboardList,
  Contact,
  LayoutDashboard,
  Moon,
  Sun,
  Users,
  Workflow,
} from 'lucide-react';
import { STEP_DEFS } from '@/lib/fms/workflow';
import type { AdminUser } from '@/lib/fms/types';

export type ShellTab = 'workspace' | 'operators' | 'records' | 'clients' | 'holidays';

const NAV: { key: ShellTab; href: string; label: string; Icon: typeof Users }[] = [
  { key: 'workspace', href: '/admin', label: 'Control room', Icon: LayoutDashboard },
  { key: 'operators', href: '/admin?tab=operators', label: 'Operators & access', Icon: Users },
  { key: 'records', href: '/admin?tab=records', label: 'FMS register', Icon: ClipboardList },
  { key: 'clients', href: '/admin?tab=clients', label: 'Client memory', Icon: Contact },
  { key: 'holidays', href: '/admin?tab=holidays', label: 'Holiday calendar', Icon: CalendarOff },
];

export const BrandMark = ({ size = 26 }: { size?: number }) => (
  <span
    className="mono inline-flex items-center justify-center rounded-[6px] bg-[var(--petrol)] font-semibold text-white"
    style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    aria-hidden="true"
  >
    S
  </span>
);

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
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
};

export const AppShell = ({
  children,
  active,
  me,
  syncLabel,
  syncTone = 'forest',
  onRefresh,
  refreshing = false,
  onNavigate,
}: {
  children: ReactNode;
  active: ShellTab;
  me?: AdminUser | null;
  syncLabel?: string;
  syncTone?: 'forest' | 'amber' | 'rust';
  onRefresh?: () => void;
  refreshing?: boolean;
  /**
   * Client-side tab switch. Without this the sidebar links only rewrite the
   * query string and Next reuses the mounted page, so the tab never changes.
   */
  onNavigate?: (tab: ShellTab) => void;
}) => (
  <div className="flex min-h-dvh bg-[var(--paper)]">
    <aside className="sticky top-0 hidden h-dvh min-h-dvh w-[236px] shrink-0 flex-col self-start bg-[var(--rail)] lg:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <BrandMark size={28} />
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-white">Saraswat O2D</p>
          <p className="mono truncate text-[9.5px] uppercase tracking-[0.12em] text-white/40">Control room</p>
        </div>
      </div>

      <nav className="mt-1" aria-label="Primary">
        {NAV.map(({ key, href, label, Icon }) => (
          <Link
            key={key}
            href={href}
            className="rail-item"
            data-active={active === key}
            onClick={(event) => {
              if (!onNavigate) return;
              event.preventDefault();
              onNavigate(key);
            }}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        <p className="mono mb-2 text-[9px] uppercase tracking-[0.14em] text-white/35">Workflow spine</p>
        <ol className="space-y-[3px]">
          {STEP_DEFS.map((step) => (
            <li key={step.number} className="flex items-center gap-2">
              <span className="mono w-[14px] shrink-0 text-right text-[10px] text-white/35">{step.number}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-white/60">{step.name}</span>
              <span className="mono shrink-0 text-[8.5px] uppercase tracking-[0.08em] text-white/25">{step.desk}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        <p className="mono mb-1.5 text-[9px] uppercase tracking-[0.14em] text-white/35">Colour key</p>
        <ul className="space-y-1">
          {[
            { color: 'var(--petrol)', label: 'Assigned to you' },
            { color: 'var(--steel)', label: 'View only' },
            { color: 'var(--amber)', label: 'Partly submitted' },
            { color: 'var(--rust)', label: 'Overdue / stopped' },
            { color: 'var(--forest)', label: 'Completed' },
          ].map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-[10px] text-white/55">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2 lg:hidden">
            <BrandMark size={24} />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[var(--ink)]">Flowchart Monitoring System</p>
            <p className="mono truncate text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
              Saraswat Engineering Services
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {syncLabel && (
              <span className="hidden items-center gap-1.5 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-2 py-1 sm:flex">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: `var(--${syncTone})` }}
                  aria-hidden="true"
                />
                <span className="mono text-[10px] text-[var(--muted)]">{syncLabel}</span>
              </span>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="btn btn-outline btn-sm"
              >
                {refreshing ? 'Syncing…' : 'Refresh'}
              </button>
            )}
            <ThemeToggle />
            {me && (
              <span className="flex items-center gap-1.5 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-2 py-1">
                <span className="mono max-w-[110px] truncate text-[10px] font-semibold text-[var(--ink)]">{me.name}</span>
                <span className="mono text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  {me.is_admin ? 'Admin' : 'Operator'}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-t border-[var(--line)] px-4 py-1.5 sm:px-6 lg:hidden">
          {NAV.map(({ key, href, label, Icon }) => (
            <Link
              key={key}
              href={href}
              onClick={(event) => {
                if (!onNavigate) return;
                event.preventDefault();
                onNavigate(key);
              }}
              className={`flex shrink-0 items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11.5px] font-medium ${
                active === key ? 'bg-[var(--petrol-tint)] text-[var(--petrol)]' : 'text-[var(--muted)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
          <Link
            href="/user"
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11.5px] font-medium text-[var(--muted)]"
          >
            <Workflow className="h-3.5 w-3.5" />
            My workspace
          </Link>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto w-full max-w-[1480px]">{children}</div>
      </main>
    </div>
  </div>
);
