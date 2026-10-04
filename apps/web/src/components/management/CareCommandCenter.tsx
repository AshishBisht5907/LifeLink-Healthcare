'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, ClipboardList, Clock3, FileCheck2, Gauge, Sparkles } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { HospitalCapacity, Referral, ServiceRequest } from '@/lib/types';

export const DEFAULT_DELAY_THRESHOLD_MINUTES = 30;

function formatWaiting(minutes: number) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function getWaitingMinutes(item: ServiceRequest) {
  if (!item.created_at) return 0;
  const started = new Date(item.created_at).getTime();
  if (Number.isNaN(started)) return 0;
  return (Date.now() - started) / 60000;
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDuration(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(Math.abs(totalMinutes)));
  if (minutes === 0 && totalMinutes > 0) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function getStatusStartTimestamp(request: ServiceRequest): number | null {
  const transitions = [...(request.transitions ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const matching = transitions.filter((transition) => transition.to_status === request.status);
  const latestMatch = matching[matching.length - 1];
  if (latestMatch) return parseTimestamp(latestMatch.created_at);
  return parseTimestamp(request.created_at);
}

function getActiveWaitMinutes(request: ServiceRequest): number {
  const startedAt = getStatusStartTimestamp(request);
  if (startedAt === null) return 0;
  return Math.max(0, (Date.now() - startedAt) / 60000);
}

function getCompletedDurationMinutes(request: ServiceRequest): number {
  const startedAt = parseTimestamp(request.created_at);
  const endedAt = parseTimestamp(request.completed_at);
  if (startedAt === null) return 0;
  if (endedAt === null) return 0;
  return Math.max(0, (endedAt - startedAt) / 60000);
}

function getDueText(request: ServiceRequest) {
  const dueAt = parseTimestamp(request.due_at);
  if (dueAt === null) return 'Due time unavailable';
  const deltaMinutes = (dueAt - Date.now()) / 60000;
  return deltaMinutes > 0 ? `Due in ${formatDuration(deltaMinutes)}` : `Overdue by ${formatDuration(deltaMinutes)}`;
}

function getTransitionMinutes(request: ServiceRequest, status: string) {
  const transition = [...(request.transitions ?? [])]
    .filter((item) => item.to_status === status)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .pop();
  const startedAt = parseTimestamp(transition?.created_at);
  if (startedAt === null) return null;
  return Math.max(0, (Date.now() - startedAt) / 60000);
}

function getCurrentDurationMinutes(request: ServiceRequest) {
  const startedAt = getStatusStartTimestamp(request);
  if (startedAt === null) return null;
  return Math.max(0, (Date.now() - startedAt) / 60000);
}

function getBottleneckData(requests: ServiceRequest[], departmentWorkload: ReturnType<typeof buildDepartmentWorkload>) {
  const approvalWaiting = requests
    .filter((request) => request.status === 'APPROVAL_REQUIRED')
    .map((request) => ({ request, elapsedMinutes: getTransitionMinutes(request, 'APPROVAL_REQUIRED') }))
    .filter((item): item is { request: ServiceRequest; elapsedMinutes: number } => item.elapsedMinutes !== null)
    .sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);

  const departmentActionWaiting = requests
    .filter((request) => ['APPROVED', 'READY'].includes(request.status))
    .map((request) => ({ request, elapsedMinutes: getCurrentDurationMinutes(request) }))
    .filter((item): item is { request: ServiceRequest; elapsedMinutes: number } => item.elapsedMinutes !== null)
    .sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);

  const inProgress = requests
    .filter((request) => request.status === 'IN_PROGRESS')
    .map((request) => ({ request, elapsedMinutes: getTransitionMinutes(request, 'IN_PROGRESS') }))
    .filter((item): item is { request: ServiceRequest; elapsedMinutes: number } => item.elapsedMinutes !== null)
    .sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);

  const priorityWaiting = requests
    .filter((request) =>
      ['LOW', 'NORMAL'].includes(request.priority) === false &&
      ACTIVE_REQUEST_STATUSES.has(request.status) &&
      request.status !== 'IN_PROGRESS'
    )
    .map((request) => ({ request, elapsedMinutes: getActiveWaitMinutes(request) }))
    .sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);

  const highestActive = Math.max(0, ...departmentWorkload.map((department) => department.active));
  const departmentPressure = highestActive === 0
    ? []
    : departmentWorkload.filter((department) => department.active === highestActive);

  return { approvalWaiting, departmentActionWaiting, inProgress, priorityWaiting, departmentPressure };
}

const ACTIVE_REQUEST_STATUSES = new Set([
  'REQUESTED',
  'PENDING',
  'APPROVAL_REQUIRED',
  'APPROVED',
  'READY',
  'IN_PROGRESS',
  'BLOCKED',
  'POSTPONED',
]);

