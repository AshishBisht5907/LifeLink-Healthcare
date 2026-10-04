'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/lib/useApi';
import { consentsApi } from '@/lib/api';
import { CONSENT_CONFIRM, consentChoices, type ConsentUiAction } from '@/lib/consentView';
import { serverMessage } from '@/lib/errorMessages';
import { formatDateTime, friendlyError } from '@/lib/format';
import { Button, Card, CardHeader } from '@/components/ui/Primitives';
import { Dialog } from '@/components/ui/Dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

export default function ConsentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const toast = useToast();
  const consent = useApi(() => consentsApi.get(id), [id]);
  const [pending, setPending] = useState<ConsentUiAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (consent.loading) return <LoadingBlock rows={5} />;
  if (consent.error || !consent.data) {
    return <Card><ErrorState status={consent.error?.status} description={friendlyError(consent.error?.status)} onRetry={consent.refetch} /></Card>;
  }
  const c = consent.data;
  const choices = consentChoices(c.status, user?.role ?? 'FAMILY');
  const confirm = pending ? CONSENT_CONFIRM[pending] : null;

  async function decide() {
    if (!pending) return;
    setBusy(true); setError('');
    try {
      await consentsApi.decide(id, pending);
      toast.show('success', CONSENT_CONFIRM[pending].done);
      setPending(null);
      consent.refetch(); // show the status the server recorded
    } catch (err) { setError(serverMessage(err)); consent.refetch(); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Link href="/portal/consents" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back to consent</Link>

      <Card>
        <CardHeader title={c.procedure_description} action={<StatusBadge kind="consent" value={c.status} />} />
        <div className="space-y-4 p-5">
          {c.risk_information && (
            <div className="flex items-start gap-2 rounded-lg bg-warning-tint px-3 py-2.5 text-xs text-foreground/85"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />{c.risk_information}</div>
          )}
          <p className="text-xs text-muted">Requested {formatDateTime(c.created_at)}{c.resolved_at ? ` \u00B7 Answered ${formatDateTime(c.resolved_at)}` : ''}</p>

          {choices.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {choices.map((ch) => <Button key={ch.action} variant={ch.variant} onClick={() => { setError(''); setPending(ch.action); }}>{ch.label}</Button>)}
            </div>
          ) : (
            <p className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted"><Lock className="h-3.5 w-3.5" />{user?.role === 'PATIENT' ? 'This request has been answered.' : 'Only the patient can answer this request.'}</p>
          )}

          {c.actions.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-muted">History</p>
              <ul className="space-y-1.5">
                {c.actions.map((a) => (
                  <li key={a.id} className="text-xs">{a.action.replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase())} <span className="text-muted">· {formatDateTime(a.created_at)}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      <Dialog open={!!pending} onClose={() => setPending(null)} busy={busy} title={confirm?.title ?? ''}>
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-foreground/80">{confirm.body}</p>
            {error && <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPending(null)} disabled={busy}>Back</Button>
              <Button variant={pending === 'APPROVE' ? 'primary' : pending === 'DECLINE' ? 'danger' : 'secondary'} loading={busy} onClick={decide}>{choices.find((x) => x.action === pending)?.label ?? 'Confirm'}</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
