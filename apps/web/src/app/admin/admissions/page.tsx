'use client';

import { useApi } from '@/lib/useApi';
import { admissionsApi } from '@/lib/api';
import { AdmissionsBoard } from '@/components/records/AdmissionsBoard';

export default function AdminAdmissionsPage() {
  const admissions = useApi(() => admissionsApi.list());
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">Admissions</h1><p className="mt-0.5 text-sm text-muted">Read-only overview of admissions at your hospital.</p></div>
      <AdmissionsBoard admissions={admissions.data?.results ?? []} hasMore={!!admissions.data?.next} loading={admissions.loading} error={admissions.error} refetch={admissions.refetch} emptyHint="Admissions made by care staff will be listed here." />
    </div>
  );
}
