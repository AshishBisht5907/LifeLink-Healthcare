/** What a person may do with a consent request in the UI. The backend still enforces it. */
export type ConsentUiAction = 'APPROVE' | 'DECLINE' | 'ASK_DOCTOR';
export type Role = 'PATIENT' | 'FAMILY' | 'HOSPITAL_STAFF' | 'HOSPITAL_MANAGEMENT' | 'HOSPITAL_ADMIN';

export interface ConsentChoice { action: ConsentUiAction; label: string; variant: 'primary' | 'danger' | 'secondary' }

/**
 * Only the patient on the consent request may decide it. The backend enforces
 * this independently of the UI.
 */
export function consentChoices(status: string, role: Role): ConsentChoice[] {
  if (role !== 'PATIENT') return [];
  if (status === 'PENDING') return [
    { action: 'APPROVE', label: 'Approve', variant: 'primary' },
    { action: 'DECLINE', label: 'Decline', variant: 'danger' },
    { action: 'ASK_DOCTOR', label: 'Ask doctor first', variant: 'secondary' },
  ];
  if (status === 'APPROVED') return [{ action: 'DECLINE', label: 'Withdraw procedure consent', variant: 'danger' }];
  if (status === 'DECLINED') return [{ action: 'APPROVE', label: 'Approve now', variant: 'primary' }];
  return [];
}

export const CONSENT_CONFIRM: Record<ConsentUiAction, { title: string; body: string; done: string }> = {
  APPROVE: { title: 'Approve this procedure consent?', body: 'You are agreeing to the procedure described. This decision does not change who can view your record; manage family access separately from Family access.', done: 'Procedure consent approved' },
  DECLINE: { title: 'Decline or withdraw procedure consent?', body: 'The hospital will see this procedure consent as declined. This does not change family access to your record.', done: 'Procedure consent declined' },
  ASK_DOCTOR: { title: 'Ask the doctor first?', body: 'This tells the care team you want to talk before deciding. The consent stays pending.', done: 'Doctor asked to get in touch' },
};

const rank: Record<string, number> = { PENDING: 0, APPROVED: 1, DECLINED: 2 };
/** Pending first (they need an answer), then newest first. */
export function sortConsents<T extends { status: string; created_at: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
