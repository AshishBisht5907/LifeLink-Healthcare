'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Activity, ArrowLeftRight, BedDouble, CheckCircle2, ClipboardList,
  Clock3, FileText, Hospital, CircleAlert,
} from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { admissionsApi, referralsApi, requestsApi } from '@/lib/api';
import { PortalPatientGate } from '@/components/portal/PortalPatientGate';
import { Card, CardHeader } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { friendlyError, formatDateTime } from '@/lib/format';
import type { AdmissionListItem, Referral, ServiceRequest } from '@/lib/types';

type JourneyEvent = {
  id: string;
  title: string;
  detail: string;
  at: string;
  kind: 'admission' | 'request' | 'referral' | 'result';
  state: 'done' | 'active' | 'waiting' | 'attention';
};

const resolvedRequest = (request: ServiceRequest) =>
  ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(request.status);

function requestState(status: ServiceRequest['status']): JourneyEvent['state'] {
  if (status === 'COMPLETED') return 'done';
  if (status === 'REJECTED' || status === 'BLOCKED') return 'attention';
  if (status === 'IN_PROGRESS' || status === 'READY') return 'active';
  return 'waiting';
}

function requestNextStep(request: ServiceRequest): string {
  if (request.status === 'COMPLETED') return 'This request is marked complete.';
  if (request.status === 'CANCELLED' || request.status === 'REJECTED') return 'This request is closed. Check with your care team if you still need this service.';
  if (request.status === 'BLOCKED') return 'This request is blocked. Contact your care team to understand what is needed.';
  if (request.status === 'IN_PROGRESS') return 'The assigned team is working on this request.';
  if (request.status === 'READY') return 'This request is ready for the next step. Check its details for updates.';
  if (request.status === 'APPROVAL_REQUIRED') return 'Approval is needed before this request can move forward. Check Consent.';
  return 'The hospital team has not marked this request complete yet.';
}

function admissionEvents(admissions: AdmissionListItem[]): JourneyEvent[] {
  return admissions.flatMap((admission) => {
    const events: JourneyEvent[] = [{
      id: 'admission-' + admission.id,
      title: 'Hospital admission',
      detail: admission.hospital_name + ' · ' + admission.admission_number + ' · ' + admission.status.replace(/_/g, ' ').toLowerCase(),
      at: admission.admitted_at,
      kind: 'admission',
      state: admission.status === 'ACTIVE' ? 'active' : 'done',
    }];
    if (admission.discharged_at) events.push({
      id: 'discharge-' + admission.id,
      title: 'Discharge recorded',
      detail: admission.hospital_name + ' · ' + admission.admission_number,
      at: admission.discharged_at,
      kind: 'result',
      state: 'done',
    });
    return events;
  });
}

function requestEvents(requests: ServiceRequest[]): JourneyEvent[] {
  return requests.flatMap((request) => {
    const events: JourneyEvent[] = [{
      id: 'request-' + request.id,
      title: request.request_type.replace(/_/g, ' ') + ' request',
      detail: 'Current status: ' + request.status.replace(/_/g, ' ').toLowerCase() + (request.department_name ? ' · ' + request.department_name : ''),
      at: request.created_at,
      kind: 'request',
      state: requestState(request.status),
    }];
    if (request.completed_at) events.push({
      id: 'request-complete-' + request.id,
      title: request.request_type.replace(/_/g, ' ') + ' completed',
      detail: request.department_name ? 'Completed by ' + request.department_name : 'Completion recorded by the hospital team',
      at: request.completed_at,
      kind: 'result',
      state: 'done',
    });
    return events;
  });
}

function referralEvents(referrals: Referral[]): JourneyEvent[] {
  return referrals.flatMap((referral) => {
    const events: JourneyEvent[] = [{
      id: 'referral-' + referral.id,
      title: 'Hospital referral created',
      detail: referral.from_hospital_name + ' → ' + referral.to_hospital_name + ' · ' + referral.status.toLowerCase(),
      at: referral.created_at,
      kind: 'referral',
      state: referral.status === 'REJECTED' ? 'attention' : referral.status === 'PENDING' ? 'waiting' : 'active',
    }];
    if (referral.responded_at) events.push({
      id: 'referral-response-' + referral.id,
      title: 'Referral ' + referral.status.toLowerCase(),
      detail: referral.to_hospital_name + (referral.response_note ? ' · ' + referral.response_note : ''),
      at: referral.responded_at,
      kind: 'result',
      state: referral.status === 'REJECTED' ? 'attention' : 'done',
    });
    return events;
  });
}

