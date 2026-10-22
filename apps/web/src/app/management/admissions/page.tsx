'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { admissionsApi, patientsApi, ApiError } from '@/lib/api';
import { AdmissionsBoard } from '@/components/records/AdmissionsBoard';
import { Card, CardHeader, Button, Field, Select, Textarea } from '@/components/ui/Primitives';
import { ErrorState, LoadingBlock } from '@/components/ui/States';

export default function ManagementAdmissionsPage() {
  const router = useRouter();
  const admissions = useApi(() => admissionsApi.list());
  const candidates = useApi(() => patientsApi.admissionCandidates());
  const [patientId, setPatientId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function createAdmission(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) {
      setFormError('Select a patient first.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const admission = await admissionsApi.create({ patient: patientId, reason });
      // The backend creates the admission only here; registration alone never admits.
      await Promise.all([admissions.refetch(), candidates.refetch()]);
      router.push(`/management/admissions/${admission.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create admission.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">Admissions</h1><p className="mt-0.5 text-sm text-muted">Patients admitted to your hospital.</p></div>

      <Card>
        <CardHeader title="Start an admission" subtitle="Choose a patient registered at your hospital, or one whose access request you have received patient approval for. Registration alone does not admit the patient." />
        {candidates.loading ? <LoadingBlock rows={2} /> : candidates.error ? (
          <div className="p-5"><ErrorState status={candidates.error.status} description={candidates.error.message} onRetry={candidates.refetch} /></div>
        ) : (
          <form onSubmit={createAdmission} className="space-y-3 p-5">
            <Field label="Patient" required>
              <Select value={patientId} onChange={(e) => setPatientId(e.target.value)} required>
                <option value="">Select a registered patient…</option>
                {(candidates.data ?? []).map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.lifelink_patient_id} — {patient.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            {(candidates.data ?? []).length === 0 && (
              <p className="text-xs text-muted">No patients are currently eligible. Register a patient, or find them by LifeLink Patient ID in Patients and request their approval before admitting. Patients with an active admission here are excluded.</p>
            )}
            <Field label="Reason for admission" required>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="Enter the reason for this admission" />
            </Field>
            {formError && <p role="alert" className="text-xs text-danger">{formError}</p>}
            <Button type="submit" variant="primary" loading={saving} disabled={!patientId || !reason.trim() || saving}>
              Create admission
            </Button>
            <p className="text-xs text-muted">Need to register someone? Go to <Link href="/management/patients/new" className="font-medium text-brand-dark hover:underline">Register new patient</Link>.</p>
          </form>
        )}
      </Card>

      <AdmissionsBoard admissions={admissions.data?.results ?? []} hasMore={!!admissions.data?.next} loading={admissions.loading} error={admissions.error} refetch={admissions.refetch}
        detailBase="/management/admissions" emptyHint="Create an admission above; active and past stays will appear here." />
    </div>
  );
}
