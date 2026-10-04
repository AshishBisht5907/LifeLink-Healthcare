'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/useApi';
import { notificationsApi } from '@/lib/api';
import { serverMessage } from '@/lib/errorMessages';
import { friendlyError } from '@/lib/format';
import { Button } from '@/components/ui/Primitives';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import type { NotificationPreference } from '@/lib/types';

const CHANNELS: { key: keyof NotificationPreference; title: string; hint: string }[] = [
  { key: 'in_app', title: 'In-app notifications', hint: 'Messages inside LifeLink.' },
  { key: 'email', title: 'Email', hint: 'Sent only if your account has an email address.' },
  { key: 'sms', title: 'SMS', hint: 'Sent only if your account has a phone number.' },
];

/** The real preferences endpoint (in_app / email / sms). Saves, then re-reads what the server stored. */
export function NotificationPreferencesForm({ warnAboutInApp }: { warnAboutInApp?: boolean }) {
  const toast = useToast();
  const server = useApi(() => notificationsApi.getPreferences());
  const [prefs, setPrefs] = useState<NotificationPreference | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (server.data) setPrefs({ ...server.data }); }, [server.data]);

  if (server.loading) return <LoadingBlock rows={3} />;
  if (server.error) return <ErrorState status={server.error.status} description={friendlyError(server.error.status)} onRetry={server.refetch} />;
  if (!prefs) return null;

  const dirty = !!server.data && (['in_app', 'email', 'sms'] as const).some((k) => prefs[k] !== server.data![k]);

  async function save() {
    if (!prefs) return;
    setSaving(true);
    try {
      await notificationsApi.updatePreferences(prefs);
      toast.show('success', 'Preferences saved');
      server.refetch();
    } catch (err) { toast.show('error', 'Could not save', serverMessage(err, [400])); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {CHANNELS.map(({ key, title, hint }) => (
        <label key={key} className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]" checked={prefs[key]} onChange={() => setPrefs({ ...prefs, [key]: !prefs[key] })} />
          <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted">{hint}</span></span>
        </label>
      ))}
      {warnAboutInApp && !prefs.in_app && (
        <p role="status" className="rounded-lg bg-warning-tint px-3 py-2 text-xs text-foreground/85">With in-app notifications off you will not see new messages in LifeLink, including requests from hospitals to view your record.</p>
      )}
      <div className="flex justify-end border-t border-border pt-4"><Button onClick={save} loading={saving} disabled={!dirty}>Save preferences</Button></div>
    </div>
  );
}
