'use client';

import { useMemo, useState } from 'react';
import { Contact, Search } from 'lucide-react';
import { EmptyState, Micro } from '../ui';
import { formatDateTime } from '@/lib/format';
import type { ClientRecord } from '@/lib/fms/types';

/**
 * Client memory.
 *
 * Mobile and email are captured once per company and reused the next time that
 * company appears in an uploaded sheet — this panel shows what is remembered.
 */
export const ClientsPanel = ({
  clients,
  onRefresh,
}: {
  clients: ClientRecord[];
  onToast: (message: string, tone: 'success' | 'error' | 'info') => void;
  onRefresh: () => void;
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) =>
      [client.company_name, client.supplier, client.mobile, client.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [clients, query]);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">Client memory</h1>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">
          Contact details saved the first time a company is entered. The next upload fills them in automatically.
        </p>
      </div>

      <div className="relative max-w-[420px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
        <input
          className="input pl-8"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search company, mobile or email"
          aria-label="Search client memory"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Contact className="h-5 w-5" />}
            title="No saved contacts yet"
            description="Complete one company block on the primary form and its mobile and email are remembered here."
          />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--sunken)] text-left text-[10px] uppercase tracking-[0.07em] text-[var(--muted)]">
                <th className="px-3 py-2 font-semibold">Company</th>
                <th className="px-3 py-2 font-semibold">Supplier</th>
                <th className="px-3 py-2 font-semibold">Mobile</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.company_name} className="border-b border-[var(--line)]/60">
                  <td className="px-3 py-2 text-[var(--ink)]">{client.company_name}</td>
                  <td className="px-3 py-2 text-[11px] text-[var(--muted)]">{client.supplier || '—'}</td>
                  <td className="mono px-3 py-2 text-[11px] text-[var(--ink-2)]">{client.mobile || '—'}</td>
                  <td className="px-3 py-2 text-[11px] text-[var(--ink-2)]">{client.email || '—'}</td>
                  <td className="mono px-3 py-2 text-[10.5px] text-[var(--muted)]">
                    {formatDateTime(client.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Micro>Source: Clients sheet in the workbook · {clients.length} companies</Micro>
    </div>
  );
};
