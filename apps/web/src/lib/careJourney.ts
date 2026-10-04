/**
 * Builds the Care Journey from data the backend really returns.
 *
 * Rules (do not bend these):
 *  - 'done'    = a recorded event that has a real timestamp.
 *  - 'current' = the present status. It is NOT a historical event, so it never
 *                claims a time it doesn't have.
 *  - 'pending' = only ever the final "Completion" of an active request. The
 *                backend's path between statuses varies, so no other future
 *                step is invented.
 *  - 'problem' = rejected / cancelled / postponed / blocked / declined.
 *
 * Deliberately NOT modelled, because no event or history exists for it:
 * "management approved", "doctor assigned" (assignment has no time or name),
 * "consultation", "treatment", "follow-up".
 *
 * Type-only imports so this file runs under plain `node --test`.
 */
import type { AdmissionListItem, Referral, ServiceRequest, Transfer } from './types';

export type StepState = 'done' | 'current' | 'pending' | 'problem';
export type Variant = 'patient' | 'staff';

export interface JourneyStep {
  key: string;
  state: StepState;
  title: string;
  at?: string | null;   // only set for real recorded events
  detail?: string;
}

export interface RequestTrack {
  id: string;
  requestType: string;
  department: string | null;
  priority: string;
  status: string;
  assigned: boolean;
  updatedAt: string;
  steps: JourneyStep[];
}

export interface ReferralTrack {
  id: string;
  target: string;
  steps: JourneyStep[];
}

export interface Episode {
  key: string;
  admission: AdmissionListItem | null;
  stay: JourneyStep[];
  requests: RequestTrack[];
  referrals: ReferralTrack[];
}

export interface JourneySummary {
  headline: string | null;
  admittedAt: string[];
  activeRequests: number;
  pendingReferrals: number;
}

export interface Journey {
  episodes: Episode[];
  summary: JourneySummary;
  isEmpty: boolean;
}

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested', PENDING: 'Pending', APPROVAL_REQUIRED: 'Waiting for approval',
  APPROVED: 'Approved', READY: 'Ready', IN_PROGRESS: 'In progress', COMPLETED: 'Completed',
  POSTPONED: 'Postponed', CANCELLED: 'Cancelled', BLOCKED: 'Blocked', REJECTED: 'Rejected',
};

const ACTIVE = new Set(['REQUESTED', 'PENDING', 'APPROVAL_REQUIRED', 'APPROVED', 'READY', 'IN_PROGRESS']);
const HELD = new Set(['POSTPONED', 'BLOCKED']);
const ENDED_BAD = new Set(['CANCELLED', 'REJECTED']);

