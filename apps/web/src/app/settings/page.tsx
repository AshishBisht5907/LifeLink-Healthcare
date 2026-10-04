'use client';

import Link from 'next/link';
import { Bell, FileCheck2, LogOut, ShieldCheck, UserRound, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { contextLabel } from '@/components/layout/nav-config';
import { Button, Card, CardHeader } from '@/components/ui/Primitives';
import { LoadingBlock } from '@/components/ui/States';
import { NotificationPreferencesForm } from '@/components/settings/NotificationPreferencesForm';

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div><dt className="text-xs font-medium text-muted">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold">{value}{note && <span className="ml-2 text-xs font-normal text-muted">{note}</span>}</dd></div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  if (!user) return <LoadingBlock rows={4} />;
  const ctx = contextLabel(user);
  const isPatient = user.role === 'PATIENT';

  const privacy = [
    ...(isPatient ? [{ href: '/portal/access-requests', label: 'Access requests', hint: 'Who has asked to view your record', icon: ShieldCheck }] : []),
    ...(isPatient || user.role === 'FAMILY' ? [
      { href: '/portal/family-access', label: 'Family access', hint: 'Who is linked and what they can see', icon: Users },
      { href: '/portal/consents', label: 'Consent', hint: 'Procedures and sharing you have agreed to', icon: FileCheck2 },
    ] : []),
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div><h1 className="text-xl font-semibold">Settings</h1><p className="mt-0.5 text-sm text-muted">Only settings LifeLink supports are shown here.</p></div>

      <Card>
        <CardHeader title="Account" subtitle="Managed by your hospital. These details cannot be edited here." />
        <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
          <Row label="Signed in as" value={user.username} />
          <Row label="Role" value={ctx.role} note={ctx.detail ?? undefined} />
          <Row label="Phone" value={user.phone || 'Not on file'} />
          <Row label="Email" value={user.email || 'Not on file'} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="Security" />
        <div className="flex items-center justify-between gap-3 p-5">
          <div className="flex items-start gap-3"><UserRound className="mt-0.5 h-4 w-4 text-brand" /><div><p className="text-sm font-medium">Two-step verification</p><p className="text-xs text-muted">Shown for information. It can&rsquo;t be changed from this screen.</p></div></div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${user.mfa_enabled ? 'bg-success-tint text-success' : 'bg-neutral-tint text-muted'}`}>{user.mfa_enabled ? 'On' : 'Off'}</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border p-5">
          <p className="text-sm text-muted">Sign out of LifeLink on this device.</p>
          <Button variant="secondary" onClick={logout}><LogOut className="h-3.5 w-3.5" /> Sign out</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Notifications" subtitle="Choose how LifeLink contacts you." action={<Link href="/notifications" className="inline-flex items-center gap-1 text-xs font-medium text-brand-dark hover:underline"><Bell className="h-3.5 w-3.5" />View notifications</Link>} />
        <div className="p-5"><NotificationPreferencesForm warnAboutInApp={isPatient} /></div>
      </Card>

      {privacy.length > 0 && (
        <Card>
          <CardHeader title="Privacy & sharing" />
          <ul className="divide-y divide-border">
            {privacy.map(({ href, label, hint, icon: Icon }) => (
              <li key={href}><Link href={href} className="flex items-center gap-3 px-5 py-3.5 hover:bg-neutral-tint"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint text-brand-dark"><Icon className="h-4 w-4" /></span><span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></span></Link></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
