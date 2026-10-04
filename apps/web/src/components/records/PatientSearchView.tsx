'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EyeOff, Search, UserPlus } from 'lucide-react';
import { accessApi, patientsApi, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/context/AuthContext';
import { describeAccess } from '@/lib/accessState';
import { ageFrom, friendlyError, genderLabel } from '@/lib/format';
import { Card, CardHeader, Button, Input, Field } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { AccessStatusBadge } from '@/components/access/AccessStatusBadge';
import { AccessActions } from '@/components/access/AccessActions';
import { AccessRequestsList } from '@/components/access/AccessRequestsList';
import type { PatientSearchRow } from '@/lib/types';

type Params = { lifelink_patient_id?: string; phone?: string };

export function PatientSearchView({ basePath, allowOpen = true, allowRegister = true }: { basePath: string; allowOpen?: boolean; allowRegister?: boolean }) {
  const { user } = useAuth();
  const isManagement = user?.role === 'HOSPITAL_MANAGEMENT';
  // Only Management can hold access grants; the backend refuses this list to everyone else.
  const grants = useApi(() => accessApi.list(), [], isManagement);

  const [byId, setById] = useState('');
  const [byPhone, setByPhone] = useState('');
  const [results, setResults] = useState<PatientSearchRow[] | null>(null);
  const [last, setLast] = useState<Params | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  async function run(params: Params) {
    setSearching(true); setError('');
    try { setResults(await patientsApi.search(params)); setLast(params); }
    catch (err) { setError(err instanceof ApiError && err.status === 400 ? err.message : friendlyError(err instanceof ApiError ? err.status : undefined)); }
    finally { setSearching(false); }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = byId.trim().toUpperCase();
    const phone = byPhone.trim();
    if (!id && !phone) { setError('Enter a LifeLink Patient ID or a phone number.'); return; }
    run(id ? { lifelink_patient_id: id } : { phone });
  }

  // After a request/emergency grant, re-run the same search and reload the grants so every status is the server's.
  function changed() { grants.refetch(); if (last) run(last); }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Patients</h1>
          <p className="mt-0.5 text-sm text-muted">Find a patient by exact LifeLink Patient ID or phone number.</p>
        </div>
        {allowRegister && <Link href={`${basePath}/new`}><Button variant="secondary" size="sm"><UserPlus className="h-3.5 w-3.5" /> Register new patient</Button></Link>}
      </div>

      <Card>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="LifeLink Patient ID"><Input value={byId} onChange={(e) => setById(e.target.value)} placeholder="LL-P-100001" autoComplete="off" /></Field>
          <Field label="Phone number" hint="Used only if no ID is entered."><Input value={byPhone} onChange={(e) => setByPhone(e.target.value)} placeholder="9876500001" inputMode="tel" autoComplete="off" /></Field>
          <Button type="submit" variant="primary" loading={searching}><Search className="h-3.5 w-3.5" /> Search</Button>
        </form>
        {error && <p role="alert" className="px-5 pb-4 text-xs text-danger">{error}</p>}

        {results !== null && (
          results.length === 0 ? (
            <EmptyState icon={<Search className="h-5 w-5" />} title="No matching patient" description="Exact match only. Check the full ID or phone number." />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {results.map((row) => {
                const state = describeAccess(row.id, row, grants.data ?? []);
                const masked = row.access !== 'GRANTED';
                return (
                  <li key={row.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${masked ? 'bg-neutral-tint text-muted' : 'bg-brand-light text-brand-dark'}`}>
                        {masked ? <EyeOff className="h-4 w-4" /> : <span className="text-base font-semibold">{row.full_name.slice(0, 1).toUpperCase()}</span>}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{row.full_name}</p>
                        <p className="font-mono text-xs text-muted">{row.lifelink_patient_id}{row.is_unclaimed && <span className="ml-2 font-sans">· No LifeLink account yet</span>}</p>
                        {row.access === 'GRANTED' ? (
                          <p className="mt-0.5 text-xs text-muted">{[genderLabel(row.gender), ageFrom(row.date_of_birth) !== null ? `${ageFrom(row.date_of_birth)} yrs` : null, row.phone].filter(Boolean).join(' · ')}</p>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted">Details are hidden until access is granted.</p>
                        )}
                        <div className="mt-2"><AccessStatusBadge kind={state.kind} /></div>
                      </div>
                    </div>
                    {isManagement ? (
                      <AccessActions patientId={row.id} patientLabel={row.lifelink_patient_id} state={state} unclaimed={row.is_unclaimed}
                        openHref={`${basePath}/${row.id}`} onChanged={changed} />
                    ) : state.canOpen && allowOpen ? (
                      <Link href={`${basePath}/${row.id}`} className="text-sm font-medium text-brand-dark hover:underline">Open record →</Link>
                    ) : state.canOpen ? (
                      <p className="max-w-xs text-xs text-muted">Clinical records are opened by care staff, not from this page.</p>
                    ) : (
                      <p className="max-w-xs text-xs text-muted">This patient is outside your hospital. Ask hospital management to request access.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}
      </Card>

      {isManagement && (
        <Card>
          <CardHeader title="Your access requests" subtitle="Status of requests and emergency access you have made, as reported by the server." />
          {grants.loading ? <LoadingBlock rows={3} /> : grants.error
            ? <ErrorState status={grants.error.status} description={friendlyError(grants.error.status)} onRetry={grants.refetch} />
            : <AccessRequestsList grants={grants.data ?? []} limit={15} />}
        </Card>
      )}
    </div>
  );
}
