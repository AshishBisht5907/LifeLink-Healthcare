from apps.audit.middleware import get_current_request, get_client_ip
from apps.audit.models import AuditLog


def log_action(action, actor=None, result='SUCCESS', hospital_id=None, patient_id=None,
                admission_id=None, target_description='', context=None):
    """Single entry point for writing audit records. Call this from every
    view/service that touches sensitive data or changes state — never write
    directly to AuditLog elsewhere, so the shape stays consistent.
    """
    request = get_current_request()
    if actor is None and request is not None and request.user.is_authenticated:
        actor = request.user

    AuditLog.objects.create(
        actor=actor,
        actor_role=getattr(actor, 'role', ''),
        action=action,
        result=result,
        hospital_id=hospital_id,
        patient_id=patient_id,
        admission_id=admission_id,
        target_description=target_description,
        context=context or {},
        ip_address=get_client_ip(request) if request else None,
        user_agent=(request.META.get('HTTP_USER_AGENT', '')[:255] if request else ''),
    )