const PENDING_REQUEST_STATUSES = new Set(['REQUESTED', 'PENDING', 'APPROVAL_REQUIRED']);

function getCapacitySummary(departmentName: string, capacities: HospitalCapacity[]) {
  const normalized = departmentName.toUpperCase();
  const matches = capacities.filter((capacity) => {
    if (normalized.includes('OT') && capacity.resource_type === 'OT_SLOT') return true;
    if (normalized.includes('WARD') && (capacity.resource_type === 'GENERAL_BED' || capacity.resource_type === 'ICU_BED')) return true;
    if (normalized.includes('GENERAL') && (capacity.resource_type === 'GENERAL_BED' || capacity.resource_type === 'ICU_BED')) return true;
    return false;
  });

  if (matches.length === 0) return 'Capacity data unavailable';
  return matches.map((capacity) => `${capacity.resource_type.replaceAll('_', ' ')}: ${capacity.available} / ${capacity.total}`).join(' • ');
}

export function buildDepartmentWorkload(requests: ServiceRequest[], capacities: HospitalCapacity[] = []) {
  const byDepartment = new Map<string, ServiceRequest[]>();

  for (const request of requests) {
    const departmentName = request.department_name?.trim() || 'Unassigned';
    if (departmentName === 'Unassigned') continue;
    const existing = byDepartment.get(departmentName) ?? [];
    existing.push(request);
    byDepartment.set(departmentName, existing);
  }

  return [...byDepartment.entries()]
    .map(([departmentName, departmentRequests]) => {
      const active = departmentRequests.filter((request) => ACTIVE_REQUEST_STATUSES.has(request.status));
      const pending = departmentRequests.filter((request) => PENDING_REQUEST_STATUSES.has(request.status));
      const inProgress = departmentRequests.filter((request) => ['IN_PROGRESS', 'READY'].includes(request.status));
      const emergency = departmentRequests.filter((request) => request.priority === 'EMERGENCY' && ACTIVE_REQUEST_STATUSES.has(request.status));
      const assignedStaff = new Set(
        departmentRequests
          .map((request) => request.assigned_to)
          .filter((value): value is string => Boolean(value))
      );

      return {
        departmentName,
        active: active.length,
        pending: pending.length,
        inProgress: inProgress.length,
        emergency: emergency.length,
        assignedStaff: assignedStaff.size,
        capacity: getCapacitySummary(departmentName, capacities),
      };
    })
    .sort((a, b) => b.active - a.active || b.emergency - a.emergency || a.departmentName.localeCompare(b.departmentName));
}

