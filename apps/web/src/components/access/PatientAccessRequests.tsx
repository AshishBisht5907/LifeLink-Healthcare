'use client';

import { useState } from 'react';
import { Building2, CheckCircle2, Clock3, ShieldAlert, ShieldCheck, ShieldQuestion, UserRound } from 'lucide-react';
import { accessApi } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { accessErrorMessage } from '@/lib/accessErrors';
import { groupPatientGrants, kindOfGrant } from '@/lib/accessState';
import { formatDateTime, friendlyError } from '@/lib/format';
import { Button, Card } from '@/components/ui/Primitives';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { AccessStatusBadge } from './AccessStatusBadge';
import type { PatientAccessGrant } from '@/lib/types';

type Action = 'approve' | 'decline' | 'revoke';

const COPY: Record<Action, { title: string; body: (g: PatientAccessGrant) => string; button: string; variant: 'primary' | 'danger' | 'secondary'; done: string }> = {
  approve: {
    title: 'Approve access?',
    body: (g) => `${g.hospital_name} will be able to open your record for a limited time. The end time is shown once you approve, and you can end it early at any time.`,
    button: 'Approve access', variant: 'primary', done: 'Access approved',
  },
  decline: {
    title: 'Decline this request?',
    body: (g) => `${g.hospital_name} will be told access was declined and will not be able to open your record through this request.`,
    button: 'Decline request', variant: 'danger', done: 'Request declined',
  },
  revoke: {
    title: 'End access now?',
    body: (g) => `${g.hospital_name} will lose access to your record immediately. They would need to ask you again.`,
    button: 'End access', variant: 'danger', done: 'Access ended',
  },
};

function Who({ g }: { g: PatientAccessGrant }) {
  return (
    <div className="space-y-1 text-xs text-muted">
      <p className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /><span className="font-medium text-foreground">{g.hospital_name}</span></p>
      <p className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />Requested by {g.requested_by_name || 'hospital management'}</p>
      <p className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{formatDateTime(g.created_at)}</p>
    </div>
  );
}

function Group({ title, hint, count, children }: { title: string; hint?: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">{title}<span className="rounded-full bg-neutral-tint px-2 py-0.5 text-[11px] font-medium text-muted">{count}</span></h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function PatientAccessRequests() {
  const toast = useToast();
  const grants = useApi(() => accessApi.list());
  const [pendingAction, setPendingAction] = useState<{ action: Action; grant: PatientAccessGrant } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (grants.loading) return <LoadingBlock rows={4} />;
  if (grants.error) return <Card><ErrorState status={grants.error.status} description={friendlyError(grants.error.status)} onRetry={grants.refetch} /></Card>;

  const { pending, active, history } = groupPatientGrants(grants.data ?? []);

  async function confirm() {
    if (!pendingAction) return;
    const { action, grant } = pendingAction;
    setBusy(true); setError('');
    try {
      await accessApi[action](grant.id);
      toast.show('success', COPY[action].done, `${grant.hospital_name}`);
      setPendingAction(null);
      grants.refetch(); // the screen always shows what the server now says, never a local guess
    } catch (err) {
      setError(accessErrorMessage(err));
      grants.refetch(); // the request may have changed since the page loaded
    } finally { setBusy(false); }
  }

  const open = (action: Action, grant: PatientAccessGrant) => { setError(''); setPendingAction({ action, grant }); };
  const current = pendingAction && COPY[pendingAction.action];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Access requests</h1>
        <p className="mt-0.5 text-sm text-muted">Hospitals must ask before opening your record. You decide, and you can end access at any time.</p>
      </div>

      {(grants.data ?? []).length === 0 ? (
        <Card><EmptyState icon={<ShieldQuestion className="h-5 w-5" />} title="No access requests" description="When a hospital asks to view your record, the request will appear here for you to approve or decline." /></Card>
      ) : (
        <>
          <Group title="Waiting for your answer" count={pending.length} hint="Nothing is shared until you approve.">
            {pending.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">No requests are waiting for you.</p>
              : pending.map((g) => (
                <Card key={g.id} className="border-info/30 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2"><AccessStatusBadge kind="PENDING" /></div>
                      <Who g={g} />
                      <div className="rounded-lg bg-neutral-tint px-3 py-2"><p className="text-[11px] font-medium uppercase tracking-wide text-muted">Reason given</p><p className="mt-0.5 break-words text-sm">{g.reason}</p></div>
                    </div>
                    <div className="flex shrink-0 gap-2 lg:flex-col">
                      <Button variant="primary" className="flex-1" onClick={() => open('approve', g)}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button>
                      <Button variant="secondary" className="flex-1 border-danger/40 text-danger hover:bg-danger-tint" onClick={() => open('decline', g)}>Decline</Button>
                    </div>
                  </div>
                </Card>
              ))}
          </Group>

          <Group title="Access currently open" count={active.length} hint="These hospitals can open your record right now.">
            {active.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">No hospital has open access.</p>
              : active.map((g) => {
                const emergency = g.grant_type === 'EMERGENCY';
                return (
                  <Card key={g.id} className={`p-5 ${emergency ? 'border-danger/30' : 'border-success/30'}`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-3">
                        <AccessStatusBadge kind={kindOfGrant(g)} />
                        <Who g={g} />
                        <p className="text-sm font-medium">Ends {formatDateTime(g.expires_at)}</p>
                        <div className="rounded-lg bg-neutral-tint px-3 py-2"><p className="text-[11px] font-medium uppercase tracking-wide text-muted">Reason given</p><p className="mt-0.5 break-words text-sm">{g.reason}</p></div>
                        {emergency && <p className="flex items-start gap-1.5 text-xs text-muted"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />The hospital used emergency access without asking first. It is time-limited and recorded in the audit log.</p>}
                      </div>
                      {!emergency && (
                        <Button variant="secondary" className="shrink-0 border-danger/40 text-danger hover:bg-danger-tint" onClick={() => open('revoke', g)}><ShieldCheck className="h-3.5 w-3.5" /> End access</Button>
                      )}
                    </div>
                  </Card>
                );
              })}
          </Group>

          {history.length > 0 && (
            <Group title="Earlier requests" count={history.length}>
              <Card>
                <ul className="divide-y divide-border">
                  {history.map((g) => (
                    <li key={g.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{g.hospital_name}</p><p className="truncate text-xs text-muted" title={g.reason}>{g.reason}</p><p className="text-[11px] text-muted">{formatDateTime(g.created_at)}</p></div>
                      <AccessStatusBadge kind={kindOfGrant(g)} />
                    </li>
                  ))}
                </ul>
              </Card>
            </Group>
          )}
        </>
      )}

      <Dialog open={!!pendingAction} onClose={() => setPendingAction(null)} busy={busy} title={current?.title ?? ''}>
        {pendingAction && current && (
          <div className="space-y-4">
            <p className="text-sm text-foreground/80">{current.body(pendingAction.grant)}</p>
            {error && <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPendingAction(null)} disabled={busy}>Cancel</Button>
              <Button variant={current.variant === 'secondary' ? 'primary' : current.variant} loading={busy} onClick={confirm}>{current.button}</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
