'use client';

import { useApi } from '@/lib/useApi';
import { referralsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Primitives';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { MoreNotice } from '@/components/ui/FilterPills';
import { ReferralRows } from '@/components/records/ReferralRows';
import { friendlyError } from '@/lib/format';

export default function AdminReferralsPage() {
  const { user } = useAuth();
  const referrals = useApi(() => referralsApi.list());
  const all = [...(referrals.data?.results ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">Referrals</h1><p className="mt-0.5 text-sm text-muted">Read-only overview of referrals sent from or to your hospital.</p></div>
      {referrals.loading ? <LoadingBlock rows={4} /> : referrals.error ? (
        <Card><ErrorState status={referrals.error.status} description={friendlyError(referrals.error.status)} onRetry={referrals.refetch} /></Card>
      ) : (
        <Card>
          <ReferralRows referrals={all} hospitalId={user?.staff_profile?.hospital_id} emptyTitle="No referrals" emptyHint="Referrals for your hospital will appear here." />
          {referrals.data?.next && <MoreNotice shown={all.length} />}
        </Card>
      )}
    </div>
  );
}
