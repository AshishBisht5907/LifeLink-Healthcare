'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowLeftRight } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { admissionsApi, patientsApi, requestsApi, consentsApi, documentsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { LoadingBlock, ErrorState } from '@/components/ui/States';
import { AdmissionOverviewCard, NotesPanel } from '@/components/records/AdmissionOverview';
import { PatientSummaryCard, PatientHistoryTimeline } from '@/components/records/PatientSummaryCard';
import { ServiceRequestList } from '@/components/records/ServiceRequestList';
import { NewServiceRequestForm } from '@/components/records/NewServiceRequestForm';
import { StaffConsentPanel } from '@/components/records/StaffConsentPanel';
import { DocumentsPanel } from '@/components/records/DocumentsPanel';
import { Button } from '@/components/ui/Primitives';

export function AdmissionDetailView({ admissionId, backHref }: { admissionId: string; backHref: string }) {
  const { user } = useAuth();
  const admission = useApi(() => admissionsApi.get(admissionId), [admissionId]);
  const patient = useApi(
    () => (admission.data ? patientsApi.get(admission.data.patient) : Promise.reject(new Error('no patient'))),
    [admission.data?.patient]
  );
  const requests = useApi(() => requestsApi.list({ admission: admissionId }), [admissionId]);
  const consents = useApi(() => consentsApi.list(), [admissionId]);
  const documents = useApi(
    () => (admission.data ? documentsApi.list(admission.data.patient) : Promise.reject(new Error('no patient'))),
    [admission.data?.patient]
  );

  if (admission.loading) return <LoadingBlock rows={6} />;
  if (admission.error || !admission.data) return <ErrorState status={admission.error?.status} onRetry={admission.refetch} />;
  const a = admission.data;

  const relevantConsents = (consents.data?.results ?? []).filter((c) => c.admission === admissionId);
  const isManagementOrAdmin = user?.role === 'HOSPITAL_MANAGEMENT' || user?.role === 'HOSPITAL_ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to admissions
        </Link>
        {isManagementOrAdmin && a.status === 'ACTIVE' && (
          <Link href={`/management/referrals/new?admission=${a.id}&patient=${a.patient}`}>
            <Button size="sm" variant="secondary"><ArrowLeftRight className="h-3.5 w-3.5" /> Refer to another hospital</Button>
          </Link>
        )}
      </div>

      <AdmissionOverviewCard admission={a} />

      {patient.data && (
        <>
          <PatientSummaryCard patient={patient.data} />
          <PatientHistoryTimeline patient={patient.data} />
        </>
      )}

      <NewServiceRequestForm patientId={a.patient} admissionId={a.id} onCreated={requests.refetch} />
      {requests.loading ? (
        <LoadingBlock rows={2} />
      ) : (
        <div className="rounded-2xl border border-border bg-surface">
          <ServiceRequestList
            requests={requests.data?.results ?? []}
            interactive
            viewerDepartmentName={user?.staff_profile?.department ?? null}
            viewerIsManagementOrAdmin={isManagementOrAdmin}
            onChanged={requests.refetch}
            emptyMessage="Requests for this admission will appear here."
          />
        </div>
      )}

      <StaffConsentPanel patientId={a.patient} admissionId={a.id} consents={relevantConsents} onChanged={consents.refetch} />

      {documents.data && (
        <DocumentsPanel
          patientId={a.patient}
          documents={documents.data.results}
          onChanged={documents.refetch}
          canUpload
          canVerify
        />
      )}

      <NotesPanel admissionId={a.id} kind="doctor" notes={a.doctor_notes} onAdded={admission.refetch} />
      <NotesPanel admissionId={a.id} kind="nursing" notes={a.nursing_notes} onAdded={admission.refetch} />
    </div>
  );
}
