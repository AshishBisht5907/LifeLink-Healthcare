'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, HeartPulse, MessageSquareText, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button, Field, Input, Select } from '@/components/ui/Primitives';
import { DateInput } from '@/components/ui/DateInput';
import { authApi, ApiError } from '@/lib/api';
import { useAuth, roleHomePath } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import {
  validateEmail,
  validatePhone,
  validateDOB,
  validateRequired,
  validateGender,
} from '@/lib/validation';
import { otpWelcomeMessage } from '@/lib/authMessages';

type Mode = 'LOGIN' | 'REGISTER';
type Step = 'PHONE' | 'CODE' | 'REGISTER_STEP1' | 'REGISTER_STEP2' | 'REGISTER_STEP3';

export default function PatientLoginPage() {
  return (
    <Suspense>
      <PatientLoginForm />
    </Suspense>
  );
}

function PatientLoginForm() {
  const [mode, setMode] = useState<Mode>('LOGIN');
  const [step, setStep] = useState<Step>('PHONE');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const toast = useToast();

  // Registration form state
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('U');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  // Validation errors for each field
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setLoading(true);

    try {
      if (mode === 'LOGIN') {
        const phoneValidation = validatePhone(phone);
        if (!phoneValidation.valid) {
          setError(phoneValidation.error || 'Invalid phone');
          setLoading(false);
          return;
        }
      }

      const resp = await authApi.otpRequest(phone, mode);
      setDevOtp(resp.dev_otp ?? null);

      if (mode === 'REGISTER') {
        setStep('REGISTER_STEP1');
      } else {
        setStep('CODE');
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not send the code. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { user } = await authApi.otpVerify(
        phone,
        mode, // Use mode instead of hardcoded 'REGISTER'
        code,
        fullName,
        dob || undefined,
        gender || undefined,
        email || undefined,
        address || undefined
      );
      await refresh();
      const toastTitle = mode === 'REGISTER' ? 'Welcome to LifeLink!' : 'Welcome back';
      toast.show('success', toastTitle, otpWelcomeMessage(mode));
      const next = searchParams.get('next');
      router.push(next && next !== '/' ? next : roleHomePath(user.role));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not verify the code. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterStep1Next() {
    const errors: Record<string, string> = {};
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) errors.phone = phoneValidation.error || '';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setStep('REGISTER_STEP2');
  }

  async function handleRegisterStep2Next() {
    const errors: Record<string, string> = {};

    const nameValidation = validateRequired(fullName, 'Full name');
    if (!nameValidation.valid) errors.fullName = nameValidation.error || '';

    const dobValidation = validateDOB(dob);
    if (!dobValidation.valid) errors.dob = dobValidation.error || '';

    const genderValidation = validateGender(gender);
    if (!genderValidation.valid) errors.gender = genderValidation.error || '';

    if (email) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.valid) errors.email = emailValidation.error || '';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setStep('REGISTER_STEP3');
  }

  async function handleRegisterStep3Next() {
    // All fields are already validated in step 2, so we can proceed directly to OTP
    // This is the final step of registration - go to CODE step for OTP verification
    setStep('CODE');
    setError('');
  }

  function handleRegisterStep3Back() {
    setStep('REGISTER_STEP2');
    setError('');
  }

  function handleBack() {
    if (step === 'REGISTER_STEP1') {
      setStep('PHONE');
      setFieldErrors({});
    } else if (step === 'REGISTER_STEP2') {
      setStep('REGISTER_STEP1');
      setFieldErrors({});
    } else if (step === 'REGISTER_STEP3') {
      handleRegisterStep3Back();
    } else if (step === 'CODE') {
      setStep('PHONE');
      setError('');
    }
  }

  // Progress indicator
  function getProgress() {
    if (step === 'REGISTER_STEP1') return { current: 1, total: 3 };
    if (step === 'REGISTER_STEP2') return { current: 2, total: 3 };
    if (step === 'REGISTER_STEP3') return { current: 3, total: 3 };
    return null;
  }

  const progress = getProgress();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>

        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
            <HeartPulse className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Patient & Family Access</h1>
          <p className="mt-1 text-xs text-muted">Secure sign-in with a one-time code sent to your phone.</p>
        </div>

        {/* Show mode toggle only on initial phone entry */}
        {(step === 'PHONE') && (
          <div className="mb-4 flex rounded-lg border border-border bg-neutral-tint p-1 text-xs font-medium">
            <button
              className={`flex-1 rounded-md py-1.5 transition-colors ${
                mode === 'LOGIN' ? 'bg-white shadow-sm text-foreground' : 'text-muted'
              }`}
              onClick={() => {
                setMode('LOGIN');
                setStep('PHONE');
                setError('');
                setFieldErrors({});
              }}
            >
              I have an account
            </button>
            <button
              className={`flex-1 rounded-md py-1.5 transition-colors ${
                mode === 'REGISTER' ? 'bg-white shadow-sm text-foreground' : 'text-muted'
              }`}
              onClick={() => {
                setMode('REGISTER');
                setStep('PHONE');
                setError('');
                setFieldErrors({});
              }}
            >
              New patient account
            </button>
          </div>
        )}

        {/* Progress indicator for registration */}
        {progress && (
          <div className="mb-4 flex items-center gap-2 justify-center">
            <div className="text-xs font-medium text-muted">
              Step {progress.current} of {progress.total}
            </div>
            <div className="flex gap-1">
              {Array.from({ length: progress.total }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-colors ${
                    i < progress.current ? 'bg-brand' : 'bg-border'
                  }`}
                  style={{ width: `${100 / progress.total}%` }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {/* LOGIN or initial REGISTER phone entry */}
          {step === 'PHONE' && (
            <form onSubmit={requestOtp} className="space-y-4">
              <Field label="Mobile number" required error={fieldErrors.phone}>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  inputMode="numeric"
                  placeholder="e.g. 9876500001"
                  autoFocus
                />
              </Field>
              {error && <p className="text-xs text-danger">{error}</p>}
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={loading}
                disabled={!phone.trim() || loading}
              >
                {mode === 'LOGIN' ? 'Send code' : 'Continue'}
              </Button>
            </form>
          )}

          {/* REGISTER Step 1: Phone */}
          {step === 'REGISTER_STEP1' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRegisterStep1Next();
              }}
              className="space-y-4"
            >
              <Field label="Mobile number" required error={fieldErrors.phone}>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  inputMode="numeric"
                  placeholder="e.g. 9876500001"
                  autoFocus
                />
              </Field>
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={handleBack}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1"
                  disabled={!phone.trim() || loading}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}

          {/* REGISTER Step 2: Personal & Contact Info */}
          {step === 'REGISTER_STEP2' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRegisterStep2Next();
              }}
              className="space-y-4"
            >
              <Field label="Full name" required error={fieldErrors.fullName}>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="e.g. John Doe"
                  autoFocus
                />
              </Field>

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

              <Field label="Email" error={fieldErrors.email} hint="Optional – for password recovery">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. john@example.com"
                />
              </Field>

              <Field label="Address" hint="Optional – for medical records">
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street address"
                />
              </Field>

              {error && <p className="text-xs text-danger">{error}</p>}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={handleBack}
                  disabled={loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button type="submit" variant="primary" className="flex-1" disabled={loading}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}

          {/* REGISTER Step 3: Review */}
          {step === 'REGISTER_STEP3' && (
            <form onSubmit={(e) => {
              e.preventDefault();
              handleRegisterStep3Next();
            }} className="space-y-4">
              <div className="space-y-3 rounded-lg bg-neutral-tint p-4">
                <div>
                  <p className="text-xs text-muted">Full Name</p>
                  <p className="text-sm font-medium text-foreground">{fullName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Date of Birth</p>
                  <p className="text-sm font-medium text-foreground">
                    {dob ? new Date(dob).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">Gender</p>
                  <p className="text-sm font-medium text-foreground">
                    {gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : gender === 'O' ? 'Other' : 'Not specified'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">Phone Number</p>
                  <p className="text-sm font-medium text-foreground">{phone}</p>
                </div>
                {email && (
                  <div>
                    <p className="text-xs text-muted">Email</p>
                    <p className="text-sm font-medium text-foreground">{email}</p>
                  </div>
                )}
                {address && (
                  <div>
                    <p className="text-xs text-muted">Address</p>
                    <p className="text-sm font-medium text-foreground">{address}</p>
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-danger">{error}</p>}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={handleRegisterStep3Back}
                  disabled={loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1"
                  loading={loading}
                  disabled={loading}
                >
                  Confirm & Send Code
                </Button>
              </div>
            </form>
          )}

          {/* OTP Verification (after registration or login) */}
          {step === 'CODE' && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg bg-brand-tint px-3 py-2 text-xs text-brand-dark">
                <MessageSquareText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Code sent to {phone}.
                  {devOtp && <> Demo mode — your code is <strong>{devOtp}</strong>.</>}
                </span>
              </div>
              <Field label="6-digit code" required>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                />
              </Field>
              {error && <p className="text-xs text-danger">{error}</p>}
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={loading}
                disabled={!code.trim() || loading}
              >
                Verify & continue
              </Button>
              <button
                type="button"
                onClick={() => setStep('PHONE')}
                className="w-full text-center text-xs font-medium text-muted hover:text-foreground"
              >
                Use a different number
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          Family accounts are provisioned by the hospital during registration — use &quot;I have an
          account&quot; to sign in.{' '}
          Hospital staff? <Link href="/login/staff" className="font-medium text-brand-dark">Sign in here</Link>
        </p>
      </div>
    </div>
  );
}
