import Link from 'next/link';
import { HeartPulse, Stethoscope, Users2 } from 'lucide-react';

const ROLE_LINKS = [
  {
    href: '/login/patient',
    icon: Users2,
    title: 'Patient / Family',
    description: 'Sign in with mobile OTP',
  },
  {
    href: '/login/staff',
    icon: Stethoscope,
    title: 'Hospital Staff',
    description: 'Sign in with username & password',
  },
];

export default function LoginLandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
          <HeartPulse className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Sign in to LifeLink</h1>
        <p className="mt-1 text-xs text-muted">Choose how you access the platform.</p>
      </div>
      <div className="grid w-full max-w-sm gap-3">
        {ROLE_LINKS.map(({ href, icon: Icon, title, description }) => (
          <Link key={title} href={href} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm hover:border-brand/30">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint text-brand-dark"><Icon className="h-4.5 w-4.5" /></div>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
