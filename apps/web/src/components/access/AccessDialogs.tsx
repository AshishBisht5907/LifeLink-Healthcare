'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button, Field, Textarea } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { accessApi } from '@/lib/api';
import { accessErrorMessage } from '@/lib/accessErrors';
import { formatDateTime } from '@/lib/format';
import type { PatientAccessGrant } from '@/lib/types';

// Mirrors the backend minimums for a friendlier form. The backend still
// validates everything and is the only authority.
const MIN_REQUEST = 5;
const MIN_EMERGENCY = 15;

interface Props {
  open: boolean;
  patientId: string;
  patientLabel: string;
  onClose: () => void;
  onDone: () => void;
  openHref?: string;
}

export function RequestAccessDialog({ open, patientId, patientLabel, onClose, onDone }: Props) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PatientAccessGrant | null>(null);

  function close() { const done = !!result; setReason(''); setError(''); setResult(null); onClose(); if (done) onDone(); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const g = await accessApi.request(patientId, reason.trim());
      setResult(g);
      toast.show('success', 'Access request sent', 'The patient has been notified.');
    } catch (err) { setError(accessErrorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={close} busy={busy} title={result ? 'Request sent' : 'Request patient access'}>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-info-tint p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-info" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">Status: Pending</p>
              <p className="mt-1 text-foreground/80">{patientLabel} has been notified and must approve before you can open the record. Nothing is unlocked yet.</p>
            </div>
          </div>
          <Button variant="primary" className="w-full" onClick={close}>Done</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted">The patient ({patientLabel}) will see who is asking and why. If they approve, you get time-limited access.</p>
          <Field label="Reason for access" required hint={`At least ${MIN_REQUEST} characters. Shown to the patient.`} error={error}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="e.g. Planned admission for cardiology review" autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={reason.trim().length < MIN_REQUEST}>Send request</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function EmergencyAccessDialog({ open, patientId, patientLabel, onClose, onDone, openHref }: Props) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PatientAccessGrant | null>(null);

  function close() { const done = !!result; setReason(''); setAck(false); setError(''); setResult(null); onClose(); if (done) onDone(); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const g = await accessApi.emergency(patientId, reason.trim());
      setResult(g);
      toast.show('success', 'Emergency access granted', 'This action has been recorded in the audit log.');
    } catch (err) { setError(accessErrorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={close} busy={busy} tone="emergency" title={result ? 'Emergency access granted' : 'Emergency access'}>
      {result ? (
        <div className="space-y-4">
          <dl className="space-y-3 rounded-xl border border-danger/20 bg-danger-tint p-4 text-sm">
            <div><dt className="text-xs font-medium text-muted">Status</dt><dd className="font-semibold text-danger">Emergency access · {result.status.toLowerCase()}</dd></div>
            <div><dt className="text-xs font-medium text-muted">Expires</dt><dd className="font-semibold">{formatDateTime(result.expires_at)}</dd></div>
            <div><dt className="text-xs font-medium text-muted">Reason recorded</dt><dd>{result.reason}</dd></div>
          </dl>
          <p className="flex items-start gap-2 text-xs text-muted"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />This access is audited with your name, hospital, time and reason, and the patient is notified. It ends automatically at the time above.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Close</Button>
            {openHref && <Link href={openHref} onClick={close} className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Open patient record</Link>}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border border-danger/25 bg-danger-tint p-3.5 text-sm text-foreground/85">
            <p className="font-semibold text-danger">For genuine emergencies only</p>
            <p className="mt-1">This opens {patientLabel}&rsquo;s record <strong>without their approval</strong>. It is time-limited, recorded in the audit log with your name and reason, and the patient is told afterwards.</p>
          </div>
          <Field label="Emergency reason" required hint={`At least ${MIN_EMERGENCY} characters. Be specific.`} error={error}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="e.g. Unconscious on arrival, need allergy and blood group" autoFocus />
          </Field>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--danger)]" />
            <span>I confirm this is an emergency and understand this action is audited.</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="danger" loading={busy} disabled={!ack || reason.trim().length < MIN_EMERGENCY}>Grant emergency access</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
