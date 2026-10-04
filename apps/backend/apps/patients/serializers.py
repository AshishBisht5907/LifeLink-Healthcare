from rest_framework import serializers

from apps.patients.models import (
    Allergy, EmergencyContact, FamilyRelationship, MedicalHistoryEntry,
    Medication, PatientProfile,
)


class PatientProfileListSerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientProfile
        fields = ['id', 'lifelink_patient_id', 'full_name', 'date_of_birth', 'gender',
                  'phone', 'is_unclaimed']
        read_only_fields = fields


class AllergySerializer(serializers.ModelSerializer):
    class Meta:
        model = Allergy
        fields = ['id', 'patient', 'substance', 'severity', 'source', 'verification_status', 'recorded_at']
        # source and verification_status are always set server-side
        # (perform_create / verify() / reject()) — never trusted from the
        # client, so a patient can't submit "source": "HOSPITAL_ENTERED"
        # or "verification_status": "VERIFIED" themselves.
        read_only_fields = ['id', 'source', 'verification_status', 'recorded_at']


class MedicalHistoryEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicalHistoryEntry
        fields = ['id', 'patient', 'event_type', 'description', 'event_date', 'source',
                  'verification_status', 'originating_hospital', 'originating_admission', 'created_at']
        read_only_fields = ['id', 'created_at']


class MedicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medication
        fields = ['id', 'patient', 'admission', 'name', 'dosage', 'frequency', 'start_date',
                  'stop_date', 'prescribing_doctor', 'status', 'source', 'created_at']
        read_only_fields = ['id', 'created_at']


class EmergencyContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyContact
        fields = ['id', 'patient', 'name', 'relationship', 'phone', 'is_primary']
        read_only_fields = ['id']


class FamilyRelationshipSerializer(serializers.ModelSerializer):
    family_username = serializers.CharField(source='family_user.username', read_only=True)

    class Meta:
        model = FamilyRelationship
        fields = ['id', 'patient', 'family_user', 'family_username', 'relationship_type',
                  'access_level', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_family_user(self, user):
        # Only a real, active FAMILY account may be linked. Staff, management,
        # admin and patient accounts are refused. The message is deliberately
        # generic so it does not reveal what kind of account an id belongs to.
        if user.role != 'FAMILY' or not user.is_active:
            raise serializers.ValidationError('This account cannot be linked as a family member.')
        return user

    def validate(self, attrs):
        # A link belongs to ONE patient for life. Moving it would hand its
        # access level to a different patient, so the patient is immutable.
        if self.instance is not None and 'patient' in attrs and attrs['patient'].pk != self.instance.patient_id:
            raise serializers.ValidationError({'patient': 'The patient of an existing family link cannot be changed.'})
        return attrs


class PatientProfileDetailSerializer(serializers.ModelSerializer):
    allergies = AllergySerializer(many=True, read_only=True)
    history_entries = MedicalHistoryEntrySerializer(many=True, read_only=True)
    medications = MedicationSerializer(many=True, read_only=True)
    emergency_contacts = EmergencyContactSerializer(many=True, read_only=True)

    class Meta:
        model = PatientProfile
        fields = ['id', 'lifelink_patient_id', 'full_name', 'date_of_birth', 'gender', 'phone',
                  'blood_group', 'blood_group_verification', 'is_unclaimed',
                  'allergies', 'history_entries', 'medications', 'emergency_contacts',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'lifelink_patient_id', 'blood_group', 'blood_group_verification',
                             'is_unclaimed', 'created_at', 'updated_at']


class CreateUnclaimedPatientSerializer(serializers.Serializer):
    """Section 14 — hospital can register a patient who has never used
    LifeLink. Minimal required fields to start treatment immediately."""
    full_name = serializers.CharField(max_length=150)
    date_of_birth = serializers.DateField(required=False)
    gender = serializers.ChoiceField(choices=PatientProfile.GENDER_CHOICES, required=False, default='U')
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)


class ClaimPatientProfileSerializer(serializers.Serializer):
    lifelink_patient_id = serializers.CharField(max_length=20)
