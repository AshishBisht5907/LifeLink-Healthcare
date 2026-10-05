'use client';

import { useState } from 'react';
import { ClipboardList, Clock3, UserCheck } from 'lucide-react';
import type { ServiceRequest } from '@/lib/types';
import { requestsApi, ApiError } from '@/lib/api';
import { Button, Textarea } from '@/components/ui/Primitives';
import { Dialog } from '@/components/ui/Dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDateTime, friendlyError, requestLabel } from '@/lib/format';
import { isUrgent } from '@/lib/listViews';

type Action = 'accept' | 'start' | 'complete' | 'postpone' | 'cancel' | 'reject';

// Which buttons to OFFER per status. The backend still decides what is allowed; a refused action shows the backend's reason.
const NEXT_ACTIONS: Record<string, { action: Action; label: string; variant: 'primary' | 'secondary' | 'danger' }[]> = {
  REQUESTED: [{ action: 'accept', label: 'Accept', variant: 'primary' }, { action: 'reject', label: 'Reject', variant: 'danger' }],
  PENDING: [{ action: 'accept', label: 'Accept', variant: 'primary' }, { action: 'reject', label: 'Reject', variant: 'danger' }],
  APPROVED: [{ action: 'start', label: 'Start', variant: 'primary' }, { action: 'postpone', label: 'Postpone', variant: 'secondary' }, { action: 'cancel', label: 'Cancel', variant: 'danger' }],
  READY: [{ action: 'start', label: 'Start', variant: 'primary' }, { action: 'postpone', label: 'Postpone', variant: 'secondary' }],
  IN_PROGRESS: [{ action: 'complete', label: 'Mark completed', variant: 'primary' }, { action: 'postpone', label: 'Postpone', variant: 'secondary' }],
  POSTPONED: [{ action: 'accept', label: 'Re-approve', variant: 'primary' }, { action: 'cancel', label: 'Cancel', variant: 'danger' }],
  BLOCKED: [{ action: 'accept', label: 'Unblock (approve)', variant: 'primary' }, { action: 'cancel', label: 'Cancel', variant: 'danger' }],
};

// Actions that need a deliberate confirmation (and an optional note).
const CONFIRM: Partial<Record<Action, { title: string; body: string; done: string }>> = {
  reject: { title: 'Reject this request?', body: 'The requester will see it as rejected. You can add a note explaining why.', done: 'Request rejected' },
  cancel: { title: 'Cancel this request?', body: 'This stops the request. You can add a note explaining why.', done: 'Request cancelled' },
  postpone: { title: 'Postpone this request?', body: 'It stays open but is marked postponed, not done. You can add a note explaining why.', done: 'Request postponed' },
  complete: { title: 'Mark as completed?', body: 'Only do this if the work is actually finished. The backend checks whether you are allowed to complete it.', done: 'Request completed' },
};
const DONE: Record<Action, string> = { accept: 'Request approved', start: 'Request started', complete: 'Request completed', postpone: 'Request postponed', cancel: 'Request cancelled', reject: 'Request rejected' };

/** 403/409 carry a short, meaningful rule from the workflow ("only the department can complete this"). Others get a generic sentence. */
function actionError(err: unknown): string {
  if (err instanceof ApiError) {
    if ((err.status === 403 || err.status === 409 || err.status === 400) && err.message && !err.message.startsWith('{')) return err.message;
    return friendlyError(err.status);
  }
  return friendlyError();
}

interface Props {
  requests: ServiceRequest[];
  /** Only ever set true from a staff/management page. Patient/family views must never pass this:
   * the list defaults to display-only, and internal wording (the request's clinical reason) is hidden unless interactive. */
  interactive?: boolean;
  /** UX nicety only (hides "Mark completed" where it would predictably be refused). The backend is the real check. */
  viewerDepartmentName?: string | null;
  viewerIsManagementOrAdmin?: boolean;
  onChanged?: () => void;
  emptyMessage?: string;
  /** Show the patient's name even when the list is read-only (Admin). Defaults to `interactive`. */
  showPatientName?: boolean;
}

