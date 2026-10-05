'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bell, HeartPulse, LogOut, Menu, Settings, UserRound, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { notificationsApi } from '@/lib/api';
import { contextLabel } from './nav-config';

const ROLE_TONE: Record<string, string> = {
  PATIENT: 'bg-brand-tint text-brand-dark ring-brand-light',
  FAMILY: 'bg-info-tint text-info ring-info/20',
  HOSPITAL_MANAGEMENT: 'bg-brand text-white ring-brand',
  HOSPITAL_STAFF: 'bg-info-tint text-info ring-info/20',
  HOSPITAL_ADMIN: 'bg-brand-dark text-white ring-brand-dark',
};

function useUnreadCount(pathname: string) {
  const [count, setCount] = useState<number | null>(null);
  // Refetch when the user moves between pages; no timers, no polling.
  useEffect(() => {
    let alive = true;
    notificationsApi.list()
      .then((r) => alive && setCount(r.results.filter((n) => !n.is_read).length))
      .catch(() => alive && setCount(null));
    return () => { alive = false; };
  }, [pathname]);
  return count;
}

export function Navbar({ menuOpen, onMenu }: { menuOpen: boolean; onMenu: () => void }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const unread = useUnreadCount(pathname);
  const [profileOpen, setProfileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setProfileOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!user) return null;
  const ctx = contextLabel(user);
  const name = user.staff_profile?.job_title || user.username;
  const isPortal = user.role === 'PATIENT' || user.role === 'FAMILY';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-5">
      <button onClick={onMenu} aria-label={menuOpen ? 'Close menu' : 'Open menu'} className="rounded-lg p-2 hover:bg-neutral-tint lg:hidden">
        {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white"><HeartPulse className="h-3.5 w-3.5" /></div>
        <span className="text-sm font-semibold">LifeLink</span>
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`truncate rounded-full px-3 py-1 text-[11px] font-bold tracking-wide ring-1 ${ROLE_TONE[user.role]}`}><span className="sm:hidden">{ctx.role.replace('HOSPITAL ', '')}</span><span className="hidden sm:inline">{ctx.role}</span></span>
        {ctx.detail && <span className="hidden truncate text-sm text-muted md:inline">{ctx.detail}</span>}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Link href="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative rounded-lg p-2 text-foreground/70 hover:bg-neutral-tint">
          <Bell className="h-5 w-5" />
          {!!unread && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>

        <div className="relative" ref={ref}>
          <button onClick={() => setProfileOpen((v) => !v)} aria-haspopup="menu" aria-expanded={profileOpen}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-neutral-tint">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-sm font-semibold text-brand-dark">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">{name}</span>
          </button>
          {profileOpen && (
            <div role="menu" className="absolute right-0 mt-2 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
              <div className="border-b border-border px-3 py-2">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-muted">{ctx.role}{ctx.detail ? ` · ${ctx.detail}` : ''}</p>
              </div>
              {isPortal && (
                <Link role="menuitem" href="/portal/profile" className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neutral-tint"><UserRound className="h-4 w-4" /> {user.role === 'FAMILY' ? 'Patient profile' : 'My profile'}</Link>
              )}
              <Link role="menuitem" href="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neutral-tint"><Settings className="h-4 w-4" /> Settings</Link>
              <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-tint"><LogOut className="h-4 w-4" /> Log out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
