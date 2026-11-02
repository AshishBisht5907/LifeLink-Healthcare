/**
 * Explain family access based on the relationship the patient controls.
 * Activating a FULL_REPRESENTATIVE link is the patient's data-sharing approval.
 * Procedure consent is a separate workflow and must not unlock/lock the whole profile.
 */
import type { FamilyRelationship } from './types';

export type FamilyAccessKind = 'ACTIVE' | 'PAUSED' | 'UPDATES_ONLY' | 'LIMITED';

export interface FamilyAccessExplanation { kind: FamilyAccessKind; canViewRecord: boolean; title: string; detail: string }

export function explainFamilyAccess(link: Pick<FamilyRelationship, 'is_active' | 'access_level'>): FamilyAccessExplanation {
  if (!link.is_active) {
    return { kind: 'PAUSED', canViewRecord: false, title: 'Access is inactive', detail: 'This family link is inactive, so patient information is unavailable until the patient activates it.' };
  }
  if (link.access_level === 'UPDATES_ONLY') {
    return { kind: 'UPDATES_ONLY', canViewRecord: false, title: 'Updates only', detail: 'This access level can see the patient-visible status feed, but cannot open the full clinical record.' };
  }
  if (link.access_level === 'LIMITED') {
    return { kind: 'LIMITED', canViewRecord: false, title: 'No access configured', detail: 'LIMITED has no permissions defined. It cannot open the clinical record or view the patient-visible status feed.' };
  }
  return { kind: 'ACTIVE', canViewRecord: true, title: 'Access is active', detail: 'The patient has activated this full-representative link, so the clinical record can be opened.' };
}
