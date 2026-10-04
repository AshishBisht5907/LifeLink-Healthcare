'use client';

import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { consentsApi } from '@/lib/api';
import { Card } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingBlock, ErrorState, EmptyState } from '@/components/ui/States';
import { FileCheck2 } from 'lucide-react';

export default function StaffConsentsPage() {
  const consents = useApi(() => consentsApi.list());

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Consents</h1>
        <p className="mt-0.5 text-sm text-muted">Only the patient or an authorised family member can approve or decline.</p>
      </div>
      <Card>
        {consents.loading ? (
          <LoadingBlock rows={3} />
        ) : consents.error ? (
          <ErrorState status={consents.error.status} onRetry={consents.refetch} />
        ) : consents.data && consents.data.results.length > 0 ? (
          <ul className="divide-y divide-border">
            {consents.data.results.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.procedure_description}</p>
                  <p className="text-xs text-muted">{c.patient_name} · requested {new Date(c.created_at).toLocaleString()}</p>
                </div>
                <StatusBadge kind="consent" value={c.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<FileCheck2 className="h-5 w-5" />} title="No consent requests" />
        )}
      </Card>
    </div>
  );
}
