'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowLeftRight, Sparkles, CheckCircle2, Circle } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { referralsApi, aiApi, ApiError } from '@/lib/api';
import { TransferPacket } from '@/components/referrals/TransferPacket';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, Button, Textarea } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingBlock, ErrorState } from '@/components/ui/States';
import { CHECKLIST_ITEM_OWNERS } from '@/lib/types';

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

export default function ReferralDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const referral = useApi(() => referralsApi.get(id), [id]);
  const transfer = useApi(() => referralsApi.getTransfer(id), [id, referral.data?.status]);
  const packet = useApi(() => referralsApi.getTransferPacket(id), [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [responseNote, setResponseNote] = useState('');

  if (referral.loading) return <LoadingBlock rows={6} />;
  if (referral.error || !referral.data) return <ErrorState status={referral.error?.status} onRetry={referral.refetch} />;
  const r = referral.data;

  const myHospitalId = user?.staff_profile?.hospital_id;
  const isReceivingHospital = myHospitalId === r.to_hospital;
  const isSendingHospital = myHospitalId === r.from_hospital;
  const isStaffTier = user?.role === 'HOSPITAL_STAFF' || user?.role === 'HOSPITAL_MANAGEMENT' || user?.role === 'HOSPITAL_ADMIN';

  async function respond(decision: 'ACCEPTED' | 'REJECTED' | 'CONDITIONAL') {
    setBusy(true);
    setError('');
    try {
      await referralsApi.respond(id, decision, responseNote || undefined);
      referral.refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not respond to the referral.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleChecklistItem(key: string, current: boolean) {
    setBusy(true);
    setError('');
    try {
      await referralsApi.updateChecklist(id, { [key]: !current });
      transfer.refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the checklist.');
    } finally {
      setBusy(false);
    }
  }

  async function completeTransfer() {
    setBusy(true);
    setError('');
    try {
      await referralsApi.completeTransfer(id);
      transfer.refetch();
      referral.refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete the transfer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/management/referrals" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to referrals
      </Link>

      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4 text-muted" /> {r.patient_name}</span>}
          subtitle={`${r.from_hospital_name} → ${r.to_hospital_name}`}
          action={<StatusBadge kind="referral" value={r.status} />}
        />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div><p className="text-xs font-medium text-muted">Priority</p><p className="text-sm text-foreground">{r.priority}</p></div>
          <div><p className="text-xs font-medium text-muted">Required department</p><p className="text-sm text-foreground">{r.required_department_type}</p></div>
          <div className="sm:col-span-2"><p className="text-xs font-medium text-muted">Reason</p><p className="text-sm text-foreground">{r.reason}</p></div>
          {r.current_condition_summary && (
            <div className="sm:col-span-2"><p className="text-xs font-medium text-muted">Current condition</p><p className="text-sm text-foreground">{r.current_condition_summary}</p></div>
          )}
          {r.response_note && (
            <div className="sm:col-span-2"><p className="text-xs font-medium text-muted">Response note</p><p className="text-sm text-foreground">{r.response_note}</p></div>
          )}
        </div>

        {r.status === 'PENDING' && isStaffTier && isReceivingHospital && (
          <div className="space-y-3 border-t border-border p-5">
            <Textarea placeholder="Optional response note" rows={2} value={responseNote} onChange={(e) => setResponseNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading={busy} onClick={() => respond('ACCEPTED')}>Accept</Button>
              <Button variant="secondary" loading={busy} onClick={() => respond('CONDITIONAL')}>Conditional Accept</Button>
              <Button variant="danger" loading={busy} onClick={() => respond('REJECTED')}>Reject</Button>
            </div>
          </div>
        )}
        {r.status === 'PENDING' && isStaffTier && isSendingHospital && (
          <div className="border-t border-border p-5">
            <p className="text-xs text-muted">Waiting for {r.to_hospital_name} to respond.</p>
          </div>
        )}
        {error && <p className="px-5 pb-4 text-xs text-danger">{error}</p>}
      </Card>

      <TransferPacket packet={packet.data} loading={packet.loading} error={packet.error} onRetry={packet.refetch} />

      {r.ai_summary && <ReferralAISummary insightId={r.ai_summary} />}

      {(r.status === 'ACCEPTED' || r.status === 'CONDITIONAL') && (
        <Card>
          <CardHeader
            title="Transfer Checklist"
            subtitle="Each item can only be marked by its designated hospital side"
            action={r.status !== undefined && !transfer.data?.completed_at && isStaffTier && isReceivingHospital ? (
              <Button size="sm" variant="primary" loading={busy} onClick={completeTransfer}>Complete Transfer</Button>
            ) : undefined}
          />
          {transfer.loading ? (
            <LoadingBlock rows={3} />
          ) : transfer.error ? (
            <ErrorState status={transfer.error.status} onRetry={transfer.refetch} />
          ) : transfer.data ? (
            <>
              {transfer.data.completed_at ? (
                <div className="m-5 rounded-lg bg-success-tint px-4 py-3 text-sm text-success">
                  Transfer completed — new admission created at {r.to_hospital_name}.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {Object.entries(CHECKLIST_ITEM_OWNERS).map(([key, owner]) => {
                    const state = transfer.data!.checklist[key];
                    const done = state?.done ?? false;
                    const myOwnershipHospitalId = owner === 'FROM' ? r.from_hospital : owner === 'TO' ? r.to_hospital : null;
                    const canToggle = isStaffTier && (owner === 'EITHER' ? (isReceivingHospital || isSendingHospital) : myHospitalId === myOwnershipHospitalId);
                    return (
                      <li key={key} className="flex items-center justify-between px-5 py-3">
                        <button
                          disabled={!canToggle || busy}
                          onClick={() => toggleChecklistItem(key, done)}
                          className="flex items-center gap-2.5 text-left disabled:cursor-not-allowed"
                        >
                          {done ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success" /> : <Circle className="h-4 w-4 flex-shrink-0 text-muted" />}
                          <span className={`text-sm ${done ? 'text-foreground' : 'text-muted'}`}>{CHECKLIST_LABELS[key]}</span>
                        </button>
                        <span className="text-[11px] text-muted">{owner === 'FROM' ? r.from_hospital_name : owner === 'TO' ? r.to_hospital_name : 'Either hospital'}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : null}
        </Card>
      )}
    </div>
  );
}

function ReferralAISummary({ insightId }: { insightId: string }) {
  const insight = useApi(() => aiApi.get(insightId), [insightId]);
  if (insight.loading) return <LoadingBlock rows={2} />;
  if (insight.error || !insight.data) return null; // not every viewer is entitled to this — fail silently, not an error banner
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-dark" /> AI Referral Summary</span>} subtitle="Source-linked — carried over instead of the full internal record" />
      <div className="p-5">
        <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{insight.data.content_text}</pre>
        {insight.data.references.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-medium text-muted">Sources</p>
            <ul className="space-y-1">
              {insight.data.references.map((ref) => <li key={ref.id} className="text-xs text-muted">• {ref.source_description}</li>)}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
