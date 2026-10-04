'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, BellRing, ChevronRight, ShieldAlert, Settings } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/lib/useApi';
import { notificationsApi } from '@/lib/api';
import { filterNotifications, notificationHref, notificationMeta, unreadCount, type NotificationFilter } from '@/lib/notificationView';
import { serverMessage } from '@/lib/errorMessages';
import { formatDateTime, friendlyError } from '@/lib/format';
import { Button, Card } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { FilterPills, MoreNotice } from '@/components/ui/FilterPills';

const TONE = { danger: 'bg-danger-tint text-danger', brand: 'bg-brand-tint text-brand-dark', info: 'bg-info-tint text-info' } as const;

export default function NotificationsPage() {
  const { user } = useAuth();
  const notifications = useApi(() => notificationsApi.list());
  const [filter, setFilter] = useState<NotificationFilter>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function markRead(id: string) {
    setBusyId(id); setError('');
    try { await notificationsApi.markRead(id); notifications.refetch(); } // the list shows what the server now says
    catch (err) { setError(serverMessage(err, [400, 404])); } finally { setBusyId(null); }
  }

  const all = notifications.data?.results ?? [];
  const unread = unreadCount(all);
  const items = filterNotifications(all, filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="mt-0.5 text-sm text-muted">{notifications.loading ? ' ' : unread > 0 ? `${unread} unread${notifications.data?.next ? ' in the latest messages' : ''}` : 'You are all caught up'}</p>
        </div>
        <Link href="/settings"><Button variant="ghost" size="sm"><Settings className="h-4 w-4" /> Settings</Button></Link>
      </div>

      <FilterPills label="Filter notifications" value={filter} onChange={setFilter} options={[{ value: 'ALL', label: 'All', count: all.length }, { value: 'UNREAD', label: 'Unread', count: unread }]} />

      <Card>
        {notifications.loading ? <LoadingBlock rows={4} /> : notifications.error ? (
          <ErrorState status={notifications.error.status} description={friendlyError(notifications.error.status)} onRetry={notifications.refetch} />
        ) : items.length === 0 ? (
          <EmptyState icon={<Bell className="h-5 w-5" />} title={filter === 'UNREAD' ? 'No unread notifications' : 'No notifications yet'} description="Updates about your care and account will appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const meta = notificationMeta(n.notification_type);
              const href = user ? notificationHref(n.notification_type, user.role) : null;
              return (
                <li key={n.id} className={`flex items-start justify-between gap-3 px-5 py-4 ${n.is_read ? '' : 'bg-brand-tint/40'}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${n.is_read ? 'bg-neutral-tint text-muted' : TONE[meta.tone]}`}>
                      {meta.tone === 'danger' ? <ShieldAlert className="h-4 w-4" /> : n.is_read ? <Bell className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm ${n.is_read ? 'font-medium text-foreground/80' : 'font-semibold'}`}>{n.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE[meta.tone]}`}>{meta.label}</span>
                        {!n.is_read && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">New</span>}
                      </p>
                      {n.body && <p className="mt-0.5 break-words text-xs text-muted">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-muted">{formatDateTime(n.created_at)}</p>
                      {href && <Link href={href} className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-brand-dark hover:underline">Open <ChevronRight className="h-3 w-3" /></Link>}
                    </div>
                  </div>
                  {!n.is_read && <Button size="sm" variant="ghost" loading={busyId === n.id} onClick={() => markRead(n.id)}>Mark read</Button>}
                </li>
              );
            })}
          </ul>
        )}
        {notifications.data?.next && <MoreNotice shown={all.length} />}
        {error && <p role="alert" className="px-5 pb-4 text-xs text-danger">{error}</p>}
      </Card>
    </div>
  );
}
