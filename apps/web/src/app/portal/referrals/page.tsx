'use client';

import { useApi } from '@/lib/useApi';
import { referralsApi } from '@/lib/api';
import { Card } from '@/components/ui/Primitives';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { MoreNotice } from '@/components/ui/FilterPills';
import { PortalPatientGate } from '@/components/portal/PortalPatientGate';
import { ReferralRows } from '@/components/records/ReferralRows';
import { friendlyError } from '@/lib/format';

function Content({ patientId }: { patientId: string }) {
  const referrals = useApi(() => referralsApi.list(), [patientId]);
  if (referrals.loading) return <LoadingBlock rows={4} />;
  if (referrals.error) return <Card><ErrorState status={referrals.error.status} description={friendlyError(referrals.error.status)} onRetry={referrals.refetch} /></Card>;
  const mine = (referrals.data?.results ?? []).filter((r) => r.patient === patientId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return (
    <Card>
      <ReferralRows referrals={mine} showPatient={false} emptyTitle="No referrals" emptyHint="If a hospital refers you to another hospital, you can follow it here." />
      {referrals.data?.next && <MoreNotice shown={referrals.data.results.length} />}
    </Card>
  );
}

export default function PortalReferralsPage() {
  return <PortalPatientGate title="Referrals" subtitle="Referrals to other hospitals, and whether they have been accepted.">{(id) => <Content patientId={id} />}</PortalPatientGate>;
}