export function ServiceRequestList({ requests, interactive = false, viewerDepartmentName, viewerIsManagementOrAdmin, onChanged, emptyMessage, showPatientName }: Props) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<{ req: ServiceRequest; action: Action } | null>(null);
  const [note, setNote] = useState('');
  const [dialogError, setDialogError] = useState('');

  async function run(req: ServiceRequest, action: Action, withNote?: string) {
    setBusyId(req.id);
    setRowError((e) => ({ ...e, [req.id]: '' }));
    setDialogError('');
    try {
      await requestsApi[action](req.id, withNote?.trim() || undefined);
      toast.show('success', DONE[action], requestLabel(req.request_type)); // only after the backend confirmed
      setConfirming(null); setNote('');
      onChanged?.();                                                        // re-read the real state
    } catch (err) {
      const msg = actionError(err);
      if (confirming) setDialogError(msg); else setRowError((e) => ({ ...e, [req.id]: msg }));
      onChanged?.();                                                        // it may have changed under us
    } finally { setBusyId(null); }
  }

  function choose(req: ServiceRequest, action: Action) {
    if (CONFIRM[action]) { setNote(''); setDialogError(''); setConfirming({ req, action }); } else run(req, action);
  }

  if (requests.length === 0) {
    return <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No requests" description={emptyMessage ?? 'Requests will appear here.'} />;
  }

  const now = Date.now();
  return (
    <>
      <ul className="divide-y divide-border">
        {requests.map((r) => {
          let actions = interactive ? NEXT_ACTIONS[r.status] ?? [] : [];
          const canProcess = viewerIsManagementOrAdmin || (viewerDepartmentName && viewerDepartmentName === r.department_name);
          if (!canProcess) actions = [];
          const canComplete = viewerDepartmentName && viewerDepartmentName === r.department_name;
          if (!canComplete) actions = actions.filter((a) => a.action !== 'complete');
          const urgent = isUrgent(r);
          const overdue = !!r.due_at && new Date(r.due_at).getTime() < now && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(r.status);
          return (
            <li key={r.id} className={`px-5 py-4 ${urgent ? 'border-l-4 border-l-danger bg-danger-tint/30' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{requestLabel(r.request_type)}</p>
                  {(showPatientName ?? interactive) && <p className="text-xs text-muted">{r.patient_name}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{r.department_name ?? 'Not routed to a department'}</span>
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />Created {formatDate(r.created_at)}</span>
                    {r.due_at && <span className={overdue ? 'font-medium text-danger' : ''}>{overdue ? 'Overdue · ' : ''}Due {formatDateTime(r.due_at)}</span>}
                    {r.completed_at && <span>Completed {formatDate(r.completed_at)}</span>}
                    {r.assigned_to && <span className="inline-flex items-center gap-1 rounded-full bg-info-tint px-2 py-0.5 font-medium text-info"><UserCheck className="h-3 w-3" />Staff assigned</span>}
                  </div>
                  {interactive && r.reason && <p className="mt-1.5 text-xs text-foreground/70">Reason: {r.reason}</p>}
                  {r.postpone_or_reject_reason && <p className="mt-1.5 rounded-md bg-warning-tint px-2.5 py-1.5 text-xs text-foreground/80">Note: {r.postpone_or_reject_reason}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {r.priority !== 'NORMAL' && <StatusBadge kind="priority" value={r.priority} />}
                  <StatusBadge kind="request" value={r.status} />
                </div>
              </div>

              {actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {actions.map((a) => (
                    <Button key={a.action} size="sm" variant={a.variant} loading={busyId === r.id && !confirming} disabled={busyId === r.id} onClick={() => choose(r, a.action)}>{a.label}</Button>
                  ))}
                </div>
              )}
              {rowError[r.id] && <p role="alert" className="mt-2 text-xs text-danger">{rowError[r.id]}</p>}
            </li>
          );
        })}
      </ul>

      <Dialog open={!!confirming} onClose={() => setConfirming(null)} busy={!!busyId} title={confirming ? CONFIRM[confirming.action]?.title ?? '' : ''}>
        {confirming && (
          <div className="space-y-4">
            <p className="text-sm text-foreground/80"><span className="font-medium">{requestLabel(confirming.req.request_type)}</span>{interactive ? ` · ${confirming.req.patient_name}` : ''}</p>
            <p className="text-sm text-muted">{CONFIRM[confirming.action]?.body}</p>
            <label className="block text-sm"><span className="mb-1 block text-xs font-medium text-muted">Note (optional)</span>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </label>
            {dialogError && <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{dialogError}</p>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConfirming(null)} disabled={!!busyId}>Back</Button>
              <Button variant={confirming.action === 'complete' ? 'primary' : 'danger'} loading={!!busyId} onClick={() => run(confirming.req, confirming.action, note)}>
                {NEXT_ACTIONS[confirming.req.status]?.find((a) => a.action === confirming.action)?.label ?? 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
