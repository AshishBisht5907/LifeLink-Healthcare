'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HeartPulse, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { navForRole, contextLabel } from './nav-config';
import { Navbar } from './Navbar';
import { clsx } from 'clsx';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return <>{children}</>;

  const nav = navForRole(user.role);
  const ctx = contextLabel(user);

  const SidebarContent = (
    <>
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-lg shadow-teal-900/15">
          <HeartPulse className="h-5.5 w-5.5" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight tracking-tight">LifeLink</p>
          <p className="mt-1 text-[10px] font-bold uppercase leading-tight tracking-[0.12em] text-brand">{ctx.role}</p>
        </div>
      </div>
      <div className="mx-4 mb-4 rounded-2xl border border-brand/10 bg-brand-tint/70 px-3 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand">Your workspace</p>
        <p className="mt-1 text-xs leading-5 text-foreground/80">{ctx.detail || 'Connected care, all in one place.'}</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-5" aria-label="Main">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href.split('/').length > 2 && pathname.startsWith(item.href + '/'));
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? 'page' : undefined}
              className={clsx('group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-200',
                active ? 'bg-brand-tint text-brand-dark shadow-sm ring-1 ring-brand/10 dark:text-brand' : 'text-foreground/75 hover:translate-x-0.5 hover:bg-neutral-tint hover:text-foreground')}>
              <span className={clsx('flex h-8 w-8 items-center justify-center rounded-lg transition-colors', active ? 'bg-surface text-brand shadow-sm' : 'text-muted group-hover:bg-surface group-hover:text-brand')}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
            </Link>
          );
        })}
      </nav>
      <div className="m-4 rounded-2xl border border-border bg-surface/65 p-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.12)]" />
          <p className="text-xs font-semibold">LifeLink workspace</p>
        </div>
        <p className="mt-1 pl-4 text-[11px] text-muted">Connected care platform</p>
      </div>
    </>
  );

  return (
    <div className="relative flex min-h-screen bg-background">
      <aside className="glass-panel sticky top-0 hidden h-screen w-[17rem] shrink-0 flex-col border-y-0 border-l-0 rounded-none lg:flex">{SidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close navigation overlay" className="absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="glass-panel absolute left-0 top-0 flex h-full w-80 max-w-[88vw] flex-col rounded-none shadow-2xl">
            <button onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="absolute right-3 top-4 z-10 rounded-xl p-2 text-muted hover:bg-neutral-tint"><X className="h-5 w-5" /></button>
            {SidebarContent}
          </aside>
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        <Navbar menuOpen={mobileOpen} onMenu={() => setMobileOpen((v) => !v)} />
        <main className="flex-1">
          <div className="app-page-enter mx-auto w-full max-w-[90rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-9">{children}</div>
        </main>
      </div>
    </div>
  );
}
