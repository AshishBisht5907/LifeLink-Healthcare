'use client';

import { useApi } from '@/lib/useApi';
import { documentsApi } from '@/lib/api';
import { friendlyError } from '@/lib/format';
import { Card } from '@/components/ui/Primitives';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { PortalPatientGate } from '@/components/portal/PortalPatientGate';
import { LockedPatientState } from '@/components/portal/LockedPatientState';
import { useAuth } from '@/context/AuthContext';
import { DocumentsPanel } from '@/components/records/DocumentsPanel';

function Content({ patientId }: { patientId: string }) {
  const { user } = useAuth();
  const documents = useApi(() => documentsApi.list(patientId), [patientId]);
  if (documents.loading) return <LoadingBlock rows={4} />;
  // A refusal is NOT "no documents": say so instead of showing an empty list.
  if (documents.error) {
    return documents.error.status === 403 && user?.role === 'FAMILY'
      ? <LockedPatientState patientName="this patient" />
      : <Card><ErrorState status={documents.error.status} description={friendlyError(documents.error.status)} onRetry={documents.refetch} /></Card>;
  }
  return <DocumentsPanel patientId={patientId} documents={documents.data?.results ?? []} onChanged={documents.refetch} canUpload canVerify={false} />;
}

export default function PortalDocumentsPage() {
  return <PortalPatientGate title="Documents" subtitle="Reports and records in your LifeLink file, and uploads you add yourself.">{(id) => <Content patientId={id} />}</PortalPatientGate>;
}
