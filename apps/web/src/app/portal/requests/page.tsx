'use client';

import { useState } from 'react';
import { BedDouble } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { admissionsApi, requestsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PortalPatientGate } from '@/components/portal/PortalPatientGate';
import { RequestsView } from '@/components/records/RequestsView';
import { NewServiceRequestForm } from '@/components/records/NewServiceRequestForm';
import { Card, Field, Select } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { friendlyError } from '@/lib/format';

function Content({ patientId, canCreate }: { patientId: string; canCreate: boolean }) {
  const requests = useApi(() => requestsApi.list({ patient: patientId }), [patientId]);
  const admissions = useApi(() => admissionsApi.list(), [patientId], canCreate);
  const [selectedAdmissionId, setSelectedAdmissionId] = useState('');
  const activeAdmissions = (admissions.data?.results ?? [])
    .filter((admission) => admission.patient === patientId && admission.status === 'ACTIVE')
    .sort((a, b) => new Date(b.admitted_at).getTime() - new Date(a.admitted_at).getTime());
  const selectedAdmission = activeAdmissions.find((admission) => admission.id === selectedAdmissionId) ?? activeAdmissions[0];

  return (
    <div className="space-y-5">
      {canCreate && admissions.loading && <LoadingBlock rows={2} />}
      {canCreate && admissions.error && (
        <Card><ErrorState status={admissions.error.status} description={friendlyError(admissions.error.status)} onRetry={admissions.refetch} /></Card>
      )}
      {canCreate && !admissions.loading && !admissions.error && activeAdmissions.length === 0 && (
        <Card><EmptyState icon={<BedDouble className="h-5 w-5" />} title="No active admission" description="A service request can be created while you have an active hospital admission." /></Card>
      )}
      {canCreate && selectedAdmission && (
        <>
          {activeAdmissions.length > 1 && (
            <Card className="p-4">
              <Field label="Hospital stay">
                <Select value={selectedAdmission.id} onChange={(event) => setSelectedAdmissionId(event.target.value)}>
                  {activeAdmissions.map((admission) => (
                    <option key={admission.id} value={admission.id}>{admission.hospital_name} · {admission.admission_number}</option>
                  ))}
                </Select>
              </Field>
            </Card>
          )}
          <NewServiceRequestForm patientId={patientId} admissionId={selectedAdmission.id} onCreated={requests.refetch} patientMode />
        </>
      )}
      <RequestsView viewer="patient" requests={requests.data?.results ?? []} hasMore={!!requests.data?.next} loading={requests.loading} error={requests.error} refetch={requests.refetch} />
    </div>
  );
}

export default function PortalRequestsPage() {
  const { user } = useAuth();
  return <PortalPatientGate title="Requests" subtitle="Tests, procedures and other care requested for you, and where each one stands.">{(id) => <Content patientId={id} canCreate={user?.role === 'PATIENT'} />}</PortalPatientGate>;
}
