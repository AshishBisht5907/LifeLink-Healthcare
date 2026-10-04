import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class Role(models.TextChoices):
    """Coarse-grained role. This alone is NEVER sufficient for authorization —
    every view must also check hospital/department/patient scope. See
    apps/accounts/permissions.py.
    """
    PATIENT = 'PATIENT', 'Patient'
    FAMILY = 'FAMILY', 'Family / Representative'
    HOSPITAL_STAFF = 'HOSPITAL_STAFF', 'Hospital Staff'
    HOSPITAL_MANAGEMENT = 'HOSPITAL_MANAGEMENT', 'Hospital Management / Care Coordination'
    HOSPITAL_ADMIN = 'HOSPITAL_ADMIN', 'Hospital Admin'


class User(AbstractUser):
    """
    Custom user. `role` is a coarse routing hint only — the backend NEVER
    trusts a role claimed by the client (section 11 of spec). It is set once
    at account-provisioning time by a privileged workflow (Hospital Admin for
    staff, OTP/identity verification for patient/family) and is read-only
    from the API surface exposed to ordinary users.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=32, choices=Role.choices)
    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)

    # Brute-force protection (section 33)
    failed_login_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    # MFA — real TOTP (RFC 6238) for staff/management/admin accounts.
    mfa_enabled = models.BooleanField(default=False)
    mfa_secret = models.CharField(max_length=64, blank=True)  # base32 secret, only ever used server-side

    must_change_password = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def is_locked(self) -> bool:
        return bool(self.locked_until and self.locked_until > timezone.now())

    def register_failed_login(self):
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= 5:
            self.locked_until = timezone.now() + timezone.timedelta(minutes=15)
        self.save(update_fields=['failed_login_attempts', 'locked_until'])

    def register_successful_login(self):
        self.failed_login_attempts = 0
        self.locked_until = None
        self.save(update_fields=['failed_login_attempts', 'locked_until'])

    def __str__(self):
        return f'{self.username or self.phone} ({self.role})'


class OTPRequest(models.Model):
    """Real OTP lifecycle: hashed code, expiry, attempt limiting.
    The SMS *delivery* is behind an OTPProvider abstraction (see otp.py) —
    in this environment only a mock/dev provider is wired. Production
    credentials/provider must come from environment variables and no code
    ever logs or exposes the raw OTP outside the dev-mode response.
    """
    PURPOSE_CHOICES = [
        ('LOGIN', 'Login'),
        ('REGISTER', 'Registration'),
        ('CLAIM_PROFILE', 'Claim Unclaimed Profile'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=20)
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES)
    code_hash = models.CharField(max_length=128)
    attempts = models.PositiveIntegerField(default=0)
    verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        indexes = [models.Index(fields=['phone', 'purpose', 'verified'])]

    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at


class IdentityVerification(models.Model):
    """Records an identity verification event. Aadhaar is MOCK ONLY in this
    build — see apps/accounts/identity.py. No real Aadhaar numbers are ever
    stored; only a masked/reference token from the (mock) provider.
    """
    METHOD_CHOICES = [
        ('MOBILE_OTP', 'Mobile OTP'),
        ('AADHAAR_MOCK', 'Aadhaar (Mock/Demo Provider)'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('VERIFIED', 'Verified'),
        ('FAILED', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='identity_verifications')
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    provider_reference = models.CharField(max_length=128, blank=True)  # opaque mock token only
    masked_identifier = models.CharField(max_length=32, blank=True)     # e.g. "XXXX-XXXX-1234"
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
