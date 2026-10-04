'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { patientsApi, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import type { PatientListItem } from '@/lib/types';

/** The only fields registration needs from a matching patient. */
type PatientMatch = Pick<PatientListItem, 'id' | 'lifelink_patient_id' | 'full_name'>;
import { Card, CardHeader, Button, Input, Select, Field } from '@/components/ui/Primitives';
import { DateInput } from '@/components/ui/DateInput';
import { validateRequired, validatePhone, validateDOB, validateGender } from '@/lib/validation';

export function NewPatientView({ basePath }: { basePath: string }) {
  const router = useRouter();
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('U');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const [existingPatient, setExistingPatient] = useState<PatientMatch | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [createdPatient, setCreatedPatient] = useState<PatientListItem | null>(null);

  async function checkExistingPatient() {
    const phoneToCheck = phone.trim();
    if (!phoneToCheck) {
      setMessage('Enter a phone number to check whether the patient already exists.');
      setMessageType('info');
      return;
    }

    setCheckingExisting(true);
    setMessage('');
    try {
      const matches = await patientsApi.search({ phone: phoneToCheck });
      if (matches.length > 0) {
        const match = matches[0];
        setExistingPatient(match);
        setMessage(`Existing patient found: ${match.full_name} (${match.lifelink_patient_id})`);
        setMessageType('info');
        toast.show('info', 'Patient found', `${match.full_name} already exists in the system.`);
      } else {
        setExistingPatient(null);
        setMessage('No matching patient found. You can register a new patient below.');
        setMessageType('info');
      }
    } catch (err) {
      setExistingPatient(null);
      const errorMsg = err instanceof ApiError ? err.message : 'Lookup failed.';
      setMessage(errorMsg);
      setMessageType('error');
    } finally {
      setCheckingExisting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setMessage('');

    // Validate required fields
    const errors: Record<string, string> = {};
    const nameValidation = validateRequired(fullName, 'Full name');
    if (!nameValidation.valid) errors.fullName = nameValidation.error || '';

    const dobValidation = validateDOB(dob);
    if (!dobValidation.valid) errors.dob = dobValidation.error || '';

    const genderValidation = validateGender(gender);
    if (!genderValidation.valid) errors.gender = genderValidation.error || '';

    if (phone) {
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.valid) errors.phone = phoneValidation.error || '';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    if (existingPatient) {
      setMessage(`This patient already exists as ${existingPatient.full_name} (${existingPatient.lifelink_patient_id}).`);
      setMessageType('error');
      return;
    }

    setSaving(true);
    try {
      const patient = await patientsApi.createUnclaimed({
        full_name: fullName,
        date_of_birth: dob || undefined,
        gender,
        phone: phone || undefined,
      });
      setCreatedPatient(patient);
      toast.show('success', 'Patient registered', `${fullName} has been successfully registered.`);
      setMessage('');

      // Navigate to patient details page
      setTimeout(() => {
        router.push(`${basePath}/${patient.id}`);
      }, 1500);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      if (apiError?.status === 409 && apiError.detail && typeof apiError.detail === 'object') {
        const detail = apiError.detail as { existing_patient?: { id?: string; lifelink_patient_id?: string; full_name?: string } };
        if (detail.existing_patient) {
          const match = detail.existing_patient;
          setExistingPatient({
            id: match.id ?? '',
            lifelink_patient_id: match.lifelink_patient_id ?? '',
            full_name: match.full_name ?? 'Existing patient',
          });
          setMessage(`Existing patient found: ${match.full_name} (${match.lifelink_patient_id})`);
          setMessageType('info');
          toast.show('info', 'Patient exists', `${match.full_name} is already in the system.`);
          return;
        }
      }
      const errorMsg = err instanceof ApiError ? err.message : 'Could not register the patient.';
      setMessage(errorMsg);
      setMessageType('error');
      toast.show('error', 'Registration failed', errorMsg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href={basePath}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to search
      </Link>

      <Card>
        <CardHeader
          title="Register New Patient"
          subtitle="For a patient with no existing LifeLink account — a permanent LifeLink Patient ID is generated automatically."
        />
        <form onSubmit={submit} className="space-y-5 p-5">
          {/* Personal Information Section */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Personal Information</h3>
            <div className="space-y-4">
              <Field label="Full name" required error={fieldErrors.fullName}>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                  autoFocus
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Date of birth" required error={fieldErrors.dob} hint="MM/DD/YYYY">
                  <DateInput value={dob} onChange={(e) => setDob(e.target.value)} required />
                </Field>
                <Field label="Gender" required error={fieldErrors.gender}>
                  <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="U">Prefer not to specify</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </Select>
                </Field>
              </div>
            </div>
          </div>

          {/* Contact Information Section */}
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Contact Information</h3>
            <Field label="Phone (if known)" error={fieldErrors.phone} hint="For OTP verification and communication">
              <Input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setExistingPatient(null);
                }}
                placeholder="e.g. 9876500001"
                inputMode="numeric"
              />
            </Field>
          </div>

          {/* Actions */}
          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={checkingExisting}
                disabled={!phone.trim()}
                onClick={checkExistingPatient}
              >
                Check existing patient
              </Button>
              {existingPatient && (
                <Link
                  href={`${basePath}/${existingPatient.id}`}
                  className="text-xs font-medium text-brand-dark hover:text-brand"
                >
                  Open existing profile →
                </Link>
              )}
            </div>

            {/* Message */}
            {message && (
              <div
                className={`rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${
                  messageType === 'error'
                    ? 'bg-danger-tint text-danger'
                    : messageType === 'success'
                      ? 'bg-success-tint text-success'
                      : 'bg-info-tint text-info'
                }`}
              >
                {messageType === 'success' && <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
                <span>{message}</span>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={saving}
              disabled={!!existingPatient || !fullName.trim() || !dob || saving}
            >
              {createdPatient ? 'Patient registered ✓' : 'Register patient'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
