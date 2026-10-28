'use client';

import { useMemo, useRef, useState } from 'react';
import { Copy, KeyRound, Link2, Search, Trash2, Upload, UserPlus } from 'lucide-react';
import { AccessFlagsCell, OfficeAccessCell, StepAccessCell } from '../UserAccessCells';
import { EmptyState, ErrorStrip, Field, Spinner, StatusTag } from '../ui';
import { adminApi } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { parseUserCsv } from '@/lib/excel';
import type { AdminUser } from '@/lib/fms/types';

type StatusFilter = 'all' | 'Active' | 'Disabled';

/**
 * Operator management, in the order an administrator actually works:
 * add a person, decide their step access, then hand them their link.
 *
 * The step and office columns are read-outs of the saved row, so what is shown
 * here is exactly what the operator dashboard will act on.
 */
export const OperatorsPanel = ({
  users,
  onRefresh,
  onOpenAccess,
  onToast,
}: {
  users: AdminUser[];
  onRefresh: () => void;
  onOpenAccess: (user: AdminUser) => void;
  onToast: (message: string, tone: 'success' | 'error' | 'info') => void;
}) => {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [bulkReport, setBulkReport] = useState('');
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [generatingId, setGeneratingId] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [generatedFor, setGeneratedFor] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return users.filter((user) => {
      if (status !== 'all' && user.status !== status) return false;
      if (!term) return true;
      return [user.name, user.email, user.mobile, user.ses_code, user.location_scope]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [users, query, status]);

  const addUser = async () => {
    setAddError('');
    if (!email.trim() || !name.trim()) {
      setAddError('Email and name are required.');
      return;
    }
    setAdding(true);
    try {
      const created = await adminApi.addUser({
        email: email.trim(),
        name: name.trim(),
        mobile: mobile.trim(),
      });
      setEmail('');
      setName('');
      setMobile('');
      onToast('Operator added. Set their step access next.', 'success');
      onRefresh();
      // Straight into the access sheet: a new operator with no steps sees nothing.
      if (created.user) onOpenAccess(created.user);
    } catch (error) {
      const message = errorMessage(error, 'Could not add the operator.');
      setAddError(message);
      onToast(message, 'error');
    } finally {
      setAdding(false);
    }
  };

  const bulkUpload = async () => {
    if (!bulkFile) return;
    setBulkUploading(true);
    setBulkReport('');
    try {
      const rows = parseUserCsv(await bulkFile.text());
      if (!rows.length) {
        setBulkReport('No valid rows found. The CSV needs Email and Name headers.');
        return;
      }
      const result = await adminApi.bulkCreateUsers(
        rows.map((row) => ({
          email: row.email,
          name: row.name,
          mobile: row.mobile,
          ses_code: row.ses_code,
        })),
      );
      setBulkReport(`${result.count} added${result.errors.length ? `, ${result.errors.length} skipped` : ''}.`);
      onToast(`${result.count} operator(s) added.`, 'success');
      setBulkFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onRefresh();
    } catch (error) {
      const message = errorMessage(error, 'Could not import the CSV.');
      setBulkReport(message);
      onToast(message, 'error');
    } finally {
      setBulkUploading(false);
    }
  };

  const toggleStatus = async (user: AdminUser) => {
    setBusyId(user.id);
    try {
      await adminApi.setUserStatus(user.id, user.status === 'Active' ? 'Disabled' : 'Active');
      onToast(`${user.name} ${user.status === 'Active' ? 'disabled' : 're-enabled'}.`, 'success');
      onRefresh();
    } catch (error) {
      onToast(errorMessage(error, 'Could not change the status.'), 'error');
    } finally {
      setBusyId('');
    }
  };

  const remove = async (user: AdminUser) => {
    if (user.is_admin) {
      onToast('The administrator account cannot be removed.', 'error');
      return;
    }
    setBusyId(user.id);
    try {
      await adminApi.deleteUser(user.id);
      onToast(`${user.name} removed.`, 'success');
      onRefresh();
    } catch (error) {
      onToast(errorMessage(error, 'Could not remove the operator.'), 'error');
    } finally {
      setBusyId('');
    }
  };

  const generateLink = async (user: AdminUser) => {
    setGeneratingId(user.id);
    setGeneratedLink('');
    setGeneratedFor('');
    setCopied(false);
    try {
      const result = await adminApi.generateUserLink(user.id);
      setGeneratedLink(result.link);
      setGeneratedFor(`${user.name} · ${user.email}`);
      onRefresh();
    } catch (error) {
      onToast(errorMessage(error, 'Could not generate a link.'), 'error');
    } finally {
      setGeneratingId('');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('Copy was blocked by the browser. Select the link and copy it manually.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">Operators &amp; access</h1>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">
          {users.length} people. Set each step to Edit, View, Both or Hidden, then send that person their link.
        </p>
      </div>

      <section className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[var(--petrol)]" />
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">Add new operator</h2>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Field label="Email" required htmlFor="new-email">
              <input
                id="new-email"
                type="email"
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@saraswateng.in"
              />
            </Field>
            <Field label="Name" required htmlFor="new-name">
              <input
                id="new-name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Full name"
              />
            </Field>
            <Field label="Mobile" htmlFor="new-mobile">
              <input
                id="new-mobile"
                type="tel"
                className="input"
                value={mobile}
                onChange={(event) => setMobile(event.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>
          {addError && (
            <div className="mt-2">
              <ErrorStrip message={addError} />
            </div>
          )}
          <button type="button" className="btn btn-primary mt-3" onClick={() => void addUser()} disabled={adding}>
            {adding ? <Spinner /> : <UserPlus className="h-3.5 w-3.5" />}
            {adding ? 'Adding…' : 'Add operator'}
          </button>
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Upload className="h-4 w-4 text-[var(--petrol)]" />
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">Bulk add (CSV)</h2>
          </div>
          <p className="mb-2 text-[11.5px] leading-relaxed text-[var(--muted)]">
            Header row required: <span className="mono">Email, Name</span>, optionally{' '}
            <span className="mono">Mobile</span>. Duplicate emails are skipped.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setBulkFile(event.target.files?.[0] ?? null)}
              className="text-[11.5px] text-[var(--muted)] file:mr-2 file:rounded-[6px] file:border file:border-[var(--line-strong)] file:bg-[var(--surface)] file:px-2 file:py-1 file:text-[11px] file:font-medium file:text-[var(--ink)]"
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void bulkUpload()}
              disabled={!bulkFile || bulkUploading}
            >
              {bulkUploading && <Spinner dark />}
              {bulkUploading ? 'Importing…' : 'Import'}
            </button>
          </div>
          {bulkReport && <p className="mono mt-2 text-[11px] text-[var(--ink-2)]">{bulkReport}</p>}
        </div>
      </section>

      {generatedLink && (
        <section className="card border-[var(--petrol)]/40 bg-[var(--petrol-tint)] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link2 className="h-4 w-4 shrink-0 text-[var(--petrol)]" />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-semibold text-[var(--petrol)]">Permanent link for {generatedFor}</p>
              <code className="mono mt-1 block break-all rounded-[6px] bg-[var(--surface)] px-2 py-1.5 text-[11px] text-[var(--petrol)]">
                {generatedLink}
              </code>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void copyLink()}>
              <Copy className="h-3 w-3" />
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setGeneratedLink('');
                setGeneratedFor('');
              }}
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      <section>
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, mobile or SES code"
              aria-label="Search operators"
              className="input pl-8"
            />
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'Active', 'Disabled'] as StatusFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatus(option)}
                className={`rounded-[6px] px-2.5 py-1 text-[11.5px] font-medium ${
                  status === option
                    ? 'bg-[var(--petrol)] text-white'
                    : 'border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--sunken)]'
                }`}
              >
                {option === 'all' ? 'All' : option}
              </button>
            ))}
          </div>
          <span className="mono text-[10.5px] text-[var(--muted)]">{filtered.length} shown</span>
        </div>

        <p className="mb-2 rounded-[7px] bg-[var(--sunken)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
          Use <strong>Access</strong> to set each step to <strong>Edit</strong> (submit), <strong>View</strong> (read
          only), <strong>Both</strong>, or <strong>Hidden</strong>. <strong>Generate link</strong> creates that
          person&apos;s personal dashboard link. Office access limits which location&apos;s records they can open.
        </p>

        {filtered.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<KeyRound className="h-5 w-5" />}
              title="No operators match"
              description="Clear the search or add an operator to start assigning workflow steps."
            />
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[1040px] text-[12px]">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--sunken)] text-left text-[10px] uppercase tracking-[0.07em] text-[var(--muted)]">
                  <th className="px-3 py-2 font-semibold">Operator</th>
                  <th className="px-3 py-2 font-semibold">Mobile</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Step access</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Office access</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Flags</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id} className="row-hover border-b border-[var(--line)]/60 align-top">
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-semibold text-[var(--ink)]">
                            {user.name}
                          </span>
                          <span className="mono block truncate text-[10.5px] text-[var(--muted)]">{user.email}</span>
                        </span>
                        {user.is_admin && <StatusTag label="Admin" tone="petrol" />}
                        {user.status === 'Disabled' && <StatusTag label="Disabled" tone="quiet" />}
                      </div>
                    </td>
                    <td className="mono px-3 py-2.5 text-[11px] text-[var(--ink-2)]">{user.mobile || '—'}</td>
                    <td className="px-3 py-2.5">
                      <StepAccessCell user={user} />
                    </td>
                    <td className="px-3 py-2.5">
                      <OfficeAccessCell user={user} />
                    </td>
                    <td className="px-3 py-2.5">
                      <AccessFlagsCell user={user} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenAccess(user)}>
                          Access
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => void generateLink(user)}
                          disabled={generatingId === user.id}
                        >
                          <Link2 className="h-3 w-3" />
                          {generatingId === user.id ? 'Generating…' : 'Generate link'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => void toggleStatus(user)}
                          disabled={busyId === user.id || user.is_admin}
                        >
                          {user.status === 'Active' ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon text-[var(--faint)] hover:text-[var(--rust)]"
                          onClick={() => void remove(user)}
                          disabled={busyId === user.id || user.is_admin}
                          aria-label={`Remove ${user.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
