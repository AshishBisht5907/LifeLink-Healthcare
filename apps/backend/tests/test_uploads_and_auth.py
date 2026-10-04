import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import User
from tests.conftest import auth_client


@pytest.mark.django_db
def test_upload_rejects_disallowed_file_type(management_a, patient):
    client = auth_client(management_a)
    bad_file = SimpleUploadedFile('malware.exe', b'not a real exe', content_type='application/x-msdownload')
    resp = client.post('/api/documents/', {
        'patient': str(patient.id), 'file': bad_file, 'doc_type': 'OTHER',
    }, format='multipart')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_upload_rejects_oversized_file(management_a, patient, settings):
    settings.LIFELINK_MAX_UPLOAD_BYTES = 100  # shrink limit for the test
    client = auth_client(management_a)
    big_file = SimpleUploadedFile('report.pdf', b'x' * 1000, content_type='application/pdf')
    resp = client.post('/api/documents/', {
        'patient': str(patient.id), 'file': big_file, 'doc_type': 'LAB_REPORT',
    }, format='multipart')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_upload_accepts_valid_pdf(management_a, patient, admission):
    # `admission` must exist and be at management_a's hospital — access
    # control (correctly) requires the patient to actually be admitted at
    # this hospital before staff can touch their documents.
    client = auth_client(management_a)
    good_file = SimpleUploadedFile('report.pdf', b'%PDF-1.4 fake pdf content', content_type='application/pdf')
    resp = client.post('/api/documents/', {
        'patient': str(patient.id), 'file': good_file, 'doc_type': 'LAB_REPORT',
    }, format='multipart')
    assert resp.status_code == 201


@pytest.mark.django_db
def test_account_locks_after_repeated_failed_logins(management_a, api_client):
    for _ in range(5):
        resp = api_client.post('/api/auth/staff/login/', {
            'username': 'management_a', 'password': 'WrongPassword!',
        }, format='json')
    management_a.refresh_from_db()
    assert management_a.is_locked()

    # Even the CORRECT password is now refused while locked (section 33).
    resp = api_client.post('/api/auth/staff/login/', {
        'username': 'management_a', 'password': 'TestPass123!',
    }, format='json')
    assert resp.status_code == 423


@pytest.mark.django_db
def test_wrong_password_does_not_leak_which_field_was_wrong(api_client):
    resp = api_client.post('/api/auth/staff/login/', {
        'username': 'no_such_user', 'password': 'whatever',
    }, format='json')
    # This view returns a plain Response (not a raised exception), so it is
    # NOT wrapped by lifelink_exception_handler — it keeps DRF's default
    # {'detail': ...} shape. Both unknown-username and wrong-password cases
    # return the identical generic message, so no username enumeration is
    # possible from the response.
    assert resp.status_code == 401
    assert resp.json()['detail'] == 'Invalid credentials.'
