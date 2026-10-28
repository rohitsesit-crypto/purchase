'use client';

import { useMemo, useState } from 'react';
import { CalendarOff, Plus, RefreshCw, Sun } from 'lucide-react';
import { EmptyState, ErrorStrip, Field, Micro, Spinner } from '../ui';
import { adminApi } from '@/lib/api';
import { errorMessage, formatDate } from '@/lib/format';
import { nextWorkingDayKey, nonWorkingDaysOf, shiftKey, todayKey } from '@/lib/fms/workflow';
import type { HolidayEntry } from '@/lib/fms/types';

/**
 * Working-day calendar.
 *
 * Every planned date in the system is calculated over working days: Sundays and
 * these holiday dates are stepped over, and a date that would land on one rolls
 * forward to the next working day. Editing here changes all future planning.
 */
export const HolidaysPanel = ({
  holidays,
  sundays,
  onToast,
  onChanged,
}: {
  holidays: HolidayEntry[];
  sundays: string[];
  onToast: (message: string, tone: 'success' | 'error' | 'info') => void;
  onChanged: () => void;
}) => {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [sundayDate, setSundayDate] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const skip = useMemo(() => nonWorkingDaysOf(holidays, sundays), [holidays, sundays]);

  const addHoliday = async () => {
    if (!date) return setError('Pick a date first.');
    setBusy('holiday');
    setError('');
    try {
      await adminApi.addHoliday(date, reason.trim() || 'Holiday');
      setDate('');
      setReason('');
      onToast('Holiday added. Future dates skip it.', 'success');
      onChanged();
    } catch (caught) {
      const message = errorMessage(caught, 'Could not add that holiday.');
      setError(message);
      onToast(message, 'error');
    } finally {
      setBusy('');
    }
  };

  const removeHoliday = async (value: string) => {
    setBusy(value);
    try {
      await adminApi.removeHoliday(value);
      onToast('Holiday removed.', 'success');
      onChanged();
    } catch (caught) {
      onToast(errorMessage(caught, 'Could not remove that holiday.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const addSunday = async () => {
    if (!sundayDate) return setError('Pick a date first.');
    setBusy('sunday');
    setError('');
    try {
      await adminApi.addSunday(sundayDate);
      setSundayDate('');
      onToast('Sunday date added.', 'success');
      onChanged();
    } catch (caught) {
      const message = errorMessage(caught, 'Could not add that date.');
      setError(message);
      onToast(message, 'error');
    } finally {
      setBusy('');
    }
  };

  const removeSunday = async (value: string) => {
    setBusy(value);
    try {
      await adminApi.removeSunday(value);
      onToast('Sunday date removed.', 'success');
      onChanged();
    } catch (caught) {
      onToast(errorMessage(caught, 'Could not remove that date.'), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">Holiday calendar</h1>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">
          {skip.size} closed days. Planned dates never land on one of them — they roll to the next working day.
        </p>
      </div>

      <div className="rounded-[7px] border border-[var(--steel)]/25 bg-[var(--steel-tint)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--steel)]">
        Sunday is always closed, plus every date listed below. If a planned date would fall on a closed day, it moves
        forward — for example a planned 25 Oct that is a Sunday becomes 26 Oct, and a planned date on a holiday moves
        to the day after it.
      </div>

      {error && <ErrorStrip message={error} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <header className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
            <CalendarOff className="h-3.5 w-3.5 text-[var(--rust)]" />
            <h2 className="text-[12.5px] font-semibold text-[var(--ink)]">Holidays</h2>
            <span className="mono ml-auto rounded-full bg-[var(--rust-tint)] px-1.5 py-[1px] text-[10px] font-semibold text-[var(--rust)]">
              {holidays.length}
            </span>
          </header>

          <div className="flex flex-wrap items-end gap-2 border-b border-[var(--line)] px-3 py-2">
            <div className="w-[150px]">
              <Field label="Date">
                <input type="date" className="input" value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
            </div>
            <div className="min-w-[140px] flex-1">
              <Field label="Reason">
                <input
                  className="input"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Diwali"
                />
              </Field>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void addHoliday()} disabled={busy === 'holiday'}>
              {busy === 'holiday' ? <Spinner /> : <Plus className="h-3 w-3" />}
              Add
            </button>
          </div>

          {holidays.length === 0 ? (
            <EmptyState
              icon={<CalendarOff className="h-5 w-5" />}
              title="No holidays yet"
              description="Add the company holidays above. Planned dates skip them automatically."
            />
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--sunken)] text-left text-[10px] uppercase tracking-[0.07em] text-[var(--muted)]">
                  <th className="px-3 py-1.5 font-semibold">Date</th>
                  <th className="px-3 py-1.5 font-semibold">Reason</th>
                  <th className="px-3 py-1.5 text-right font-semibold"> </th>
                </tr>
              </thead>
              <tbody>
                {[...holidays]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((holiday) => (
                    <tr key={holiday.date} className="row-hover border-b border-[var(--line)]/60">
                      <td className="mono px-3 py-1.5 whitespace-nowrap text-[11.5px] text-[var(--rust)]">
                        {formatDate(holiday.date)}
                      </td>
                      <td className="px-3 py-1.5 text-[11.5px] text-[var(--ink-2)]">{holiday.reason}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-[var(--rust)]"
                          onClick={() => void removeHoliday(holiday.date)}
                          disabled={busy === holiday.date}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card overflow-hidden">
          <header className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
            <Sun className="h-3.5 w-3.5 text-[var(--amber)]" />
            <h2 className="text-[12.5px] font-semibold text-[var(--ink)]">Sundays</h2>
            <span className="mono ml-auto rounded-full bg-[var(--amber-tint)] px-1.5 py-[1px] text-[10px] font-semibold text-[var(--amber)]">
              {sundays.length}
            </span>
          </header>

          <div className="flex flex-wrap items-end gap-2 border-b border-[var(--line)] px-3 py-2">
            <div className="w-[150px]">
              <Field label="Date">
                <input
                  type="date"
                  className="input"
                  value={sundayDate}
                  onChange={(event) => setSundayDate(event.target.value)}
                />
              </Field>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void addSunday()} disabled={busy === 'sunday'}>
              {busy === 'sunday' ? <Spinner dark /> : <Plus className="h-3 w-3" />}
              Add date
            </button>
            <span className="mono ml-auto text-[10px] text-[var(--muted)]">
              next working day: {formatDate(nextWorkingDayKey(shiftKey(todayKey(), 1), skip))}
            </span>
          </div>

          {sundays.length === 0 ? (
            <EmptyState
              icon={<Sun className="h-5 w-5" />}
              title="No Sunday dates listed"
              description="Every Sunday is skipped by default; these are extra dates marked as closed."
            />
          ) : (
            <ul className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3">
              {[...sundays].sort().map((value) => (
                <li
                  key={value}
                  className="flex items-center justify-between gap-1 rounded-[6px] border border-[var(--line)] bg-[var(--sunken)] px-2 py-1.5"
                >
                  <span className="mono text-[11px] font-medium text-[var(--amber)]">{formatDate(value)}</span>
                  <button
                    type="button"
                    className="text-[10px] text-[var(--muted)] hover:text-[var(--rust)]"
                    onClick={() => void removeSunday(value)}
                    disabled={busy === value}
                    aria-label={`Remove ${value}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Micro>Planned dates are stored in working days only. Changes here apply to dates planned from now on.</Micro>
    </div>
  );
};
