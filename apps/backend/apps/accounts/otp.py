"""
OTP provider abstraction.

Section 13 of the spec requires this to be "real and provider-ready" while
never using real SMS credits in a dev/college environment. The pattern:
hashing, expiry, and attempt-limiting are all real and production-shaped.
Only the *delivery* mechanism (actually sending an SMS) is swapped.

To wire a real provider (e.g. Twilio, MSG91) in production:
  1. Implement a new class below that sends via that provider's API.
  2. Set OTP_PROVIDER=<name> and the provider's credentials in the
     environment (never in code).
  3. Update `get_otp_provider()` to return it.

Nothing else in the codebase needs to change — callers only depend on the
`OTPProvider` interface.
"""
import hashlib
import logging
import random
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


def get_otp_provider() -> OTPProvider:
    provider_name = getattr(settings, 'OTP_PROVIDER', 'mock')
    if provider_name == 'mock':
        return MockOTPProvider()
    # Real providers (Twilio/MSG91/etc.) would be registered here.
    raise NotImplementedError(
        f"OTP provider '{provider_name}' is not wired in this build. "
        "Implement it in apps/accounts/otp.py and register it here."
    )


def generate_code() -> str:
    return f'{random.randint(0, 999999):06d}'


def hash_code(code: str, phone: str) -> str:
    return _hash_code(code, phone)
