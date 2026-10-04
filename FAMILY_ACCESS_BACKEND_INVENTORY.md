# Existing Backend Family Access APIs - Inventory

## What Already Exists

### 1. FamilyRelationship Model
```python
class FamilyRelationship(models.Model):
    id: UUID
    patient: ForeignKey(PatientProfile)
    family_user: ForeignKey(User)
    relationship_type: CharField  # e.g. "Spouse", "Son"
    access_level: AccessLevel  # FULL_REPRESENTATIVE, UPDATES_ONLY, LIMITED
    is_active: Boolean
    created_at: DateTime
```

**Access Levels:**
- `FULL_REPRESENTATIVE` - Can see full patient data
- `UPDATES_ONLY` - Can see status updates only
- `LIMITED` - Restricted access

### 2. FamilyRelationshipViewSet (REST API)
**Base URL:** `/api/family-links/`

**Endpoints:**
- `GET /api/family-links/` - List family relationships (filtered by user)
- `GET /api/family-links/?patient={id}` - Get family members for a patient (staff/patient only)
- `POST /api/family-links/` - Create new family relationship
- `PATCH /api/family-links/{id}/` - Update family relationship
- `DELETE /api/family-links/{id}/` - Remove family relationship

**Permissions:**
- PATIENT can view their own family links
- FAMILY user can see relationships where they are family_user
- STAFF can create/manage family links only if they can access the patient

### 3. ConsentRequest/ConsentAction Models
```python
class ConsentRequest(models.Model):
    status: PENDING | APPROVED | DECLINED
    patient, admission, procedure_description, risk_information
    requested_by, created_at, resolved_at

class ConsentAction(models.Model):
    # Immutable audit record of decision
    consent_request, actor, actor_role_at_time, action, ip_address, created_at
```

### 4. Family Access Control Logic (access.py)
```python
def user_can_access_patient(user, patient):
    if user.role == 'FAMILY':
        family_link = patient.family_links.filter(
            family_user=user, 
            is_active=True
        ).first()
        if not family_link or family_link.access_level != FULL_REPRESENTATIVE:
            return False
        # MUST have approved consent to see patient
        latest_consent = patient.consent_requests.order_by('-created_at').first()
        return bool(latest_consent and latest_consent.status == APPROVED)
```

**KEY INSIGHT:** Family access requires:
1. Active FamilyRelationship with FULL_REPRESENTATIVE access
2. Patient has approved ConsentRequest

### 5. FamilyRelationshipSerializer
```python
class FamilyRelationshipSerializer(ModelSerializer):
    family_username: read_only
    fields: id, patient, family_user, family_username, relationship_type,
            access_level, is_active, created_at
    read_only_fields: id, created_at
```

---

## Existing Consent API
**Base URL:** `/api/consents/`

**Endpoints:**
- `GET /api/consents/` - List consents
- `GET /api/consents/{id}/` - Get consent details
- `POST /api/consents/` - Create new consent request
- `POST /api/consents/{id}/decide/` - Patient decides on consent
  - Body: `{ action: 'APPROVE' | 'DECLINE' | 'ASK_DOCTOR' }`

---

## Existing Notifications
**In app/notifications/models.py:**
- `Notification` - In-app notifications to users
- `FamilyCommunicationLog` - Record of what was told to family, by whom, when

---

## What DOES NOT Exist (That I Tried to Create)

❌ `POST /patients/{id}/send_welcome_sms/` - Doesn't exist
❌ Automatic SMS sending to new family members - Not implemented
❌ Family invitation flow with SMS link - Not implemented

---

## Correct Flow for Family Access (Based on Existing Backend)

### Staff-Initiated Flow (if supported):
1. Staff (or patient) goes to family management
2. Staff provides family user's ID or phone
3. If family user doesn't exist, they must register first via patient portal
4. Staff creates FamilyRelationship via `POST /api/family-links/`
   - Sets relationship_type, access_level
   - is_active=True by default
5. Patient receives notification (if implemented)
6. Patient must approve via Consent workflow
7. Once consent APPROVED, family can log in and see patient

### Patient-Initiated Flow:
1. Patient logs in
2. Patient sees "Manage Family Access" section
3. Patient can:
   - View existing family links
   - Add new family member (provide their user ID)
   - Approve/decline consent for families
   - Revoke access (set is_active=False)
4. Family sees linked patient after consent approved

---

## Implementation Strategy

**Frontend MUST:**
1. Use existing `/api/family-links/` endpoints (no new endpoints)
2. Use existing `/api/consents/` for consent decisions
3. NOT invent SMS sending
4. NOT mock localStorage for family data
5. Display real data from backend

**UI Components Needed:**
1. Family Links List - Show existing family members, their access level, status
2. Add Family Member - Form to create new relationship (must provide family_user ID)
3. Family Access Requests - Show pending consents that need patient approval
4. Approve/Decline Consent - Button to approve family access
5. Revoke Access - Button to set is_active=False

**Access Control:**
- Patient sees only their own family links + consent requests
- Family sees only patients they're linked to (where consent approved)
- Staff cannot manage family access unless backend supports it

---

## Next Steps

1. Remove FamilyAccessManager localStorage mocking
2. Rewrite to use real `/api/family-links/` endpoints
3. Create patient-facing family management UI
4. Create consent approval UI
5. Verify end-to-end flow works
