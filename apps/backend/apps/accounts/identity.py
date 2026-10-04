"""
Identity verification provider abstraction.

HARD RULE (section 13 / 73 of spec): this build NEVER calls real UIDAI/Aadhaar
APIs and NEVER stores real Aadhaar numbers. `MockAadhaarProvider` is a seeded,
deterministic demo provider — it looks up a pre-seeded demo record and
returns a verification result, exactly like a real provider interface would,
so a real provider can be dropped in later without touching calling code.
"""
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class VerificationResult:
    success: bool
    masked_identifier: str = ''
    full_name: str = ''
    provider_reference: str = ''
    error: str = ''


class IdentityVerificationProvider(ABC):
    @abstractmethod
    def verify(self, identifier: str, otp_or_token: str) -> VerificationResult:
        raise NotImplementedError


# Seeded demo "Aadhaar" records. In a real system this table would not
# exist — a government API would answer. Here it exists purely so the demo
# has deterministic, reproducible identities to verify against.
_DEMO_AADHAAR_DB = {
    '999911112222': {'name': 'Rahul Sharma', 'otp': '111111'},
    '999922223333': {'name': 'Anita Verma', 'otp': '222222'},
    '999933334444': {'name': 'Sunil Gupta', 'otp': '333333'},
}


class MockAadhaarProvider(IdentityVerificationProvider):
    """Demo-only provider. Clearly labelled everywhere it is surfaced in the
    UI/API responses as 'Mock / Demo Identity Verification'."""

    def verify(self, identifier: str, otp_or_token: str) -> VerificationResult:
        record = _DEMO_AADHAAR_DB.get(identifier)
        if not record:
            return VerificationResult(success=False, error='No matching demo identity record found.')
        if record['otp'] != otp_or_token:
            return VerificationResult(success=False, error='Incorrect demo verification code.')
        return VerificationResult(
            success=True,
            masked_identifier=f'XXXX-XXXX-{identifier[-4:]}',
            full_name=record['name'],
            provider_reference=str(uuid.uuid4()),
        )


def get_identity_provider() -> IdentityVerificationProvider:
    # Only the mock provider is implemented in this build. A real,
    # authorised provider integration would be registered here behind the
    # same interface.
    return MockAadhaarProvider()
