'use client';

import { useApi } from '@/lib/useApi';
import { hospitalsApi, referralsApi, requestsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CommandCenterOverview } from '@/components/management/CommandCenterOverview';
import { CareCommandCenter } from '@/components/management/CareCommandCenter';
import { RoleBasedActionCenter } from '@/components/management/RoleBasedActionCenter';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { Card } from '@/components/ui/Primitives';
import { friendlyError } from '@/lib/format';

export default function ManagementOverviewPage() {
  const { user } = useAuth();
  const hospitalId = user?.staff_profile?.hospital_id;
  const requests = useApi(() => requestsApi.list());
  const referrals = useApi(() => referralsApi.list());
  const capacities = useApi(() => hospitalsApi.capacity(hospitalId), [hospitalId], !!hospitalId);
  const analysisReady = !!requests.data && !!referrals.data && !!capacities.data;

  if (requests.loading || referrals.loading || capacities.loading) {
    return (
      <div className="space-y-10">
        <CommandCenterOverview />
        <Card>
          <LoadingBlock rows={5} />
        </Card>
      </div>
    );
  }

  if (requests.error || referrals.error || capacities.error) {
    return (
      <div className="space-y-10">
        <CommandCenterOverview />
        <Card>
          <ErrorState
            description={friendlyError(requests.error?.status ?? referrals.error?.status ?? capacities.error?.status)}
            onRetry={() => { requests.refetch(); referrals.refetch(); capacities.refetch(); }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <CommandCenterOverview />
      {analysisReady && (
        <section className="space-y-6" aria-label="Workflow analysis">
          <h2 className="text-lg font-semibold">Workflow analysis</h2>
          <CareCommandCenter requests={requests.data!.results} referrals={referrals.data!.results} capacities={capacities.data!.results} />
          {user && <RoleBasedActionCenter role={user.role} requests={requests.data!.results} referrals={referrals.data!.results} />}
        </section>
      )}
    </div>
  );
}
