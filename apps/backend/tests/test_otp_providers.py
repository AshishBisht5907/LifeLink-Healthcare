import base64
from urllib.parse import parse_qs

import pytest
from django.test import override_settings

from apps.accounts.otp import TwilioSMSProvider


class FakeResponse:
    status = 201
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False


def test_twilio_provider_posts_message_without_logging_code(monkeypatch, settings):
    settings.TWILIO_ACCOUNT_SID = 'ACtest'
    settings.TWILIO_AUTH_TOKEN = 'test-token'
    settings.TWILIO_FROM_NUMBER = '+15550001111'
    captured = {}

    def fake_urlopen(request, timeout):
        captured['url'] = request.full_url
        captured['authorization'] = request.get_header('Authorization')
        captured['timeout'] = timeout
        captured['payload'] = parse_qs(request.data.decode())
        return FakeResponse()

    monkeypatch.setattr('apps.accounts.otp.urlopen', fake_urlopen)
    assert TwilioSMSProvider().send('+15550002222', '123456', 'LOGIN') is True
    assert captured['url'].endswith('/Accounts/ACtest/Messages.json')
    assert captured['timeout'] == 10
    assert captured['payload']['To'] == ['+15550002222']
    assert captured['payload']['From'] == ['+15550001111']
    assert '123456' in captured['payload']['Body'][0]
    expected = base64.b64encode(b'ACtest:test-token').decode()
    assert captured['authorization'] == f'Basic {expected}'


def test_twilio_provider_rejects_non_e164_phone(settings):
    settings.TWILIO_ACCOUNT_SID = 'ACtest'
    settings.TWILIO_AUTH_TOKEN = 'test-token'
    settings.TWILIO_FROM_NUMBER = '+15550001111'
    with pytest.raises(ValueError, match='E.164'):
        TwilioSMSProvider().send('9876500001', '123456', 'LOGIN')


@pytest.mark.django_db
@override_settings(OTP_PROVIDER='twilio', OTP_DEV_MODE=True)
def test_sms_delivery_failure_returns_gateway_error_and_never_echoes_otp(api_client, monkeypatch):
    class BrokenProvider:
        def send(self, *args):
            raise RuntimeError('SMS provider could not send the verification code. Please try again.')

    monkeypatch.setattr('apps.accounts.views.get_otp_provider', lambda: BrokenProvider())
    response = api_client.post('/api/auth/otp/request/', {
        'phone': '+15550003333',
        'purpose': 'REGISTER',
    }, format='json')
    assert response.status_code == 502
    assert 'dev_otp' not in response.json()
    assert response.json()['detail'] == 'SMS provider could not send the verification code. Please try again.'


@pytest.mark.django_db
@override_settings(OTP_PROVIDER='twilio', OTP_DEV_MODE=True, DEBUG=True)
def test_real_provider_never_echoes_otp_even_if_dev_flag_was_misconfigured(api_client, monkeypatch):
    class SuccessfulProvider:
        def send(self, *args):
            return True

    monkeypatch.setattr('apps.accounts.views.get_otp_provider', lambda: SuccessfulProvider())
    response = api_client.post('/api/auth/otp/request/', {
        'phone': '+15550004444',
        'purpose': 'REGISTER',
    }, format='json')
    assert response.status_code == 200
    assert 'dev_otp' not in response.json()
