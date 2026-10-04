'use client';

import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { admissionsApi } from '@/lib/api';
import { AdmissionsBoard } from '@/components/records/AdmissionsBoard';

export default function ManagementAdmissionsPage() {
  const admissions = useApi(() => admissionsApi.list());
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">Admissions</h1><p className="mt-0.5 text-sm text-muted">Patients admitted to your hospital.</p></div>
      <AdmissionsBoard admissions={admissions.data?.results ?? []} hasMore={!!admissions.data?.next} loading={admissions.loading} error={admissions.error} refetch={admissions.refetch}
        detailBase="/management/admissions" emptyHint="Admit a patient from their record and the stay will be listed here."
        action={<p className="text-xs text-muted">To admit a patient, open them from <Link href="/management/patients" className="font-medium text-brand-dark hover:underline">Patients</Link>.</p>} />
    </div>
  );
}
