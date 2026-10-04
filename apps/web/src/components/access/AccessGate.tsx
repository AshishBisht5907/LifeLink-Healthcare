'use client';

import Link from 'next/link';
import { ArrowLeft, LockKeyhole, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Primitives';
import { describeAccess } from '@/lib/accessState';
import { formatDateTime } from '@/lib/format';
import type { PatientAccessGrant } from '@/lib/types';
import { AccessActions } from './AccessActions';
import { AccessStatusBadge } from './AccessStatusBadge';

/**
 * Shown when the backend refuses the record (403). It never tries to work
 * around the refusal: it explains the state and offers the two real ways in.
 * No patient data is shown, because the server sent none.
 */
export function AccessGate({ patientId, grants, backHref, onChanged }: {
  patientId: string; grants: PatientAccessGrant[]; backHref: string; onChanged: () => void;
}) {
  const state = describeAccess(patientId, null, grants);
  const g = state.grant;
  return (
    <div className="space-y-4">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back to search</Link>
      <Card className="mx-auto max-w-xl p-6 text-center sm:p-8">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-tint text-muted"><LockKeyhole className="h-5 w-5" /></div>
        <h1 className="text-lg font-semibold">Access to this record is required</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
          {g?.lifelink_patient_id ? <><span className="font-mono">{g.lifelink_patient_id}</span> is not linked to your hospital. </> : 'This patient is not linked to your hospital. '}
          Request the patient&rsquo;s approval, or use emergency access if this is a genuine emergency.
        </p>
        <div className="mt-4 flex justify-center"><AccessStatusBadge kind={state.kind} /></div>
        {g && <p className="mx-auto mt-2 max-w-sm truncate text-xs text-muted" title={g.reason}>Last request: {g.reason} · {formatDateTime(g.created_at)}</p>}
        <div className="mt-5 flex justify-center">
          <AccessActions patientId={patientId} patientLabel={g?.lifelink_patient_id ?? 'this patient'} state={state}
            openHref={`${backHref}/${patientId}`} onChanged={onChanged} />
        </div>
      </Card>
    </div>
  );
}

/** Shown above an opened record while a time-limited grant is what allows it. */
export function AccessBanner({ grant }: { grant: PatientAccessGrant }) {
  const emergency = grant.grant_type === 'EMERGENCY';
  const Icon = emergency ? ShieldAlert : ShieldCheck;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${emergency ? 'border-danger/30 bg-danger-tint' : 'border-success/25 bg-success-tint'}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${emergency ? 'text-danger' : 'text-success'}`} />
      <div className="min-w-0">
        <p className="font-semibold">{emergency ? 'Emergency access active' : 'Patient-approved access active'} <span className="font-normal text-foreground/70">· ends {formatDateTime(grant.expires_at)}</span></p>
        <p className="truncate text-xs text-foreground/70" title={grant.reason}>Reason: {grant.reason}</p>
        {emergency && <p className="mt-0.5 text-xs text-foreground/70">Everything you do with this record is audited.</p>}
      </div>
    </div>
  );
}
