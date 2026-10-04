"""
Transfer checklist item registry (section 17).

Each item has a designated OWNER side:
  FROM   — only the sending hospital's staff may mark it
  TO     — only the receiving hospital's staff may mark it
  EITHER — either side may mark it (shared coordination items)

This exists specifically so a checklist item can never be "falsely marked
complete by unauthorized staff" — ownership is checked server-side on every
write, not just suggested by the UI.
"""
from django.utils import timezone

CHECKLIST_ITEMS = {
    'patient_identity_confirmed': 'EITHER',
    'referral_note_attached': 'FROM',
    'reports_attached': 'FROM',
    'medicines_confirmed': 'FROM',
    'allergies_confirmed': 'FROM',
    'discharge_documentation_attached': 'FROM',
    'consent_attached': 'FROM',
    'insurance_confirmed': 'EITHER',
    'ambulance_arranged': 'FROM',
    'bed_ready': 'TO',
    'receiving_doctor_confirmed': 'TO',
}


class ChecklistError(Exception):
    pass


def owner_hospital_id(item_key, referral):
    owner = CHECKLIST_ITEMS.get(item_key)
    if owner == 'FROM':
        return {referral.from_hospital_id}
    if owner == 'TO':
        return {referral.to_hospital_id}
    if owner == 'EITHER':
        return {referral.from_hospital_id, referral.to_hospital_id}
    return set()


def apply_checklist_updates(transfer, referral, updates: dict, actor):
    """
    Validates every requested item BEFORE writing anything (all-or-nothing),
    so a request that mixes one authorized item with one unauthorized item
    never partially applies. Returns the updated checklist dict.
    """
    unknown = [k for k in updates if k not in CHECKLIST_ITEMS]
    if unknown:
        raise ChecklistError(f'Unknown checklist item(s): {", ".join(unknown)}')

    staff_hospital_id = getattr(getattr(actor, 'staff_profile', None), 'hospital_id', None)
    unauthorized = [
        k for k in updates
        if staff_hospital_id not in owner_hospital_id(k, referral)
    ]
    if unauthorized:
        raise ChecklistError(
            f'You are not authorised to update: {", ".join(unauthorized)}. '
            'Each checklist item can only be set by its designated hospital side.'
        )

    checklist = dict(transfer.checklist or {})
    now = timezone.now().isoformat()
    for key, done in updates.items():
        checklist[key] = {
            'done': bool(done),
            'set_by_user_id': str(actor.id),
            'set_by_hospital_id': str(staff_hospital_id),
            'at': now,
        }
    return checklist
