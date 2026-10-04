from rest_framework import serializers
from apps.admissions.models import Admission, DischargeSummary, DoctorNote, NursingNote


class AdmissionListSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    hospital_name = serializers.CharField(source='hospital.name', read_only=True)

    class Meta:
        model = Admission
        fields = ['id', 'admission_number', 'patient', 'patient_name', 'hospital', 'hospital_name',
                  'status', 'admitted_at', 'discharged_at']
        read_only_fields = fields


class AdmissionCreateSerializer(serializers.Serializer):
    patient = serializers.UUIDField()
    reason = serializers.CharField(required=False, allow_blank=True)
    attending_doctor = serializers.UUIDField(required=False, allow_null=True)


class DoctorNoteSerializer(serializers.ModelSerializer):
    author_username = serializers.CharField(source='author.username', read_only=True)

    class Meta:
        model = DoctorNote
        fields = ['id', 'admission', 'author', 'author_username', 'content', 'created_at']
        read_only_fields = ['id', 'author', 'author_username', 'created_at']


class NursingNoteSerializer(serializers.ModelSerializer):
    author_username = serializers.CharField(source='author.username', read_only=True)

    class Meta:
        model = NursingNote
        fields = ['id', 'admission', 'author', 'author_username', 'content', 'created_at']
        read_only_fields = ['id', 'author', 'author_username', 'created_at']


class DischargeSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = DischargeSummary
        fields = ['id', 'admission', 'content', 'created_by', 'created_at']
        read_only_fields = ['id', 'created_by', 'created_at']


class AdmissionDetailSerializer(AdmissionListSerializer):
    doctor_notes = DoctorNoteSerializer(many=True, read_only=True)
    nursing_notes = NursingNoteSerializer(many=True, read_only=True)

    class Meta(AdmissionListSerializer.Meta):
        fields = AdmissionListSerializer.Meta.fields + ['reason', 'attending_doctor', 'doctor_notes', 'nursing_notes']
