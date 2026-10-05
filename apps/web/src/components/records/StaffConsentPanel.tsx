'use client';

import { useState } from 'react';
import type { ConsentRequest, ServiceRequest } from '@/lib/types';
import { consentsApi, ApiError } from '@/lib/api';
import { Card, CardHeader, Button, Textarea, Field, Select } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/States';
import { FileCheck2 } from 'lucide-react';
import { requestLabel } from '@/lib/format';

export function StaffConsentPanel({
  patientId, admissionId, consents, requests, onChanged,
}: {
  patientId: string;
  admissionId: string;
  consents: ConsentRequest[];
  requests: ServiceRequest[];
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState('');
  const [risk, setRisk] = useState('');
  const [serviceRequestId, setServiceRequestId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestsAwaitingConsent = requests.filter((request) =>
    request.requires_consent && request.status === 'APPROVAL_REQUIRED' && !request.linked_consent
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await consentsApi.create({
        patient: patientId, admission: admissionId, procedure_description: description,
        risk_information: risk, service_request: serviceRequestId || undefined,
      });
      setDescription('');
      setRisk('');
      setServiceRequestId('');
      setShowForm(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the consent request.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Consent"
        subtitle="Only the patient or an authorised family member can approve/decline — staff can only request"
        action={<Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'New consent request'}</Button>}
      />
      {showForm && (
        <form onSubmit={submit} className="space-y-3 border-b border-border p-5">
          <Field label="Procedure description">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} required />
          </Field>
          {requestsAwaitingConsent.length > 0 && (
            <Field label="Service request awaiting consent">
              <Select value={serviceRequestId} onChange={(e) => setServiceRequestId(e.target.value)} required>
                <option value="" disabled>Select a request</option>
                {requestsAwaitingConsent.map((request) => (
                  <option key={request.id} value={request.id}>{requestLabel(request.request_type)}{request.reason ? ` · ${request.reason}` : ''}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Risk information (shown to the patient/family)">
            <Textarea rows={2} value={risk} onChange={(e) => setRisk(e.target.value)} />
          </Field>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" variant="primary" loading={saving}>Send consent request</Button>
        </form>
      )}
      {consents.length === 0 ? (
        <EmptyState icon={<FileCheck2 className="h-5 w-5" />} title="No consent requests yet" />
      ) : (
        <ul className="divide-y divide-border">
          {consents.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{c.procedure_description}</p>
                <p className="text-xs text-muted">{new Date(c.created_at).toLocaleString()}</p>
              </div>
              <StatusBadge kind="consent" value={c.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
