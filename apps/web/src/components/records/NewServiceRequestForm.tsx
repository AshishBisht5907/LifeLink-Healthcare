'use client';

import { useState } from 'react';
import { requestsApi, ApiError } from '@/lib/api';
import { Card, CardHeader, Button, Select, Textarea, Field } from '@/components/ui/Primitives';
import type { RequestTypeCode, Priority } from '@/lib/types';

const REQUEST_TYPES: { value: RequestTypeCode; label: string }[] = [
  { value: 'CT_SCAN', label: 'CT Scan' },
  { value: 'MRI', label: 'MRI' },
  { value: 'XRAY', label: 'X-Ray' },
  { value: 'BLOOD_TEST', label: 'Blood Test' },
  { value: 'PATHOLOGY', label: 'Pathology' },
  { value: 'MEDICATION', label: 'Medication Order' },
  { value: 'SURGERY', label: 'Surgery / Procedure (requires consent)' },
  { value: 'INSURANCE_APPROVAL', label: 'Insurance Approval' },
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'CONSULTATION', label: 'Specialist Consultation' },
  { value: 'DOCUMENT_VERIFICATION', label: 'Document Verification' },
  { value: 'GENERIC_TASK', label: 'Internal Task' },
];
const PATIENT_REQUEST_TYPES = REQUEST_TYPES.filter((type) =>
  type.value !== 'DOCUMENT_VERIFICATION' && type.value !== 'GENERIC_TASK'
);

export function NewServiceRequestForm({
  patientId, admissionId, onCreated, patientMode = false,
}: {
  patientId: string;
  admissionId: string;
  onCreated: () => void;
  patientMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [requestType, setRequestType] = useState<RequestTypeCode>('CT_SCAN');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await requestsApi.create({ patient: patientId, admission: admissionId, request_type: requestType, reason, priority });
      setReason('');
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the request.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Requests"
        subtitle="Auto-routed to the correct department on creation"
        action={<Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>{open ? 'Cancel' : 'New request'}</Button>}
      />
      {open && (
        <form onSubmit={submit} className="space-y-3 border-b border-border p-5">
          <Field label="Request type">
            <Select value={requestType} onChange={(e) => setRequestType(e.target.value as RequestTypeCode)}>
              {(patientMode ? PATIENT_REQUEST_TYPES : REQUEST_TYPES).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="EMERGENCY">Emergency</option>
            </Select>
          </Field>
          <Field label="Reason">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" variant="primary" loading={saving}>Create request</Button>
        </form>
      )}
    </Card>
  );
}
