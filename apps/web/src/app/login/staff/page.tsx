'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff, HeartPulse, LockKeyhole } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui/Primitives';
import { authApi, ApiError } from '@/lib/api';
import { useAuth, roleHomePath } from '@/context/AuthContext';

export default function StaffLoginPage() {
  return (
    <Suspense>
      <StaffLoginForm />
    </Suspense>
  );
}

function StaffLoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const roleQuery = searchParams.get('role');
  const roleContext =
    roleQuery === 'admin'
      ? {
          title: 'Hospital Admin Login',
          description: 'Manage staff, departments, roles, and hospital configuration.',
        }
      : roleQuery === 'management'
        ? {
            title: 'Hospital Management Login',
            description: 'Coordinate admissions, requests, and referrals across departments.',
          }
        : {
            title: 'Hospital Staff Login',
            description: 'Doctors, management, department staff, and hospital admins.',
          };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await authApi.staffLogin(username, password, mfaCode || undefined);
      await refresh();
      const next = searchParams.get('next');
      router.push(next && next !== '/' ? next : roleHomePath(user.role));
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 && /mfa/i.test(err.message)) {
          setNeedsMfa(true);
          setError('Enter your MFA code to continue.');
        } else if (err.status === 423) {
          setError('This account is temporarily locked due to repeated failed attempts. Try again later.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Could not reach the server. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-12 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 bottom-8 h-72 w-72 rounded-full bg-teal-300/20 blur-3xl" />
      <div className="app-page-enter relative w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>

        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-lg shadow-teal-900/15">
            <HeartPulse className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{roleContext.title}</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted">{roleContext.description}</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel mt-7 space-y-5 rounded-3xl p-6 shadow-xl shadow-teal-950/5 sm:p-7">
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required placeholder="e.g. doctor_abc" />
          </Field>
          <Field label="Password">
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="pr-12" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted transition hover:text-brand focus-visible:outline-offset-[-3px]">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          {needsMfa && (
            <Field label="MFA code" hint="6-digit code from your authenticator app">
              <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} inputMode="numeric" maxLength={6} />
            </Field>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-danger-tint px-3 py-2 text-xs text-danger">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={loading}
            disabled={!username.trim() || !password || loading}
          >
            Sign in
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          Patient or family member? <Link href="/login/patient" className="font-medium text-brand-dark">Continue here</Link>
        </p>
      </div>
    </div>
  );
}
