'use client';

import Link from 'next/link';
import { ChevronRight, FileCheck2, Info } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/lib/useApi';
import { consentsApi } from '@/lib/api';
import { sortConsents } from '@/lib/consentView';
import { formatDateTime, friendlyError } from '@/lib/format';
import { Card } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { MoreNotice } from '@/components/ui/FilterPills';

export default function PortalConsentsPage() {
  const { user } = useAuth();
  const consents = useApi(() => consentsApi.list());
  const isPatient = user?.role === 'PATIENT';
  const rows = sortConsents(consents.data?.results ?? []);
  const waiting = rows.filter((c) => c.status === 'PENDING').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Consent</h1>
        <p className="mt-0.5 text-sm text-muted">{isPatient ? 'Procedures the hospital needs your agreement for.' : 'Consent requests for the patients you are linked to.'}{waiting > 0 && <strong className="text-foreground"> {waiting} waiting for an answer.</strong>}</p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-tint px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>{isPatient
          ? 'Your most recent consent also decides whether authorised family members can open your record. Approving opens it to them; declining or withdrawing locks it.'
          : 'Only the patient answers consent requests. A family member can open the record only while the patient\u2019s most recent consent is approved.'}</p>
      </div>

      <Card>
        {consents.loading ? <LoadingBlock rows={3} /> : consents.error ? (
          <ErrorState status={consents.error.status} description={friendlyError(consents.error.status)} onRetry={consents.refetch} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<FileCheck2 className="h-5 w-5" />} title="No consent requests" description={isPatient ? 'Requests that need your approval will appear here.' : 'No consent requests exist for your linked patients.'} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/portal/consents/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-neutral-tint">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.procedure_description}</p>
                    <p className="text-xs text-muted">{!isPatient && c.patient_name ? `${c.patient_name} \u00B7 ` : ''}Requested {formatDateTime(c.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2"><StatusBadge kind="consent" value={c.status} /><ChevronRight className="h-4 w-4 text-muted" /></div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {consents.data?.next && <MoreNotice shown={consents.data.results.length} />}
      </Card>
    </div>
  );
}
