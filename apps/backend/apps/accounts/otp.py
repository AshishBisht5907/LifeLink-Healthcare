"""
OTP provider abstraction.

Section 13 of the spec requires this to be "real and provider-ready" while
never using real SMS credits in a dev/college environment. The pattern:
hashing, expiry, and attempt-limiting are all real and production-shaped.
Only the *delivery* mechanism (actually sending an SMS) is swapped.

Twilio SMS delivery is implemented below. Configure credentials only through
environment variables; never commit secrets. Demo mode remains opt-in via
OTP_DEV_MODE and must be disabled when real SMS delivery is used.
"""
import hashlib
import logging
import random
import base64
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from abc import ABC, abstractmethod

from django.conf import settings

logger = logging.getLogger('lifelink.otp')


def _hash_code(code: str, phone: str) -> str:
    # Simple salted hash; phone acts as a per-user salt component.
    # This is not the primary account credential, so a fast hash with
    # per-record salt + short TTL + attempt limiting is an acceptable
    # trade-off (unlike passwords, which use Django's PBKDF2 hasher).
    return hashlib.sha256(f'{settings.SECRET_KEY}:{phone}:{code}'.encode()).hexdigest()


class OTPProvider(ABC):
    @abstractmethod
    def send(self, phone: str, code: str, purpose: str) -> bool:
        """Send `code` to `phone`. Return True on success."""
        raise NotImplementedError


class MockOTPProvider(OTPProvider):
    """Development/demo provider. Never sends a real SMS.

    IMPORTANT: the raw code is only ever returned to the caller (and, in
    OTP_DEV_MODE, echoed in the API response for demo convenience) — it is
    never written to logs.
    """

    def send(self, phone: str, code: str, purpose: str) -> bool:
        logger.info('otp_dispatch_mock phone_hash=%s purpose=%s', _hash_code('x', phone)[:12], purpose)
        return True


class TwilioSMSProvider(OTPProvider):
    """Send the app-generated one-time code through Twilio Programmable SMS.

    Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER.
    The phone number must be in E.164 format (for example +14155552671).
    """
    def send(self, phone: str, code: str, purpose: str) -> bool:
        sid = getattr(settings, 'TWILIO_ACCOUNT_SID', '')
        token = getattr(settings, 'TWILIO_AUTH_TOKEN', '')
        from_number = getattr(settings, 'TWILIO_FROM_NUMBER', '')
        if not all((sid, token, from_number)):
            raise RuntimeError('Twilio is selected but its credentials/from number are not configured.')
        if not phone.startswith('+') or not phone[1:].isdigit():
            raise ValueError('Real SMS delivery requires a phone number in E.164 format, such as +14155552671.')
        endpoint = f'https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json'
        body = f'Your LifeLink verification code is {code}. It expires in {settings.OTP_TTL_SECONDS // 60} minutes.'
        payload = urlencode({'To': phone, 'From': from_number, 'Body': body}).encode()
        auth = base64.b64encode(f'{sid}:{token}'.encode()).decode()
        request = Request(endpoint, data=payload, headers={
            'Authorization': f'Basic {auth}',
            'Content-Type': 'application/x-www-form-urlencoded',
        }, method='POST')
        try:
            with urlopen(request, timeout=10) as response:
                return 200 <= response.status < 300
        except (HTTPError, URLError, TimeoutError) as exc:
            logger.warning('otp_dispatch_failed provider=twilio error_type=%s', type(exc).__name__)
            raise RuntimeError('SMS provider could not send the verification code. Please try again.') from exc


def get_otp_provider() -> OTPProvider:
    provider_name = getattr(settings, 'OTP_PROVIDER', 'mock').lower()
    if provider_name == 'mock':
        return MockOTPProvider()
    if provider_name == 'twilio':
        return TwilioSMSProvider()
    raise ValueError(f"Unsupported OTP_PROVIDER '{provider_name}'. Use 'mock' or 'twilio'.")


def generate_code() -> str:
    return f'{random.randint(0, 999999):06d}'


def hash_code(code: str, phone: str) -> str:
    return _hash_code(code, phone)