function eventIcon(kind: JourneyEvent['kind']) {
  if (kind === 'admission') return <BedDouble className="h-4 w-4" />;
  if (kind === 'request') return <ClipboardList className="h-4 w-4" />;
  if (kind === 'referral') return <ArrowLeftRight className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function stateClasses(state: JourneyEvent['state']) {
  if (state === 'done') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (state === 'attention') return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (state === 'active') return 'bg-sky-50 text-sky-700 ring-sky-200';
  return 'bg-amber-50 text-amber-700 ring-amber-200';
}

function Content({ patientId }: { patientId: string }) {
  const admissions = useApi(() => admissionsApi.list(), [patientId]);
  const requests = useApi(() => requestsApi.list({ patient: patientId }), [patientId]);
  const referrals = useApi(() => referralsApi.list(), [patientId]);

  const patientAdmissions = (admissions.data?.results ?? []).filter((item) => item.patient === patientId);
  const patientReferrals = (referrals.data?.results ?? []).filter((item) => item.patient === patientId);
  const patientRequests = requests.data?.results ?? [];
  const loading = admissions.loading || requests.loading || referrals.loading;
  const error = admissions.error ?? requests.error ?? referrals.error;
  const refetchAll = () => { admissions.refetch(); requests.refetch(); referrals.refetch(); };

  const events = useMemo(() => [
    ...admissionEvents(patientAdmissions),
    ...requestEvents(patientRequests),
    ...referralEvents(patientReferrals),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [patientAdmissions, patientRequests, patientReferrals]);

  const nextStep = patientRequests.find((request) => !resolvedRequest(request));
  const waitingReferral = patientReferrals.find((referral) => referral.status === 'PENDING');
  const activeAdmission = patientAdmissions.find((admission) => admission.status === 'ACTIVE');

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-dark"><Activity className="h-5 w-5" /></span>
        <div>
          <h1 className="text-xl font-semibold">My Care Journey</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">A timeline of hospital stays, care requests and referrals recorded in LifeLink. It shows only information returned by your account.</p>
        </div>
      </div>

      {loading && <LoadingBlock rows={5} />}
      {error && <Card><ErrorState status={error.status} description={friendlyError(error.status)} onRetry={refetchAll} /></Card>}

      {!loading && !error && (
        <>
          <Card className="overflow-hidden">
            <CardHeader title="What happens next?" subtitle="Based on the latest status recorded in LifeLink" />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {nextStep ? (
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-brand" />{nextStep.request_type.replace(/_/g, ' ')}</div>
                  <p className="mt-2 text-sm text-muted">{requestNextStep(nextStep)}</p>
                  <p className="mt-2 text-xs text-muted">Status: {nextStep.status.replace(/_/g, ' ').toLowerCase()}</p>
                </div>
              ) : waitingReferral ? (
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold"><ArrowLeftRight className="h-4 w-4 text-brand" />Referral awaiting reply</div>
                  <p className="mt-2 text-sm text-muted">Waiting for {waitingReferral.to_hospital_name} to respond to the referral.</p>
                </div>
              ) : activeAdmission ? (
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Hospital className="h-4 w-4 text-brand" />Active hospital stay</div>
                  <p className="mt-2 text-sm text-muted">Your admission at {activeAdmission.hospital_name} is active. Check Requests for the current status of tests and care tasks.</p>
                  <Link href="/portal/requests" className="mt-3 inline-flex text-sm font-semibold text-brand-dark hover:underline">View requests</Link>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-brand" />No pending next step shown</div>
                  <p className="mt-2 text-sm text-muted">There is no open request or waiting referral in the records currently available here.</p>
                </div>
              )}
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-semibold">Quick links</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/portal/requests" className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium hover:bg-neutral-tint">Care requests</Link>
                  <Link href="/portal/admissions" className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium hover:bg-neutral-tint">Hospital stays</Link>
                  <Link href="/portal/referrals" className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium hover:bg-neutral-tint">Referrals</Link>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Timeline" subtitle={events.length + ' recorded ' + (events.length === 1 ? 'event' : 'events') + ' · newest first'} />
            {events.length === 0 ? (
              <div className="p-5"><EmptyState icon={<Activity className="h-5 w-5" />} title="Your journey is empty for now" description="When a hospital stay, request or referral is recorded, it will appear here. No events are invented or added manually." /></div>
            ) : (
              <ol className="divide-y divide-border">
                {events.map((event) => (
                  <li key={event.id} className="flex gap-3 px-4 py-4 sm:px-5">
                    <span className={'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ' + stateClasses(event.state)}>{eventIcon(event.kind)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <p className="text-sm font-semibold">{event.title}</p>
                        <time className="text-xs text-muted">{formatDateTime(event.at)}</time>
                      </div>
                      <p className="mt-1 text-sm text-muted">{event.detail}</p>
                      <span className={'mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ring-1 ring-inset ' + stateClasses(event.state)}>{event.state === 'done' ? 'Recorded complete' : event.state === 'attention' ? 'Needs attention' : event.state === 'active' ? 'In progress' : 'Waiting'}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <p className="flex items-start gap-2 text-xs text-muted"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />This is a coordination timeline, not medical advice. For urgent symptoms or emergencies, contact local emergency services or your care team.</p>
        </>
      )}
    </div>
  );
}

export default function CareJourneyPage() {
  return (
    <PortalPatientGate title="My Care Journey" subtitle="Follow the hospital steps and updates recorded for you.">
      {(patientId) => <Content patientId={patientId} />}
    </PortalPatientGate>
  );
}
