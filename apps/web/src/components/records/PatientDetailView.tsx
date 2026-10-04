'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, PlusCircle, Send } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { patientsApi, admissionsApi, accessApi, documentsApi, ApiError, requestsApi, referralsApi } from '@/lib/api';
import { Card, CardHeader, Button, Textarea, Field } from '@/components/ui/Primitives';
import { PatientSummaryCard, PatientHistoryTimeline } from '@/components/records/PatientSummaryCard';
import { AdmissionsListTable } from '@/components/records/AdmissionsListTable';
import { LoadingBlock, ErrorState } from '@/components/ui/States';
import { PatientCareJourney } from '@/components/health/PatientCareJourney';
import { useToast } from '@/components/ui/Toast';
import { AccessBanner, AccessGate } from '@/components/access/AccessGate';
import { activeGrant } from '@/lib/accessState';
import { DocumentsPanel } from '@/components/records/DocumentsPanel';
import { friendlyError } from '@/lib/format';

export function PatientDetailView({ patientId, searchBasePath, admissionBasePath, accessGate = false }: {
  patientId: string;
  searchBasePath: string;
  admissionBasePath: string;
  /** Management only: on a 403, offer request/emergency access instead of a dead end. */
  accessGate?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const patient = useApi(() => patientsApi.get(patientId), [patientId]);
  const admissions = useApi(() => admissionsApi.list());
  const requests = useApi(() => requestsApi.list({ patient: patientId }), [patientId]);
  const referrals = useApi(() => referralsApi.list(), [patientId]);
  const grants = useApi(() => accessApi.list(), [patientId], accessGate);
  // Documents are only requested once the patient record itself was allowed; the backend re-checks access either way.
  const documents = useApi(() => documentsApi.list(patientId), [patientId], !!patient.data);
  const [showNewAdmission, setShowNewAdmission] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [grantingAccess, setGrantingAccess] = useState(false);

  if (patient.loading) return <LoadingBlock rows={6} />;
  if (accessGate && patient.error?.status === 403) {
    if (grants.loading) return <LoadingBlock rows={4} />;
    return <AccessGate patientId={patientId} grants={grants.data ?? []} backHref={searchBasePath} onChanged={() => { grants.refetch(); patient.refetch(); }} />;
  }
  if (patient.error || !patient.data) return <ErrorState status={patient.error?.status} onRetry={patient.refetch} />;
  const p = patient.data;

  const myAdmissions = (admissions.data?.results ?? []).filter((a) => a.patient === patientId);
  const hasActiveAdmission = myAdmissions.some((a) => a.status === 'ACTIVE');

  async function createAdmission(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const admission = await admissionsApi.create({ patient: patientId, reason });
      router.push(`${admissionBasePath}/${admission.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the admission.');
    } finally {
      setSaving(false);
    }
  }

  async function grantPatientAccess() {
    if (!p.phone) {
      toast.show('error', 'No phone number', 'Patient phone number is required to send access SMS.');
      return;
    }

    setGrantingAccess(true);
    try {
      const result = await patientsApi.grantAccess(patientId);
      toast.show(
        'success',
        result.dev_otp ? 'Demo registration code created' : 'Invitation sent',
        result.dev_otp
          ? `Share code ${result.dev_otp} with the patient to register using ${p.phone}.`
          : result.detail
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create a registration code.';
      toast.show('error', 'Error', msg);
    } finally {
      setGrantingAccess(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href={searchBasePath} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to search
      </Link>

      {accessGate && (() => { const live = activeGrant(grants.data ?? [], patientId); return live ? <AccessBanner grant={live} /> : null; })()}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{p.full_name}</h1>
          <p className="mt-0.5 text-sm text-muted">{p.lifelink_patient_id} {p.is_unclaimed && '· Unclaimed profile'}</p>
        </div>
        {p.is_unclaimed && (
          <Button
            variant="primary"
            size="sm"
            loading={grantingAccess}
            onClick={grantPatientAccess}
          >
            <Send className="h-3.5 w-3.5" /> Grant access
          </Button>
        )}
      </div>

      <PatientSummaryCard patient={p} />

      {/* Family Access Manager - for patients to manage family access */}

      <PatientCareJourney
        admissions={myAdmissions}
        requests={requests.data?.results ?? []}
        referrals={(referrals.data?.results ?? []).filter((item) => item.patient === patientId)}
        variant="staff"
        loading={requests.loading || admissions.loading || referrals.loading}
        error={requests.error ?? admissions.error ?? referrals.error}
        onRetry={() => { requests.refetch(); admissions.refetch(); referrals.refetch(); }}
      />
      <PatientHistoryTimeline patient={p} />

      {documents.error ? (
        <Card><ErrorState status={documents.error.status} description={friendlyError(documents.error.status)} onRetry={documents.refetch} /></Card>
      ) : documents.loading ? <LoadingBlock rows={2} /> : (
        <DocumentsPanel patientId={patientId} documents={documents.data?.results ?? []} onChanged={documents.refetch} canUpload canVerify />
      )}

      <Card>
        <CardHeader
          title="Admissions"
          action={!hasActiveAdmission ? (
            <Button size="sm" variant="secondary" onClick={() => setShowNewAdmission((v) => !v)}>
              <PlusCircle className="h-3.5 w-3.5" /> {showNewAdmission ? 'Cancel' : 'Start new admission'}
            </Button>
          ) : undefined}
        />
        {showNewAdmission && (
          <form onSubmit={createAdmission} className="space-y-3 border-b border-border p-5">
            <Field label="Reason for admission">
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required />
            </Field>
            {error && <p className="text-xs text-danger">{error}</p>}
            <Button type="submit" variant="primary" loading={saving}>Create admission</Button>
          </form>
        )}
        {admissions.loading ? <LoadingBlock rows={2} /> : (
          <AdmissionsListTable admissions={myAdmissions} detailBase={admissionBasePath} />
        )}
      </Card>
    </div>
  );
}
