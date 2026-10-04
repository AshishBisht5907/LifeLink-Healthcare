from rest_framework import serializers
from apps.hospitals.models import Department, Hospital, HospitalCapacity, StaffProfile, StaffRole


class HospitalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = ['id', 'name', 'code', 'address', 'city', 'is_active']
        read_only_fields = ['id']


class DepartmentSerializer(serializers.ModelSerializer):
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)

    class Meta:
        model = Department
        fields = ['id', 'hospital', 'hospital_name', 'name', 'department_type', 'is_active']
        read_only_fields = ['id']


class StaffProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True, default=None)

    class Meta:
        model = StaffProfile
        fields = ['id', 'user', 'username', 'hospital', 'hospital_name', 'department',
                  'department_name', 'staff_role', 'employee_id', 'job_title', 'is_active']
        read_only_fields = ['id', 'hospital']


class ProvisionStaffSerializer(serializers.Serializer):
    """Section 12 — Hospital Admin provisions a brand-new staff account in
    one step: identity + hospital(implicit) + department + role."""
    username = serializers.CharField(max_length=150)
    initial_password = serializers.CharField(min_length=10, write_only=True)
    department = serializers.UUIDField(required=False, allow_null=True)
    staff_role = serializers.ChoiceField(choices=StaffRole.choices)
    employee_id = serializers.CharField(max_length=40)
    job_title = serializers.CharField(max_length=100, required=False, allow_blank=True)


class HospitalCapacitySerializer(serializers.ModelSerializer):
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)

    class Meta:
        model = HospitalCapacity
        fields = ['id', 'hospital', 'hospital_name', 'resource_type', 'total', 'available', 'updated_at']
        read_only_fields = ['id', 'updated_at']
