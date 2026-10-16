import Link from 'next/link';
import { HeartPulse, Stethoscope, Users2, Building2, ShieldCheck, ArrowUpRight, Activity, LockKeyhole, Sparkles } from 'lucide-react';

const ROLES = [
  {
    href: '/login/patient',
    icon: Users2,
    title: 'Patient & Family',
    description: 'Follow your care journey, manage consent, and stay connected with your care team.',
    tag: 'PERSONAL CARE',
    tint: 'bg-cyan-50 text-cyan-800 ring-cyan-100',
  },
  {
    href: '/login/staff',
    icon: Stethoscope,
    title: 'Hospital Staff',
    description: 'Access clinical workflows, patient requests, referrals, and department tasks.',
    tag: 'CLINICAL TEAM',
    tint: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  },
  {
    href: '/login/staff?role=management',
    icon: Building2,
    title: 'Hospital Management',
    description: 'Coordinate admissions, hospital capacity, requests, and referrals.',
    tag: 'OPERATIONS',
    tint: 'bg-blue-50 text-blue-800 ring-blue-100',
  },
  {
    href: '/login/staff?role=admin',
    icon: ShieldCheck,
    title: 'Hospital Admin',
    description: 'Manage staff access, departments, roles, and hospital configuration.',
    tag: 'SECURE ACCESS',
    tint: 'bg-violet-50 text-violet-800 ring-violet-100',
  },
];

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-28 -top-36 h-[26rem] w-[26rem] rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="absolute -left-32 top-[38%] h-[23rem] w-[23rem] rounded-full bg-teal-200/25 blur-3xl" />
        <div className="absolute bottom-0 right-[18%] h-72 w-72 rounded-full bg-sky-100/70 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(#78aeb2 0.7px, transparent 0.7px)', backgroundSize: '24px 24px' }} />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-xl">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-teal-900/15">
            <HeartPulse className="h-6 w-6" strokeWidth={2.2} />
          </span>
          <span>
            <span className="block text-lg font-bold tracking-tight text-foreground">LifeLink</span>
            <span className="block text-[11px] font-medium tracking-[0.12em] text-muted">CONNECTED CARE PLATFORM</span>
          </span>
        </Link>
        <div className="hidden items-center gap-2 rounded-full border border-white/80 bg-white/65 px-4 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-md sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Care coordination, made clearer
        </div>
      </header>

      <section className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 px-5 pb-14 pt-8 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:py-16">
        <div className="animate-rise-in max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-100 bg-white/75 px-3.5 py-2 text-xs font-semibold text-brand-dark shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            One connected space for better care
          </div>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.65rem]">
            Better care starts with
            <span className="mt-1 block bg-gradient-to-r from-teal-700 via-cyan-700 to-sky-700 bg-clip-text pb-2 text-transparent">better connection.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg">
            Bring patients, families, hospital teams, and administrators together through a clearer, more coordinated care experience.
          </p>

          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-brand" /> Role-based access</span>
            <span className="inline-flex items-center gap-2"><Activity className="h-4 w-4 text-brand" /> Connected workflows</span>
          </div>

          <div className="mt-10 rounded-2xl border border-white/90 bg-white/60 p-4 shadow-sm backdrop-blur-md sm:flex sm:items-center sm:gap-4">
            <div className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-brand sm:mb-0">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Care is a team effort.</p>
              <p className="mt-1 text-sm leading-5 text-slate-600">Choose your workspace to continue securely.</p>
            </div>
          </div>
        </div>

        <div className="animate-rise-in" style={{ animationDelay: '100ms' }}>
          <div className="glass-panel rounded-[2rem] p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4 px-1 pb-5 pt-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Welcome to LifeLink</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Choose your workspace</h2>
                <p className="mt-1.5 text-sm text-slate-500">Select the option that best describes you.</p>
              </div>
              <span className="hidden h-11 w-11 items-center justify-center rounded-2xl bg-white text-brand shadow-sm ring-1 ring-teal-100 sm:flex">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {ROLES.map((role, index) => (
                <Link
                  key={role.title}
                  href={role.href}
                  className="interactive-card group flex min-h-[190px] flex-col rounded-2xl border border-white/90 bg-white/85 p-4 shadow-[0_3px_12px_rgba(20,60,70,.035)] focus-visible:outline-brand sm:p-5"
                  style={{ animationDelay: `${index * 65}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${role.tint}`}>
                      <role.icon className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-slate-400 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
                  </div>
                  <span className="mt-4 text-[10px] font-bold tracking-[0.14em] text-slate-400">{role.tag}</span>
                  <span className="mt-1.5 text-[15px] font-semibold tracking-tight text-slate-900">{role.title}</span>
                  <span className="mt-1.5 text-xs leading-[1.65] text-slate-600">{role.description}</span>
                </Link>
              ))}
            </div>

            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <p className="text-[11px] leading-5 text-slate-500">Use only your authorized account. This is a demonstration environment; do not enter real patient information.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/80 bg-white/40">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© {new Date().getFullYear()} LifeLink · Connected Care. Better Tomorrow.</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Designed for clearer, coordinated care</span>
        </div>
      </footer>
    </main>
  );
}
