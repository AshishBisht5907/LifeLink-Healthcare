'use client';

import { useApi } from '@/lib/useApi';
import { requestsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { RequestsView } from '@/components/records/RequestsView';

export default function StaffRequestsPage() {
  const { user } = useAuth();
  const dept = user?.staff_profile?.department ?? null;
  const requests = useApi(() => requestsApi.list());
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Requests</h1>
        <p className="mt-0.5 text-sm text-muted">{dept ? `Requests routed to ${dept}, plus any you created.` : 'Requests you can work on.'} The system only sends you what you are allowed to see.</p>
      </div>
      <RequestsView viewer="staff" userId={user?.id} departmentName={dept} requests={requests.data?.results ?? []} hasMore={!!requests.data?.next} loading={requests.loading} error={requests.error} refetch={requests.refetch} />
    </div>
  );
}
