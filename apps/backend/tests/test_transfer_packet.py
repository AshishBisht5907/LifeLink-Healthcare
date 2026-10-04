import pytest

from apps.referrals.models import Referral
from apps.referrals.packet import build_transfer_packet


@pytest.mark.django_db
def test_transfer_packet_scopes_source_admission_to_authorized_hospital(
    patient, admission, management_a, management_b, hospital_b,
):
    referral = Referral.objects.create(
        patient=patient,
        from_hospital=admission.hospital,
        from_admission=admission,
        to_hospital=hospital_b,
        required_department_type='GENERAL',
        priority='HIGH',
        reason='Specialist transfer required',
        current_condition_summary='Stable',
        created_by=management_a,
    )

    source_packet = build_transfer_packet(referral, management_a)
    receiving_packet = build_transfer_packet(referral, management_b)

    assert source_packet['source_admission']['id'] == str(admission.id)
    assert source_packet['requests'] == []
    assert receiving_packet['source_admission'] is None
    assert receiving_packet['patient']['access_limited'] is True
    assert receiving_packet['clinical_context']['ai_summary'] is None