export function CareCommandCenter({
  requests,
  referrals,
  capacities = [],
  delayThresholdMinutes = DEFAULT_DELAY_THRESHOLD_MINUTES,
}: {
  requests: ServiceRequest[];
  referrals: Referral[];
  capacities?: HospitalCapacity[];
  delayThresholdMinutes?: number;
}) {
  const urgentActions = requests.filter((r) =>
    r.priority === 'EMERGENCY' && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(r.status)
  );

  const awaitingApproval = requests.filter((r) =>
    ['REQUESTED', 'PENDING', 'APPROVAL_REQUIRED'].includes(r.status)
  );

  const delayedRequests = requests.filter((r) => {
    if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(r.status)) return false;
    return getWaitingMinutes(r) > delayThresholdMinutes;
  });

  const pendingReferrals = referrals.filter((r) => r.status === 'PENDING');
  const completedToday = requests.filter((r) => {
    if (r.status !== 'COMPLETED' || !r.completed_at) return false;
    const completed = new Date(r.completed_at);
    const today = new Date();
    return completed.toDateString() === today.toDateString();
  });

  const departmentWorkload = buildDepartmentWorkload(requests, capacities);
  const activeWaits = requests
    .filter((request) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(request.status))
    .map((request) => ({
      request,
      waitingMinutes: getActiveWaitMinutes(request),
      dueText: getDueText(request),
    }))
    .sort((a, b) => b.waitingMinutes - a.waitingMinutes);
  const completedDurations = requests
    .filter((request) => request.status === 'COMPLETED')
    .map((request) => ({
      request,
      durationMinutes: getCompletedDurationMinutes(request),
    }))
    .sort((a, b) => b.durationMinutes - a.durationMinutes)
    .slice(0, 4);
  const bottlenecks = getBottleneckData(requests, departmentWorkload);

  const summaryCards = [
    { label: 'Urgent actions', value: urgentActions.length, icon: AlertTriangle, tone: 'danger' },
    { label: 'Awaiting approval', value: awaitingApproval.length, icon: ClipboardList, tone: 'warning' },
    { label: 'Delayed requests', value: delayedRequests.length, icon: Clock3, tone: 'info' },
    { label: 'Pending referrals', value: pendingReferrals.length, icon: ArrowRight, tone: 'brand' },
    { label: 'Completed today', value: completedToday.length, icon: FileCheck2, tone: 'success' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">LifeLink Care Command Center</h1>
        <p className="mt-1 text-sm text-muted">What needs attention right now?</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                tone === 'danger' ? 'bg-danger-tint text-danger' :
                tone === 'warning' ? 'bg-warning-tint text-warning' :
                tone === 'info' ? 'bg-info-tint text-info' :
                tone === 'brand' ? 'bg-brand-tint text-brand-dark' : 'bg-success-tint text-success'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{value}</p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Department workload" subtitle="Real queue by department using live request data" />
        <div className="divide-y divide-border">
          {departmentWorkload.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted">No department workload is available yet.</div>
          ) : (
            departmentWorkload.map((department) => (
              <div key={department.departmentName} className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-6">
                <div className="xl:col-span-2">
                  <p className="text-sm font-semibold text-foreground">{department.departmentName}</p>
                  <p className="mt-1 text-xs text-muted">Assigned staff: {department.assignedStaff}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">Active</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{department.active}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">Pending</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{department.pending}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">In progress</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{department.inProgress}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">Emergency</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{department.emergency}</p>
                </div>
                <div className="md:col-span-2 xl:col-span-6">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">Capacity</p>
                  <p className="mt-1 text-sm text-foreground">{department.capacity}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Waiting time / SLA" subtitle="Tracked from live request timestamps and StatusTransition history" />
        <div className="space-y-4 p-5">
          {activeWaits.length === 0 ? (
            <div className="text-sm text-muted">No active requests are currently waiting on a department or approval step.</div>
          ) : (
            <div className="space-y-3">
              {activeWaits.slice(0, 6).map(({ request, waitingMinutes, dueText }) => {
                const dueTone = dueText.startsWith('Overdue by') ? 'text-danger' : dueText.startsWith('Due in') ? 'text-warning' : 'text-muted';
                const waitTone = waitingMinutes > 180 ? 'text-danger' : waitingMinutes > 60 ? 'text-warning' : 'text-foreground';
                const waitingReason = request.status === 'APPROVAL_REQUIRED'
                  ? 'Waiting for approval'
                  : request.status === 'PENDING' || request.status === 'REQUESTED'
                    ? 'Waiting for assignment'
                    : request.status === 'APPROVED' || request.status === 'READY'
                      ? 'Awaiting department action'
                      : request.status === 'IN_PROGRESS'
                        ? 'In progress'
                        : 'Waiting for follow-up';
                return (
                  <div key={request.id} className="grid gap-3 rounded-xl border border-border bg-neutral-tint p-3 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
                    <div>
                      <p className="text-sm font-medium text-foreground">{request.request_type.replaceAll('_', ' ')}</p>
                      <p className="mt-1 text-xs text-muted">{request.patient_name} · {request.department_name ?? 'Unassigned'} · ID {request.id.slice(0, 8)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Status</p>
                      <div className="mt-1">
                        <StatusBadge kind="request" value={request.status} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Waiting</p>
                      <p className={`mt-1 text-sm font-semibold ${waitTone}`}>{formatDuration(waitingMinutes)}</p>
                      <p className="text-[11px] text-muted">{waitingReason}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Due</p>
                      <p className={`mt-1 text-sm font-medium ${dueTone}`}>{dueText}</p>
                      <div className="mt-1">
                        <StatusBadge kind="priority" value={request.priority} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {completedDurations.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Completed request durations</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {completedDurations.map(({ request, durationMinutes }) => (
                  <div key={request.id} className="rounded-lg border border-border bg-white px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{request.request_type.replaceAll('_', ' ')}</p>
                    <p className="mt-1 text-xs text-muted">{request.patient_name} · {request.department_name ?? 'Unassigned'}</p>
                    <p className="mt-2 text-sm font-semibold text-success">Completed in {formatDuration(durationMinutes)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Workflow bottlenecks" subtitle="Observable pressure points from the current hospital workflow" />
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Approval waiting</p>
            {bottlenecks.approvalWaiting.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No current bottleneck detected.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {bottlenecks.approvalWaiting.slice(0, 3).map(({ request, elapsedMinutes }) => (
                  <div key={request.id} className="rounded-lg border border-border bg-neutral-tint px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{request.request_type.replaceAll('_', ' ')}</p>
                    <p className="mt-1 text-xs text-muted">{request.department_name ?? 'Unassigned'} · {request.patient_name}</p>
                    <p className="mt-1 text-xs text-warning">Approval pending · {formatDuration(elapsedMinutes)} · {request.priority}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Department pressure</p>
            {bottlenecks.departmentPressure.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No current bottleneck detected.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {bottlenecks.departmentPressure.map((department) => (
                  <div key={department.departmentName} className="rounded-lg border border-border bg-neutral-tint px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{department.departmentName}</p>
                    <p className="mt-1 text-xs text-muted">Most active requests in the current dataset</p>
                    <p className="mt-1 text-xs text-foreground">Active: {department.active} · Pending: {department.pending} · In progress: {department.inProgress}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Long running</p>
            {bottlenecks.inProgress.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No current bottleneck detected.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {bottlenecks.inProgress.slice(0, 3).map(({ request, elapsedMinutes }) => (
                  <div key={request.id} className="rounded-lg border border-border bg-neutral-tint px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{request.request_type.replaceAll('_', ' ')}</p>
                    <p className="mt-1 text-xs text-muted">{request.department_name ?? 'Unassigned'} · {request.patient_name}</p>
                    <p className="mt-1 text-xs text-info">Longest in-progress duration · {formatDuration(elapsedMinutes)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Priority waiting</p>
            {bottlenecks.priorityWaiting.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No current bottleneck detected.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {bottlenecks.priorityWaiting.slice(0, 3).map(({ request, elapsedMinutes }) => (
                  <div key={request.id} className="rounded-lg border border-border bg-neutral-tint px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{request.request_type.replaceAll('_', ' ')}</p>
                    <p className="mt-1 text-xs text-muted">{request.department_name ?? 'Unassigned'} · {request.status}</p>
                    <p className="mt-1 text-xs text-danger">{request.priority} · High-priority request still waiting · {formatDuration(elapsedMinutes)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <p className="text-[11px] text-muted">These are explainable workflow pressure points based on the current request records, not a predictive or medically validated score.</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Urgent actions" subtitle="Critical items needing a decision or follow-up" />
          <div className="divide-y divide-border">
            {urgentActions.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted">No urgent requests are waiting for attention.</div>
            ) : (
              urgentActions.slice(0, 5).map((request) => (
                <Link key={request.id} href={`/management/admissions/${request.admission}`} className="block px-5 py-3 hover:bg-neutral-tint">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{request.patient_name}</p>
                      <p className="text-xs text-muted">{request.request_type.replaceAll('_', ' ')} · {request.department_name ?? 'Unrouted'}</p>
                    </div>
                    <StatusBadge kind="request" value={request.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pending requests" subtitle="Current queue from request creation to completion" />
          <div className="divide-y divide-border">
            {awaitingApproval.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted">There are no pending requests to review.</div>
            ) : (
              awaitingApproval.slice(0, 5).map((request) => (
                <Link key={request.id} href={`/management/admissions/${request.admission}`} className="block px-5 py-3 hover:bg-neutral-tint">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{request.patient_name}</p>
                      <p className="text-xs text-muted">{request.request_type.replaceAll('_', ' ')} · {request.department_name ?? 'Unrouted'}</p>
                    </div>
                    <StatusBadge kind="request" value={request.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Delayed requests" subtitle={`Requests waiting longer than ${delayThresholdMinutes} minutes`} />
          <div className="divide-y divide-border">
            {delayedRequests.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted">No delayed requests right now.</div>
            ) : (
              delayedRequests.slice(0, 5).map((request) => (
                <Link key={request.id} href={`/management/admissions/${request.admission}`} className="block px-5 py-3 hover:bg-neutral-tint">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{request.request_type.replaceAll('_', ' ')}</p>
                      <p className="text-xs text-muted">{request.patient_name} · Waiting: {formatWaiting(getWaitingMinutes(request))}</p>
                    </div>
                    <StatusBadge kind="request" value={request.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pending referrals" subtitle="Referrals waiting for response from the destination hospital" />
          <div className="divide-y divide-border">
            {pendingReferrals.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted">No waiting referrals.</div>
            ) : (
              pendingReferrals.slice(0, 5).map((referral) => (
                <Link key={referral.id} href={`/management/referrals/${referral.id}`} className="block px-5 py-3 hover:bg-neutral-tint">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{referral.patient_name}</p>
                      <p className="text-xs text-muted">{referral.from_hospital_name} → {referral.to_hospital_name}</p>
                    </div>
                    <StatusBadge kind="referral" value={referral.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="border-brand/20 bg-brand-tint/40">
        <CardHeader title="Operational note" subtitle="Generated from the current workflow records in LifeLink" action={<Sparkles className="h-4 w-4 text-brand-dark" />} />
        <div className="px-5 pb-5 text-sm text-foreground">
          <p>Management can review the current queue, identify delayed requests, and respond to pending referrals using the same data that drives the real workflow.</p>
          <p className="mt-2 text-xs text-muted">Threshold is configured via the delay constant in this component and can be adjusted without changing the workflow backend.</p>
        </div>
      </Card>
    </div>
  );
}
