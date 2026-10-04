"""Uploaded documents must only be reachable through the authorised, signed download.

Found during browser testing: with DEBUG=True the URLconf mounted MEDIA_ROOT, so any
uploaded file was downloadable with no login at /media/<path>, bypassing the signed-URL
check (and the documents API returns that raw path in `file`). pytest runs with
DEBUG=False, so this test reloads the URLconf with DEBUG=True to exercise the dev path.
"""
import importlib

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import Resolver404, clear_url_caches, resolve

from tests.conftest import auth_client

pytestmark = pytest.mark.django_db

URLCONF = 'config.urls'


def _reload_urls():
    import config.urls
    importlib.reload(config.urls)
    clear_url_caches()


@pytest.fixture
def debug_urlconf():
    with override_settings(DEBUG=True):
        _reload_urls()
        yield
    _reload_urls()  # restore the normal (DEBUG=False) routes for every other test


def test_media_files_are_never_served_by_the_dev_urlconf(debug_urlconf):
    with pytest.raises(Resolver404):
        resolve('/media/patients/00000000-0000-0000-0000-000000000000/documents/secret.pdf')


def test_uploaded_document_is_not_downloadable_without_login(debug_urlconf, client, patient_user, patient):
    c = auth_client(patient_user)
    up = c.post('/api/documents/', {'patient': str(patient.id), 'doc_type': 'OTHER',
                                    'file': SimpleUploadedFile('note.pdf', b'%PDF-1.4 secret', content_type='application/pdf')}, format='multipart')
    assert up.status_code == 201, up.content
    raw_path = up.json()['file']
    path = '/media/' + raw_path.split('/media/')[-1]
    assert client.get(path).status_code == 404            # anonymous: not served
    assert c.get(path).status_code == 404                 # even the owner cannot fetch the raw path


def test_signed_download_still_works_for_an_authorised_user(patient_user, patient):
    c = auth_client(patient_user)
    up = c.post('/api/documents/', {'patient': str(patient.id), 'doc_type': 'OTHER',
                                    'file': SimpleUploadedFile('note.pdf', b'%PDF-1.4 secret', content_type='application/pdf')}, format='multipart')
    doc_id = up.json()['id']
    link = c.get(f'/api/documents/{doc_id}/signed_url/')
    assert link.status_code == 200
    got = c.get(link.json()['download_path'])
    assert got.status_code == 200
    assert b''.join(got.streaming_content).startswith(b'%PDF-1.4 secret')


def test_signed_download_link_is_refused_to_unauthorised_users(management_b, patient_user, patient):
    up = auth_client(patient_user).post('/api/documents/', {'patient': str(patient.id), 'doc_type': 'OTHER',
         'file': SimpleUploadedFile('n.pdf', b'%PDF-1.4 x', content_type='application/pdf')}, format='multipart')
    assert auth_client(management_b).get(f"/api/documents/{up.json()['id']}/signed_url/").status_code in (403, 404)
