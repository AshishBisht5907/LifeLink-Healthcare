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
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-sm">
          <HeartPulse className="h-5 w-5" />
        </div>
        <div>
          <p className="text-base font-semibold leading-tight">LifeLink</p>
          <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-brand">{ctx.role}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Main">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href.split('/').length > 2 && pathname.startsWith(item.href + '/'));
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? 'page' : undefined}
              className={clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-brand-tint text-brand-dark shadow-[inset_3px_0_0_var(--brand)]' : 'text-foreground/75 hover:bg-neutral-tint hover:text-foreground')}>
              <Icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">{SidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <button onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="absolute right-2 top-4 z-10 rounded-lg p-2 text-muted hover:bg-neutral-tint"><X className="h-5 w-5" /></button>
            {SidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar menuOpen={mobileOpen} onMenu={() => setMobileOpen((v) => !v)} />
        <main className="flex-1">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
