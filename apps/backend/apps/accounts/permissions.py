"""
Shared, reusable permission classes.

Golden rule enforced everywhere in this codebase: the frontend's chosen
"role screen" or any client-supplied role/hospital/department value is
NEVER trusted. Every permission check here re-derives the truth from the
authenticated user's DB-backed role/StaffProfile/FamilyRelationship.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS

from apps.accounts.models import Role


def get_staff_profile(user):
    """Returns the StaffProfile for a user, or None. Avoids circular import
    by importing lazily."""
    from apps.hospitals.models import StaffProfile
    try:
        return StaffProfile.objects.select_related('hospital', 'department').get(user=user)
    except StaffProfile.DoesNotExist:
        return None


class IsRole(BasePermission):
    """Factory-style base: subclass and set `allowed_roles`."""
    allowed_roles = ()

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in self.allowed_roles
        )


class IsHospitalAdmin(IsRole):
    allowed_roles = (Role.HOSPITAL_ADMIN,)


class IsHospitalManagement(IsRole):
    allowed_roles = (Role.HOSPITAL_MANAGEMENT,)


class IsHospitalStaff(IsRole):
    allowed_roles = (Role.HOSPITAL_STAFF,)


class IsStaffOrManagementOrAdmin(IsRole):
    allowed_roles = (Role.HOSPITAL_STAFF, Role.HOSPITAL_MANAGEMENT, Role.HOSPITAL_ADMIN)


class IsPatientOrFamily(IsRole):
    allowed_roles = (Role.PATIENT, Role.FAMILY)


class BelongsToSameHospital(BasePermission):
    """Object-level check: the requesting staff user's hospital must match
    the object's hospital (directly, or via .hospital / .admission.hospital).
    This is what stops Hospital A staff from touching Hospital B's records.
    """

    def has_object_permission(self, request, view, obj):
        staff_profile = get_staff_profile(request.user)
        if not staff_profile:
            return False
        obj_hospital = getattr(obj, 'hospital', None)
        if obj_hospital is None and hasattr(obj, 'admission'):
            obj_hospital = obj.admission.hospital
        if obj_hospital is None:
            return False
        return obj_hospital_id_matches(staff_profile.hospital_id, obj_hospital)


def obj_hospital_id_matches(staff_hospital_id, obj_hospital):
    return str(staff_hospital_id) == str(obj_hospital.id)


class DepartmentScoped(BasePermission):
    """Object-level check: staff can only act on requests routed to their
    own department (e.g. Radiology staff cannot complete a Lab request)."""

    def has_object_permission(self, request, view, obj):
        staff_profile = get_staff_profile(request.user)
        if not staff_profile or not staff_profile.department_id:
            return False
        target_dept = getattr(obj, 'target_department', None)
        if target_dept is None:
            return False
        return str(target_dept.id) == str(staff_profile.department_id)


class IsAuthorizedFamilyMember(BasePermission):
    """Family user must have an active FamilyRelationship to the patient in
    question, with sufficient access_level for the action (checked further
    per-view where the action is sensitive, e.g. consent approval)."""

    def has_object_permission(self, request, view, obj):
        from apps.patients.models import FamilyRelationship
        patient = getattr(obj, 'patient', obj)
        return FamilyRelationship.objects.filter(
            patient=patient, family_user=request.user, is_active=True
        ).exists()
