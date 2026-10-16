/**
 * Explain family access based on the relationship the patient controls.
 * Activating a FULL_REPRESENTATIVE link is the patient's data-sharing approval.
 * Procedure consent is a separate workflow and must not unlock/lock the whole profile.
 */
import type { FamilyRelationship } from './types';

export type FamilyAccessKind = 'ACTIVE' | 'PAUSED' | 'UPDATES_ONLY';

export interface FamilyAccessExplanation { kind: FamilyAccessKind; canViewRecord: boolean; title: string; detail: string }

export function explainFamilyAccess(link: Pick<FamilyRelationship, 'is_active' | 'access_level'>): FamilyAccessExplanation {
  if (!link.is_active) {
    return { kind: 'PAUSED', canViewRecord: false, title: 'Approval needed', detail: 'The patient has not activated this family link yet.' };
  }
  if (link.access_level !== 'FULL_REPRESENTATIVE') {
    return { kind: 'UPDATES_ONLY', canViewRecord: false, title: 'Updates only', detail: 'This access level can see the patient-visible status feed, but cannot open the full clinical record.' };
  }
  return { kind: 'ACTIVE', canViewRecord: true, title: 'Access is active', detail: 'The patient has activated this full-representative link, so the clinical record can be opened.' };
}
