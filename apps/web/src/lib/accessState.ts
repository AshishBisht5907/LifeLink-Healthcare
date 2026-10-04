/**
 * Turns a search row (or a bare patient id) plus the user's own access
 * grants into ONE display state. Pure logic, no security decisions: the
 * backend already decided what the row contains and what the user may open.
 * Type-only imports so this runs under `node --test`.
 */
import type { PatientAccessGrant, PatientSearchRow } from './types';

export type AccessKind =
  | 'HOSPITAL'          // patient belongs to the user's own hospital
  | 'APPROVED'          // patient approved, still active
  | 'EMERGENCY'         // emergency access, still active
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'DECLINED'
  | 'EXPIRED'
  | 'EMERGENCY_EXPIRED'
  | 'REVOKED';

export interface AccessState {
  kind: AccessKind;
  canOpen: boolean;           // the server already lets this user open the record
  canRequest: boolean;        // a NEW normal request is sensible
  until: string | null;       // end time of an active grant
  grant: PatientAccessGrant | null;
}

const isActive = (g: PatientAccessGrant, now: number) =>
  g.status === 'APPROVED' && !!g.expires_at && new Date(g.expires_at).getTime() > now;

export function latestGrant(grants: PatientAccessGrant[], patientId: string): PatientAccessGrant | null {
  const mine = grants.filter((g) => g.patient_id === patientId);
  mine.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return mine[0] ?? null;
}

export function activeGrant(grants: PatientAccessGrant[], patientId: string, now = Date.now()): PatientAccessGrant | null {
  return grants
    .filter((g) => g.patient_id === patientId && isActive(g, now))
    .sort((a, b) => new Date(b.expires_at!).getTime() - new Date(a.expires_at!).getTime())[0] ?? null;
}

export function describeAccess(patientId: string, row: PatientSearchRow | null, grants: PatientAccessGrant[], now = Date.now()): AccessState {
  const active = activeGrant(grants, patientId, now);
  const last = latestGrant(grants, patientId);

  // A row the server marked GRANTED is openable. Work out WHY from the grants.
  if (row?.access === 'GRANTED' || active) {
    if (active) {
      return { kind: active.grant_type === 'EMERGENCY' ? 'EMERGENCY' : 'APPROVED', canOpen: true, canRequest: false, until: active.expires_at, grant: active };
    }
    return { kind: 'HOSPITAL', canOpen: true, canRequest: false, until: null, grant: last };
  }

  const status = row ? row.access : last?.status ?? 'NONE';
  switch (status) {
    case 'PENDING': return { kind: 'PENDING', canOpen: false, canRequest: false, until: null, grant: last };
    case 'APPROVED': // approved but no longer active on the server's clock
    case 'EXPIRED':
      return { kind: last?.grant_type === 'EMERGENCY' ? 'EMERGENCY_EXPIRED' : 'EXPIRED', canOpen: false, canRequest: true, until: null, grant: last };
    case 'DECLINED': return { kind: 'DECLINED', canOpen: false, canRequest: true, until: null, grant: last };
    case 'REVOKED': return { kind: 'REVOKED', canOpen: false, canRequest: true, until: null, grant: last };
    default: return { kind: 'NOT_REQUESTED', canOpen: false, canRequest: true, until: null, grant: last };
  }
}

export const ACCESS_LABEL: Record<AccessKind, string> = {
  HOSPITAL: 'Your hospital\u2019s patient',
  APPROVED: 'Access approved',
  EMERGENCY: 'Emergency access',
  NOT_REQUESTED: 'Access not requested',
  PENDING: 'Request pending',
  DECLINED: 'Access declined',
  EXPIRED: 'Access expired',
  EMERGENCY_EXPIRED: 'Emergency access expired',
  REVOKED: 'Access revoked by patient',
};

/** One display kind for a grant row (used by both the Management and the patient screens). */
export function kindOfGrant(g: PatientAccessGrant): AccessKind {
  const emergency = g.grant_type === 'EMERGENCY';
  switch (g.status) {
    case 'APPROVED': return emergency ? 'EMERGENCY' : 'APPROVED';
    case 'EXPIRED': return emergency ? 'EMERGENCY_EXPIRED' : 'EXPIRED';
    case 'PENDING': return 'PENDING';
    case 'DECLINED': return 'DECLINED';
    default: return 'REVOKED';
  }
}

export interface GroupedGrants {
  /** Normal requests waiting for the patient's answer. */
  pending: PatientAccessGrant[];
  /** Currently open access (normal approvals AND emergency access), soonest expiry first. */
  active: PatientAccessGrant[];
  /** Everything else: declined, expired, revoked. Newest first. */
  history: PatientAccessGrant[];
}

/**
 * Splits the server's grants for the patient screen. It trusts the server's
 * status but also refuses to call an APPROVED grant "active" once its end
 * time has passed, so a stale page can never show open access that is over.
 */
export function groupPatientGrants(grants: PatientAccessGrant[], now = Date.now()): GroupedGrants {
  const byNewest = (a: PatientAccessGrant, b: PatientAccessGrant) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  const pending: PatientAccessGrant[] = [];
  const active: PatientAccessGrant[] = [];
  const history: PatientAccessGrant[] = [];
  for (const g of [...grants].sort(byNewest)) {
    if (g.status === 'PENDING' && g.grant_type === 'NORMAL') pending.push(g);
    else if (g.status === 'APPROVED' && g.expires_at && new Date(g.expires_at).getTime() > now) active.push(g);
    else history.push(g);
  }
  active.sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime());
  return { pending, active, history };
}
