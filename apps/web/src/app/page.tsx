import Link from 'next/link';
import { HeartPulse, Stethoscope, Users2, Building2, ShieldCheck, ArrowRight } from 'lucide-react';

const ROLES = [
  {
    href: '/login/patient',
    icon: Users2,
    title: 'Patient / Family',
    description: 'View your care journey, approve consent, and stay updated.',
  },
  {
    href: '/login/staff',
    icon: Stethoscope,
    title: 'Hospital Staff',
    description: 'Doctors, radiology, lab, ward, pharmacy, billing & insurance.',
  },
  {
    href: '/login/staff?role=management',
    icon: Building2,
    title: 'Hospital Management',
    description: 'Coordinate admissions, requests, and referrals across departments.',
  },
  {
    href: '/login/staff?role=admin',
    icon: ShieldCheck,
    title: 'Hospital Admin',
    description: 'Manage staff, departments, roles, and hospital configuration.',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-sm">
            <HeartPulse className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">LifeLink</h1>
          <p className="mt-1 text-sm text-muted">Connected Care. Better Tomorrow.</p>
        </div>

        <div className="w-full max-w-2xl">
          <p className="mb-4 text-center text-sm font-medium text-foreground">Who are you?</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ROLES.map((role) => (
              <Link
                key={role.title}
                href={role.href}
                className="group flex flex-col rounded-2xl border border-border bg-surface p-5 text-left shadow-[0_1px_2px_rgba(16,24,22,0.04)] transition-all hover:border-brand/30 hover:shadow-md"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint text-brand-dark">
                  <role.icon className="h-4.5 w-4.5" />
                </div>
                <p className="text-sm font-semibold text-foreground">{role.title}</p>
                <p className="mt-1 text-xs text-muted">{role.description}</p>
                <span className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-dark opacity-0 transition-opacity group-hover:opacity-100">
                  Continue <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <footer className="border-t border-border py-4 text-center text-xs text-muted">
        LifeLink demo environment — not for real patient data.
      </footer>
    </div>
  );
}
