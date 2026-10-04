'use client';

import { Card, CardHeader } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { CHECKLIST_ITEM_OWNERS } from '@/lib/types';
import type { TransferPacket } from '@/lib/types';

const CHECKLIST_LABELS: Record<string, string> = {
  patient_identity_confirmed: 'Patient identity confirmed',
  referral_note_attached: 'Referral note attached',
  reports_attached: 'Reports attached',
  medicines_confirmed: 'Current medicines confirmed',
  allergies_confirmed: 'Allergies confirmed',
  discharge_documentation_attached: 'Discharge documentation attached',
  consent_attached: 'Consent attached',
  insurance_confirmed: 'Insurance confirmed',
  ambulance_arranged: 'Ambulance arranged',
  bed_ready: 'Bed ready',
  receiving_doctor_confirmed: 'Receiving doctor confirmed',
};

function valueOrUnavailable(value: string | null | undefined) {
  return value || 'Not available';
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

export function TransferPacket({ packet, loading, error, onRetry }: {
  packet?: TransferPacket | null;
  loading: boolean;
  error?: { status?: number } | null;
  onRetry: () => void;
}) {
  if (loading) return <LoadingBlock rows={8} />;
  if (error || !packet) return <ErrorState status={error?.status} onRetry={onRetry} />;

  return (
    <Card>
      <CardHeader title="Transfer Packet" subtitle="Read-only summary assembled from the authorized referral and transfer records" />
      <div className="space-y-5 p-5">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Transfer</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Referral ID" value={packet.referral.id.slice(0, 8)} />
            <div><p className="text-xs text-muted">Status</p><div className="mt-1"><StatusBadge kind="referral" value={packet.referral.status} /></div></div>
            <Info label="From → To" value={`${packet.referral.from_hospital} → ${packet.referral.to_hospital}`} />
            <Info label="Created" value={formatDate(packet.referral.created_at)} />
            <Info label="Responded" value={formatDate(packet.referral.responded_at)} />
            <Info label="Transfer completed" value={formatDate(packet.transfer.completed_at)} />
            <Info label="Ambulance" value={packet.transfer.ambulance_arranged === null ? 'Not available' : packet.transfer.ambulance_arranged ? 'Arranged' : 'Not arranged'} />
            <Info label="Required department" value={valueOrUnavailable(packet.referral.required_department_type)} />
          </div>
        </section>

        <section className="border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Patient</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Patient ID" value={packet.patient.lifelink_patient_id} />
            <Info label="Name" value={packet.patient.full_name} />
            <Info label="Date of birth" value={packet.patient.access_limited ? 'Not available' : valueOrUnavailable(packet.patient.date_of_birth)} />
            <Info label="Blood group" value={packet.patient.access_limited ? 'Not available' : valueOrUnavailable(packet.patient.blood_group)} />
          </div>
          {packet.patient.access_limited && <p className="mt-2 text-xs text-muted">Additional patient details are limited by the current hospital access scope.</p>}
        </section>

        <section className="border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Current admission</p>
          <AdmissionSummary admission={packet.source_admission} label="Source admission" />
          {packet.target_admission && <AdmissionSummary admission={packet.target_admission} label="Target admission" />}
        </section>

        <section className="border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Clinical context</p>
          <div className="mt-3 space-y-3 text-sm text-foreground">
            <Info label="Referral reason" value={valueOrUnavailable(packet.referral.reason)} />
            <Info label="Current condition" value={valueOrUnavailable(packet.referral.current_condition_summary)} />
            <div>
              <p className="text-xs text-muted">AI-generated summary</p>
              <p className="mt-1 whitespace-pre-wrap">{packet.clinical_context.ai_summary?.content_text ?? 'AI summary unavailable'}</p>
              {packet.clinical_context.ai_summary && <p className="mt-1 text-xs text-muted">AI-generated and source-linked; not a diagnosis, prescription, or transfer approval.</p>}
            </div>
          </div>
        </section>

        {(packet.allergies.length > 0 || packet.medications.length > 0 || packet.documents.length > 0 || packet.requests.length > 0) && (
          <section className="border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Important medical context</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <ListBlock title="Allergies" items={packet.allergies.map((item) => `${item.substance} · ${item.severity}`)} />
              <ListBlock title="Medications" items={packet.medications.map((item) => `${item.name} · ${item.dosage} · ${item.frequency}`)} />
              <ListBlock title="Relevant requests" items={packet.requests.map((item) => `${item.request_type.replaceAll('_', ' ')} · ${item.status} · ${item.department ?? 'Unassigned'}`)} />
              <ListBlock title="Documents" items={packet.documents.map((item) => `${item.doc_type.replaceAll('_', ' ')} · ${item.verification_status} · ${item.access}`)} />
            </div>
          </section>
        )}

        <section className="border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Transfer checklist</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(CHECKLIST_ITEM_OWNERS).map(([key, owner]) => {
              const item = packet.transfer.checklist[key];
              return <div key={key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className={item?.done ? 'text-foreground' : 'text-muted'}>{CHECKLIST_LABELS[key]}</span>
                <span className="text-xs text-muted">{item?.done ? 'Complete' : 'Not complete'} · {owner === 'EITHER' ? 'Either' : owner === 'FROM' ? 'Sending hospital' : 'Receiving hospital'}</span>
              </div>;
            })}
          </div>
        </section>
      </div>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm text-foreground">{value}</p></div>;
}

function AdmissionSummary({ admission, label }: { admission: TransferPacket['source_admission']; label: string }) {
  if (!admission) return <p className="mt-3 text-sm text-muted">{label}: Not available</p>;
  return <div className="mt-3 rounded-lg border border-border bg-neutral-tint p-3">
    <p className="text-sm font-medium text-foreground">{label}: {admission.admission_number}</p>
    <p className="mt-1 text-xs text-muted">{admission.hospital_name} · {admission.status} · Admitted {formatDate(admission.admitted_at)}</p>
    <p className="mt-1 text-xs text-muted">{admission.reason || 'Encounter reason not provided'}</p>
  </div>;
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return <div><p className="text-xs font-medium text-muted">{title}</p>{items.length === 0 ? <p className="mt-1 text-sm text-muted">Not available</p> : <ul className="mt-1 space-y-1 text-sm text-foreground">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}</div>;
}