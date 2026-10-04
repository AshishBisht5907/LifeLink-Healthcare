'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, HeartPulse, LockKeyhole } from 'lucide-react';
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>

        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
            <HeartPulse className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">{roleContext.title}</h1>
          <p className="mt-1 text-xs text-muted">{roleContext.description}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required placeholder="e.g. doctor_abc" />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
