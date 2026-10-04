from rest_framework import serializers

from apps.accounts.models import User
from apps.accounts.permissions import get_staff_profile


class MeSerializer(serializers.ModelSerializer):
    staff_profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'phone', 'email', 'role', 'mfa_enabled', 'staff_profile']
        read_only_fields = fields  # role is NEVER writable via this API

    def get_staff_profile(self, obj):
        sp = get_staff_profile(obj)
        if not sp:
            return None
        return {
            'hospital': sp.hospital.name,
            'hospital_id': str(sp.hospital_id),
            'department': sp.department.name if sp.department else None,
            'department_type': sp.department.department_type if sp.department else None,
            'job_title': sp.job_title,
            'employee_id': sp.employee_id,
        }


class OTPRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    purpose = serializers.ChoiceField(choices=['LOGIN', 'REGISTER', 'CLAIM_PROFILE'])


class OTPVerifySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    purpose = serializers.ChoiceField(choices=['LOGIN', 'REGISTER', 'CLAIM_PROFILE'])
    code = serializers.CharField(max_length=6)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    # Extended registration fields
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.ChoiceField(choices=['M', 'F', 'O', 'U'], required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(max_length=500, required=False, allow_blank=True)


class StaffLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    mfa_code = serializers.CharField(required=False, allow_blank=True)


class AadhaarMockVerifySerializer(serializers.Serializer):
    aadhaar_number = serializers.CharField(max_length=12, min_length=12)
    demo_otp = serializers.CharField(max_length=10)
