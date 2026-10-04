/** What a person may do with a consent request in the UI. The backend still enforces it. */
export type ConsentUiAction = 'APPROVE' | 'DECLINE' | 'ASK_DOCTOR';
export type Role = 'PATIENT' | 'FAMILY' | 'HOSPITAL_STAFF' | 'HOSPITAL_MANAGEMENT' | 'HOSPITAL_ADMIN';

export interface ConsentChoice { action: ConsentUiAction; label: string; variant: 'primary' | 'danger' | 'secondary' }

/**
 * Only the PATIENT is offered decisions here. The backend also lets a full-representative family
 * member decide, but the product rule is that family never answers for the patient, so the UI never offers it.
 */
export function consentChoices(status: string, role: Role): ConsentChoice[] {
  if (role !== 'PATIENT') return [];
  if (status === 'PENDING') return [
    { action: 'APPROVE', label: 'Approve', variant: 'primary' },
    { action: 'DECLINE', label: 'Decline', variant: 'danger' },
    { action: 'ASK_DOCTOR', label: 'Ask doctor first', variant: 'secondary' },
  ];
  if (status === 'APPROVED') return [{ action: 'DECLINE', label: 'Withdraw consent', variant: 'danger' }];
  if (status === 'DECLINED') return [{ action: 'APPROVE', label: 'Approve now', variant: 'primary' }];
  return [];
}

export const CONSENT_CONFIRM: Record<ConsentUiAction, { title: string; body: string; done: string }> = {
  APPROVE: { title: 'Approve this consent?', body: 'You are agreeing to the procedure described. Your most recent consent also decides whether authorised family members can open your record.', done: 'Consent approved' },
  DECLINE: { title: 'Decline or withdraw consent?', body: 'The hospital will see this as declined. Your most recent consent also decides whether authorised family members can open your record, so this will lock it.', done: 'Consent declined' },
  ASK_DOCTOR: { title: 'Ask the doctor first?', body: 'This tells the care team you want to talk before deciding. The consent stays pending.', done: 'Doctor asked to get in touch' },
};

const rank: Record<string, number> = { PENDING: 0, APPROVED: 1, DECLINED: 2 };
/** Pending first (they need an answer), then newest first. */
export function sortConsents<T extends { status: string; created_at: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
