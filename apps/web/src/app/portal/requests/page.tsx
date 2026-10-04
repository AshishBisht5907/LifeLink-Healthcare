'use client';

import { useApi } from '@/lib/useApi';
import { requestsApi } from '@/lib/api';
import { PortalPatientGate } from '@/components/portal/PortalPatientGate';
import { RequestsView } from '@/components/records/RequestsView';

function Content({ patientId }: { patientId: string }) {
  const requests = useApi(() => requestsApi.list({ patient: patientId }), [patientId]);
  return <RequestsView viewer="patient" requests={requests.data?.results ?? []} hasMore={!!requests.data?.next} loading={requests.loading} error={requests.error} refetch={requests.refetch} />;
}

export default function PortalRequestsPage() {
  return <PortalPatientGate title="Requests" subtitle="Tests, procedures and other care requested for you, and where each one stands.">{(id) => <Content patientId={id} />}</PortalPatientGate>;
}
