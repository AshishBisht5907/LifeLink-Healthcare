/**
 * Explains WHY a family member can or cannot open a patient's record.
 * This mirrors the backend rule in user_can_access_patient() for display only:
 * the link must be active, the level must be FULL_REPRESENTATIVE, and the
 * patient's LATEST consent request must be APPROVED. The backend decides; this
 * only tells the person which condition is missing.
 */
import type { FamilyRelationship } from './types';

export type FamilyAccessKind = 'ACTIVE' | 'PAUSED' | 'UPDATES_ONLY' | 'NO_CONSENT' | 'CONSENT_PENDING' | 'CONSENT_DECLINED';

export interface FamilyAccessExplanation { kind: FamilyAccessKind; canViewRecord: boolean; title: string; detail: string }

export function latestConsentStatus(consents: { patient: string; status: string; created_at: string }[], patientId: string): string | null {
  const mine = consents.filter((c) => c.patient === patientId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return mine[0]?.status ?? null;
}

export function explainFamilyAccess(link: Pick<FamilyRelationship, 'is_active' | 'access_level'>, latestConsent: string | null): FamilyAccessExplanation {
  if (!link.is_active) return { kind: 'PAUSED', canViewRecord: false, title: 'Access is paused', detail: 'This link is switched off, so no care information is shared.' };
  if (link.access_level !== 'FULL_REPRESENTATIVE') {
    return { kind: 'UPDATES_ONLY', canViewRecord: false, title: 'Updates only', detail: 'This access level shares updates but does not include opening the patient\u2019s record.' };
  }
  if (latestConsent === 'APPROVED') return { kind: 'ACTIVE', canViewRecord: true, title: 'Access is active', detail: 'The patient\u2019s latest consent is approved, so the record can be opened.' };
  if (latestConsent === 'PENDING') return { kind: 'CONSENT_PENDING', canViewRecord: false, title: 'Waiting for consent', detail: 'The patient\u2019s latest consent request has not been approved yet.' };
  if (latestConsent === 'DECLINED') return { kind: 'CONSENT_DECLINED', canViewRecord: false, title: 'Consent declined', detail: 'The patient\u2019s latest consent request was declined, so the record stays locked.' };
  return { kind: 'NO_CONSENT', canViewRecord: false, title: 'No approved consent', detail: 'Access opens only after the patient has an approved consent on record.' };
}
