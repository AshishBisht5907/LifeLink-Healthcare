'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, HeartHandshake } from 'lucide-react';
import { authApi, ApiError } from '@/lib/api';
import { useAuth, roleHomePath } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button, Card, Field, Input } from '@/components/ui/Primitives';

export default function FamilyRegistrationPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<'DETAILS' | 'OTP'>('DETAILS');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [relationship, setRelationship] = useState('Family member');
  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await authApi.otpRequest(phone.trim(), 'REGISTER_FAMILY');
      setDevOtp(response.dev_otp ?? null);
      setStep('OTP');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not request a verification code.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await authApi.otpVerify(
        phone.trim(),
        'REGISTER_FAMILY',
        code.trim(),
        fullName.trim(),
        undefined,
        undefined,
        undefined,
        undefined,
        patientId.trim(),
        relationship.trim() || 'Family member',
      );
      await refresh();
      toast.show('success', 'Family account created', 'The patient must activate your pending family link before you can view their record.');
      router.push(roleHomePath(response.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <Link href="/login/patient" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to patient login
        </Link>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
            <HeartHandshake className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Join LifeLink as family</h1>
          <p className="mt-1 text-sm text-muted">Enter the patient's LifeLink ID. They must approve the link before you can view their record.</p>
        </div>
        <Card className="space-y-4 p-5">
          {step === 'DETAILS' ? (
            <form onSubmit={requestCode} className="space-y-4">
              <Field label="Your full name" required>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={150} />
              </Field>
              <Field label="Your mobile number" required>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" maxLength={20} placeholder="Mobile number" />
              </Field>
              <Field label="Patient LifeLink ID" required>
                <Input value={patientId} onChange={(e) => setPatientId(e.target.value.toUpperCase())} required maxLength={20} placeholder="e.g. LL-P-100001" />
              </Field>
              <Field label="Your relationship to the patient" required>
                <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} required maxLength={50} />
              </Field>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" className="w-full" loading={busy}>Send verification code</Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-4">
              <p className="text-sm text-muted">Enter the one-time code for {phone}. Your family link will remain pending until the patient approves it.</p>
              {devOtp && <p className="rounded-lg bg-info-tint px-3 py-2 text-sm text-info">Development OTP: <strong>{devOtp}</strong></p>}
              <Field label="Verification code" required>
                <Input value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" maxLength={6} placeholder="Enter OTP" />
              </Field>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" className="w-full" loading={busy}>Verify and create account</Button>
              <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => { setStep('DETAILS'); setCode(''); setError(''); }}>Back</Button>
            </form>
          )}
        </Card>
        <p className="text-center text-xs text-muted">This college-project build uses a development OTP provider; no real SMS is sent.</p>
      </div>
    </div>
  );
}