const label = (s: string) => REQUEST_STATUS_LABEL[s] ?? s.replace(/_/g, ' ').toLowerCase();
const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
const sentence = (s: string) => { const t = s.replace(/_/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

export function buildRequestSteps(r: ServiceRequest, variant: Variant): JourneyStep[] {
  const steps: JourneyStep[] = [{ key: `${r.id}-created`, state: 'done', title: 'Request created', at: r.created_at }];

  const history = [...(r.transitions ?? [])]
    .filter((t) => t.from_status !== t.to_status && t.to_status !== 'REQUESTED')
    .sort((a, b) => time(a.created_at) - time(b.created_at));

  for (const t of history) {
    const detail = variant === 'staff'
      ? [t.changed_by_username ? `by ${t.changed_by_username}` : '', t.note].filter(Boolean).join(' · ') || undefined
      : undefined; // patients/family never see staff usernames or internal notes
    steps.push({ key: t.id, state: 'done', title: label(t.to_status), at: t.created_at, detail });
  }

  const now = r.status;
  const last = history[history.length - 1];

  if (now === 'COMPLETED') {
    if (!last || last.to_status !== 'COMPLETED') {
      steps.push({ key: `${r.id}-completed`, state: 'done', title: 'Completed', at: r.completed_at ?? r.updated_at });
    }
    return steps;
  }

  // The log and the live status should agree. If they don't (status set
  // without a logged change), show the live status as "current" without a time.
  if (now !== 'REQUESTED' && (!last || last.to_status !== now)) {
    steps.push({ key: `${r.id}-now`, state: 'done', title: label(now) });
  }

  const tail = steps[steps.length - 1];
  const reason = r.postpone_or_reject_reason?.trim() || undefined;
  if (ENDED_BAD.has(now)) {
    steps[steps.length - 1] = { ...tail, state: 'problem', detail: reason ?? tail.detail };
  } else if (HELD.has(now)) {
    steps[steps.length - 1] = { ...tail, state: 'problem', detail: reason ?? tail.detail };
  } else {
    steps[steps.length - 1] = { ...tail, state: 'current' };
  }

  if (ACTIVE.has(now)) steps.push({ key: `${r.id}-complete`, state: 'pending', title: 'Completion' });
  return steps;
}

export function buildStay(a: AdmissionListItem): JourneyStep[] {
  const steps: JourneyStep[] = [{ key: `${a.id}-in`, state: 'done', title: `Admitted to ${a.hospital_name}`, at: a.admitted_at }];
  if (a.status === 'ACTIVE') steps.push({ key: `${a.id}-now`, state: 'current', title: 'Currently admitted' });
  else if (a.status === 'DISCHARGED') steps.push({ key: `${a.id}-out`, state: 'done', title: 'Discharged', at: a.discharged_at });
  else steps.push({ key: `${a.id}-tr`, state: 'done', title: 'Transferred to another hospital', at: a.discharged_at });
  return steps;
}

export function buildReferralSteps(r: Referral, transfer: Transfer | undefined, variant: Variant): JourneyStep[] {
  const steps: JourneyStep[] = [{
    key: `${r.id}-sent`, state: 'done', title: `Referral sent to ${r.to_hospital_name}`, at: r.created_at,
    detail: r.required_department_type ? `${sentence(r.required_department_type)} care requested` : undefined,
  }];
  const note = variant === 'staff' ? r.response_note?.trim() || undefined : undefined;

  if (r.status === 'PENDING') {
    steps.push({ key: `${r.id}-wait`, state: 'current', title: `Waiting for ${r.to_hospital_name} to respond` });
    return steps;
  }
  if (r.status === 'REJECTED') {
    steps.push({ key: `${r.id}-no`, state: 'problem', title: `Declined by ${r.to_hospital_name}`, at: r.responded_at, detail: note });
    return steps;
  }
  steps.push({
    key: `${r.id}-yes`, state: 'done', at: r.responded_at, detail: note,
    title: r.status === 'CONDITIONAL' ? `Accepted with conditions by ${r.to_hospital_name}` : `Accepted by ${r.to_hospital_name}`,
  });
  if (transfer?.completed_at) {
    steps.push({ key: `${r.id}-moved`, state: 'done', title: 'Transfer completed', at: transfer.completed_at,
      detail: transfer.new_admission ? `Admitted at ${r.to_hospital_name}` : undefined });
  } else {
    steps.push({ key: `${r.id}-arr`, state: 'current', title: 'Transfer being arranged',
      detail: transfer?.ambulance_arranged ? 'Ambulance arranged' : undefined });
  }
  return steps;
}

export function buildJourney(input: {
  admissions: AdmissionListItem[];
  requests: ServiceRequest[];
  referrals: Referral[];
  transfers?: Record<string, Transfer>;
  variant?: Variant;
}): Journey {
  const variant = input.variant ?? 'patient';
  const transfers = input.transfers ?? {};
  const admissions = [...input.admissions].sort((a, b) => {
    if ((a.status === 'ACTIVE') !== (b.status === 'ACTIVE')) return a.status === 'ACTIVE' ? -1 : 1;
    return time(b.admitted_at) - time(a.admitted_at);
  });

  const track = (r: ServiceRequest): RequestTrack => ({
    id: r.id, requestType: r.request_type, department: r.department_name, priority: r.priority,
    status: r.status, assigned: Boolean(r.assigned_to), updatedAt: r.updated_at,
    steps: buildRequestSteps(r, variant),
  });
  const refTrack = (r: Referral): ReferralTrack => ({ id: r.id, target: r.to_hospital_name, steps: buildReferralSteps(r, transfers[r.id], variant) });
  const newestFirst = <T extends { created_at: string }>(x: T[]) => [...x].sort((a, b) => time(b.created_at) - time(a.created_at));

  const known = new Set(admissions.map((a) => a.id));
  const episodes: Episode[] = admissions.map((a) => ({
    key: a.id, admission: a, stay: buildStay(a),
    requests: newestFirst(input.requests.filter((r) => r.admission === a.id)).map(track),
    referrals: newestFirst(input.referrals.filter((r) => r.from_admission === a.id)).map(refTrack),
  }));

  const orphanReq = input.requests.filter((r) => !known.has(r.admission));
  const orphanRef = input.referrals.filter((r) => !known.has(r.from_admission));
  if (orphanReq.length || orphanRef.length) {
    episodes.push({ key: 'other', admission: null, stay: [], requests: newestFirst(orphanReq).map(track), referrals: newestFirst(orphanRef).map(refTrack) });
  }

  const active = admissions.filter((a) => a.status === 'ACTIVE');
  const activeRequests = input.requests.filter((r) => ACTIVE.has(r.status)).length;
  const pendingReferrals = input.referrals.filter((r) => r.status === 'PENDING').length;
  const parts: string[] = [];
  if (active.length) parts.push(`Currently admitted at ${active.map((a) => a.hospital_name).join(', ')}`);
  if (activeRequests) parts.push(`${activeRequests} ${activeRequests === 1 ? 'request' : 'requests'} in progress`);
  if (pendingReferrals) parts.push(`${pendingReferrals} ${pendingReferrals === 1 ? 'referral' : 'referrals'} awaiting a reply`);

  return {
    episodes,
    isEmpty: episodes.length === 0,
    summary: { headline: parts.length ? parts.join(' · ') : null, admittedAt: active.map((a) => a.hospital_name), activeRequests, pendingReferrals },
  };
}
