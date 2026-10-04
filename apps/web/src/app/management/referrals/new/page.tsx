'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { admissionsApi, hospitalsApi, referralsApi, patientsApi, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, Button, Select, Textarea, Field, Input } from '@/components/ui/Primitives';
import { LoadingBlock, ErrorState } from '@/components/ui/States';

export default function NewReferralPage() {
  return (
    <Suspense>
      <NewReferralForm />
    </Suspense>
  );
}

function NewReferralForm() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedAdmission = searchParams.get('admission') ?? '';
  const preselectedPatient = searchParams.get('patient') ?? '';

  const admissions = useApi(() => admissionsApi.list());
  const hospitals = useApi(() => hospitalsApi.list());

  const [admissionId, setAdmissionId] = useState(preselectedAdmission);
  const [toHospital, setToHospital] = useState('');
  const [requiredDept, setRequiredDept] = useState('');
  const [priority, setPriority] = useState('HIGH');
  const [reason, setReason] = useState('');
  const [conditionSummary, setConditionSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (admissions.loading || hospitals.loading) return <LoadingBlock rows={5} />;
  if (admissions.error) return <ErrorState status={admissions.error.status} onRetry={admissions.refetch} />;

  const activeAdmissions = (admissions.data?.results ?? []).filter((a) => a.status === 'ACTIVE');
  const otherHospitals = (hospitals.data?.results ?? []).filter((h) => h.id !== user?.staff_profile?.hospital_id);
  const selectedAdmission = activeAdmissions.find((a) => a.id === admissionId);
  const patientId = selectedAdmission?.patient ?? preselectedPatient;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId || !admissionId || !toHospital || !requiredDept || !reason) {
      setError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const referral = await referralsApi.create({
        patient: patientId, from_admission: admissionId, to_hospital: toHospital,
        required_department_type: requiredDept, priority, reason, current_condition_summary: conditionSummary,
      });
      router.push(`/management/referrals/${referral.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the referral.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/management/referrals" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to referrals
      </Link>
      <Card>
        <CardHeader title="Refer Patient to Another Hospital" subtitle="An AI-generated, source-linked summary is attached automatically" />
        <form onSubmit={submit} className="space-y-4 p-5">
          <Field label="Patient / Admission">
            <Select value={admissionId} onChange={(e) => setAdmissionId(e.target.value)} required>
              <option value="">Select an active admission...</option>
              {activeAdmissions.map((a) => (
                <option key={a.id} value={a.id}>{a.patient_name} — {a.admission_number}</option>
              ))}
            </Select>
          </Field>
          <Field label="Receiving hospital">
            <Select value={toHospital} onChange={(e) => setToHospital(e.target.value)} required>
              <option value="">Select a hospital...</option>
              {otherHospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
          <Field label="Required department / specialty" hint="e.g. ICU_CARDIOLOGY, NEUROSURGERY">
            <Input value={requiredDept} onChange={(e) => setRequiredDept(e.target.value)} required placeholder="ICU_CARDIOLOGY" />
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="EMERGENCY">Emergency</option>
            </Select>
          </Field>
          <Field label="Reason for referral">
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>
          <Field label="Current condition summary">
            <Textarea rows={2} value={conditionSummary} onChange={(e) => setConditionSummary(e.target.value)} />
          </Field>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" variant="primary" loading={saving}>Send referral</Button>
        </form>
      </Card>
    </div>
  );
}
