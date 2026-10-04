'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { referralsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button, Card } from '@/components/ui/Primitives';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { FilterPills, MoreNotice } from '@/components/ui/FilterPills';
import { ReferralRows } from '@/components/records/ReferralRows';
import { filterReferrals, referralCounts, type ReferralTab } from '@/lib/listViews';
import { friendlyError } from '@/lib/format';

export default function ReferralsListPage() {
  const { user } = useAuth();
  const hospitalId = user?.staff_profile?.hospital_id;
  const referrals = useApi(() => referralsApi.list());
  const [tab, setTab] = useState<ReferralTab>('ALL');

  const all = referrals.data?.results ?? [];
  const c = referralCounts(all, hospitalId);
  const rows = filterReferrals(all, tab, hospitalId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold">Referrals</h1><p className="mt-0.5 text-sm text-muted">Patients sent from or to your hospital. {c.AWAITING > 0 && <strong className="text-foreground">{c.AWAITING} awaiting a reply.</strong>}</p></div>
        <Link href="/management/referrals/new"><Button variant="primary" size="sm"><Plus className="h-3.5 w-3.5" /> New referral</Button></Link>
      </div>
      {referrals.loading ? <LoadingBlock rows={4} /> : referrals.error ? (
        <Card><ErrorState status={referrals.error.status} description={friendlyError(referrals.error.status)} onRetry={referrals.refetch} /></Card>
      ) : (
        <>
          <FilterPills label="Referral direction" value={tab} onChange={setTab}
            options={[{ value: 'ALL', label: 'All', count: c.ALL }, { value: 'OUTGOING', label: 'Outgoing', count: c.OUTGOING }, { value: 'INCOMING', label: 'Incoming', count: c.INCOMING }]} />
          <Card>
            <ReferralRows referrals={rows} hospitalId={hospitalId} detailBase="/management/referrals"
              emptyTitle={all.length === 0 ? 'No referrals yet' : 'No referrals in this view'} emptyHint="Referrals sent or received by your hospital will appear here." />
            {referrals.data?.next && <MoreNotice shown={all.length} />}
          </Card>
        </>
      )}
    </div>
  );
}
