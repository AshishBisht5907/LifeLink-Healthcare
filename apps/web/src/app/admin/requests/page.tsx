'use client';

import { useApi } from '@/lib/useApi';
import { requestsApi } from '@/lib/api';
import { RequestsView } from '@/components/records/RequestsView';

export default function AdminRequestsPage() {
  const requests = useApi(() => requestsApi.list());
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">Requests</h1><p className="mt-0.5 text-sm text-muted">Read-only overview. Requests are handled by care staff and hospital management.</p></div>
      <RequestsView viewer="admin" requests={requests.data?.results ?? []} hasMore={!!requests.data?.next} loading={requests.loading} error={requests.error} refetch={requests.refetch} />
    </div>
  );
}
