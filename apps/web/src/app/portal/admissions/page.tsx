'use client';

import { useApi } from '@/lib/useApi';
import { admissionsApi } from '@/lib/api';
import { Card } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { MoreNotice } from '@/components/ui/FilterPills';
import { PortalPatientGate } from '@/components/portal/PortalPatientGate';
import { AdmissionRows } from '@/components/records/AdmissionsBoard';
import { friendlyError } from '@/lib/format';
import { BedDouble } from 'lucide-react';

function Content({ patientId }: { patientId: string }) {
  const admissions = useApi(() => admissionsApi.list(), [patientId]);
  if (admissions.loading) return <LoadingBlock rows={4} />;
  if (admissions.error) return <Card><ErrorState status={admissions.error.status} description={friendlyError(admissions.error.status)} onRetry={admissions.refetch} /></Card>;
  const mine = (admissions.data?.results ?? []).filter((a) => a.patient === patientId)
    .sort((a, b) => (a.status === 'ACTIVE' ? -1 : 0) - (b.status === 'ACTIVE' ? -1 : 0) || new Date(b.admitted_at).getTime() - new Date(a.admitted_at).getTime());
  return (
    <Card>
      {mine.length === 0
        ? <EmptyState icon={<BedDouble className="h-5 w-5" />} title="No hospital stays yet" description="When a hospital admits you, the stay appears here, and stays here after discharge." />
        : <AdmissionRows admissions={mine} showPatient={false} />}
      {admissions.data?.next && <MoreNotice shown={admissions.data.results.length} />}
    </Card>
  );
}

export default function PortalAdmissionsPage() {
  return <PortalPatientGate title="Admissions" subtitle="Your current and previous hospital stays.">{(id) => <Content patientId={id} />}</PortalPatientGate>;
}
