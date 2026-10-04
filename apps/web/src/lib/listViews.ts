/**
 * Pure helpers behind the Requests / Admissions / Referrals / Capacity pages.
 * Nothing here decides who may see or do anything: the backend already did.
 * This only sorts, groups and counts what the backend returned.
 * Type-only imports so it runs under `node --test`.
 */
import type { AdmissionListItem, HospitalCapacity, Paginated, Referral, ServiceRequest } from './types';

// ---------- requests ----------
export type RequestGroup = 'ALL' | 'NEEDS_ACTION' | 'IN_PROGRESS' | 'ON_HOLD' | 'RESOLVED';

export const REQUEST_GROUP_STATUSES: Record<Exclude<RequestGroup, 'ALL'>, string[]> = {
  NEEDS_ACTION: ['REQUESTED', 'PENDING', 'APPROVAL_REQUIRED'],
  IN_PROGRESS: ['APPROVED', 'READY', 'IN_PROGRESS'],
  ON_HOLD: ['POSTPONED', 'BLOCKED'],
  RESOLVED: ['COMPLETED', 'CANCELLED', 'REJECTED'],
};

const PRIORITY_RANK: Record<string, number> = { EMERGENCY: 3, HIGH: 2, NORMAL: 1, LOW: 0 };
const ms = (iso: string) => new Date(iso).getTime();

export const isResolved = (r: Pick<ServiceRequest, 'status'>) => REQUEST_GROUP_STATUSES.RESOLVED.includes(r.status);
export const isUrgent = (r: Pick<ServiceRequest, 'status' | 'priority'>) => !isResolved(r) && (r.priority === 'EMERGENCY' || r.priority === 'HIGH');

/** Open work first (urgent, then longest-waiting), resolved work last (newest first). */
export function sortRequests(list: ServiceRequest[]): ServiceRequest[] {
  return [...list].sort((a, b) => {
    const ra = isResolved(a), rb = isResolved(b);
    if (ra !== rb) return ra ? 1 : -1;
    if (ra) return ms(b.created_at) - ms(a.created_at);
    const p = (PRIORITY_RANK[b.priority] ?? 1) - (PRIORITY_RANK[a.priority] ?? 1);
    return p !== 0 ? p : ms(a.created_at) - ms(b.created_at);
  });
}

export function filterRequests(list: ServiceRequest[], group: RequestGroup): ServiceRequest[] {
  return group === 'ALL' ? list : list.filter((r) => REQUEST_GROUP_STATUSES[group].includes(r.status));
}

export function requestCounts(list: ServiceRequest[]) {
  return {
    ALL: list.length,
    NEEDS_ACTION: filterRequests(list, 'NEEDS_ACTION').length,
    IN_PROGRESS: filterRequests(list, 'IN_PROGRESS').length,
    ON_HOLD: filterRequests(list, 'ON_HOLD').length,
    RESOLVED: filterRequests(list, 'RESOLVED').length,
    URGENT: list.filter(isUrgent).length,
  };
}

/** Requests the user created or that are assigned to them. Backend scoping already applied. */
export const mineOnly = (list: ServiceRequest[], userId: string | null | undefined) =>
  userId ? list.filter((r) => r.created_by === userId || r.assigned_to === userId) : [];

// ---------- admissions ----------
export type AdmissionGroup = 'ALL' | AdmissionListItem['status'];

export function admissionCounts(list: AdmissionListItem[]) {
  return {
    ALL: list.length,
    ACTIVE: list.filter((a) => a.status === 'ACTIVE').length,
    DISCHARGED: list.filter((a) => a.status === 'DISCHARGED').length,
    TRANSFERRED: list.filter((a) => a.status === 'TRANSFERRED').length,
  };
}

export function filterAdmissions(list: AdmissionListItem[], group: AdmissionGroup, query: string): AdmissionListItem[] {
  const q = query.trim().toLowerCase();
  return list
    .filter((a) => group === 'ALL' || a.status === group)
    .filter((a) => !q || a.patient_name.toLowerCase().includes(q) || a.admission_number.toLowerCase().includes(q))
    .sort((a, b) => (a.status === 'ACTIVE') === (b.status === 'ACTIVE') ? ms(b.admitted_at) - ms(a.admitted_at) : a.status === 'ACTIVE' ? -1 : 1);
}

// ---------- referrals ----------
export type ReferralDirection = 'OUTGOING' | 'INCOMING';
export type ReferralTab = 'ALL' | ReferralDirection;

export function referralDirection(r: Pick<Referral, 'from_hospital' | 'to_hospital'>, hospitalId: string | null | undefined): ReferralDirection | null {
  if (!hospitalId) return null;
  if (r.from_hospital === hospitalId) return 'OUTGOING';
  if (r.to_hospital === hospitalId) return 'INCOMING';
  return null;
}

export function filterReferrals(list: Referral[], tab: ReferralTab, hospitalId: string | null | undefined): Referral[] {
  return [...list]
    .filter((r) => tab === 'ALL' || referralDirection(r, hospitalId) === tab)
    .sort((a, b) => ms(b.created_at) - ms(a.created_at));
}

export function referralCounts(list: Referral[], hospitalId: string | null | undefined) {
  return {
    ALL: list.length,
    OUTGOING: list.filter((r) => referralDirection(r, hospitalId) === 'OUTGOING').length,
    INCOMING: list.filter((r) => referralDirection(r, hospitalId) === 'INCOMING').length,
    AWAITING: list.filter((r) => r.status === 'PENDING').length,
  };
}

// ---------- capacity ----------
export type CapacityTone = 'ok' | 'low' | 'critical' | 'unset';

export function capacityStats(c: Pick<HospitalCapacity, 'total' | 'available'>) {
  const total = Math.max(c.total, 0);
  const available = Math.min(Math.max(c.available, 0), total);
  const occupied = total - available;
  const pctFree = total > 0 ? Math.round((available / total) * 100) : null;
  const tone: CapacityTone = pctFree === null ? 'unset' : pctFree <= 10 ? 'critical' : pctFree <= 30 ? 'low' : 'ok';
  return { total, available, occupied, pctFree, tone };
}

/** Returns an error sentence, or null if the numbers are sensible. The backend still validates. */
export function validateCapacity(total: number, available: number): string | null {
  if (!Number.isInteger(total) || !Number.isInteger(available)) return 'Enter whole numbers.';
  if (total < 0 || available < 0) return 'Numbers cannot be negative.';
  if (available > total) return 'Available cannot be more than the total.';
  return null;
}

// ---------- shared ----------
/**
 * Count matches in ONE page of a paginated list. If the server has more pages
 * the number is only a floor, so it is shown as "N+" and never as a wrong exact figure.
 */
export function tally<T>(page: Paginated<T> | null, pred: (x: T) => boolean): string | null {
  if (!page) return null;
  const n = page.results.filter(pred).length;
  return page.next ? `${n}+` : String(n);
}

/** Open (not resolved) requests in working order: urgent first, then longest waiting. */
export const openRequests = (list: ServiceRequest[]): ServiceRequest[] => sortRequests(list).filter((r) => !isResolved(r));
