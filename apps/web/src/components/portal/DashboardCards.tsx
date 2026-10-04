import Link from 'next/link';
import { BedDouble, Bell, ClipboardList, FileCheck2, FileText, History, ShieldCheck, UserRound } from 'lucide-react';
import { Card } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { formatDate, formatDateTime, requestLabel, friendlyError } from '@/lib/format';
import type { AdmissionListItem, LiveStatusItem, Notification, ServiceRequest } from '@/lib/types';

export type Async<T> = { data: T | null; loading: boolean; error: { status: number } | null; refetch: () => void };

export function Section({ icon, title, action, children }: { icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="text-brand [&>svg]:h-4 [&>svg]:w-4">{icon}</span>{title}
        </h2>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}

export function Body<T>({ state, empty, children }: { state: Async<T>; empty: React.ReactNode; children: (d: T) => React.ReactNode }) {
  if (state.loading) return <LoadingBlock rows={3} />;
  if (state.error) return <ErrorState status={state.error.status} description={friendlyError(state.error.status)} onRetry={state.refetch} />;
  if (!state.data) return <>{empty}</>;
  return <>{children(state.data)}</>;
}

export function CurrentCareCard({ admissions }: { admissions: Async<AdmissionListItem[]> }) {
  return (
    <Section icon={<BedDouble />} title="Current care">
      <Body state={admissions} empty={<EmptyState icon={<BedDouble className="h-5 w-5" />} title="Not currently admitted" description="If you are admitted to a hospital, your stay will appear here." />}>
        {(list) => {
          const active = list.filter((a) => a.status === 'ACTIVE');
          if (active.length === 0) return <EmptyState icon={<BedDouble className="h-5 w-5" />} title="Not currently admitted" description="If you are admitted to a hospital, your stay will appear here." />;
          return (
            <ul className="divide-y divide-border">
              {active.map((a) => (
                <li key={a.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{a.hospital_name}</p>
                      <p className="text-xs text-muted">Admission {a.admission_number} · since {formatDate(a.admitted_at)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-success-tint px-2.5 py-0.5 text-xs font-medium text-success">Admitted</span>
                  </div>
                </li>
              ))}
            </ul>
          );
        }}
      </Body>
    </Section>
  );
}

export function ActiveRequestsCard({ items }: { items: Async<LiveStatusItem[]> }) {
  return (
    <Section icon={<ClipboardList />} title="Active requests">
      <Body state={items} empty={<EmptyState title="No active requests" description="Tests, procedures and other care requests in progress will show here." />}>
        {(list) => list.length === 0
          ? <EmptyState title="No active requests" description="Tests, procedures and other care requests in progress will show here." />
          : (
            <ul className="divide-y divide-border">
              {list.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{requestLabel(r.type)}</p>
                    <p className="truncate text-xs text-muted">{r.department ?? 'Department not assigned yet'} · {formatDate(r.created_at)}</p>
                  </div>
                  <StatusBadge kind="request" value={r.status} />
                </li>
              ))}
            </ul>
          )}
      </Body>
    </Section>
  );
}

export function RecentActivityCard({ requests, admissions }: { requests: Async<ServiceRequest[]>; admissions: Async<AdmissionListItem[]> }) {
  const loading = requests.loading || admissions.loading;
  const error = requests.error ?? admissions.error;
  const events = [
    ...(requests.data ?? []).map((r) => ({ key: `r${r.id}`, at: r.created_at, title: `${requestLabel(r.request_type)} requested`, sub: r.department_name ?? undefined, status: r.status })),
    ...(admissions.data ?? []).flatMap((a) => [
      { key: `a${a.id}`, at: a.admitted_at, title: `Admitted to ${a.hospital_name}`, sub: undefined, status: undefined },
      ...(a.discharged_at ? [{ key: `d${a.id}`, at: a.discharged_at, title: `Discharged from ${a.hospital_name}`, sub: undefined, status: undefined }] : []),
    ]),
  ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime()).slice(0, 6);

  return (
    <Section icon={<History />} title="Recent care activity">
      {loading ? <LoadingBlock rows={3} /> : error ? (
        <ErrorState status={error.status} description={friendlyError(error.status)} onRetry={() => { requests.refetch(); admissions.refetch(); }} />
      ) : events.length === 0 ? (
        <EmptyState icon={<History className="h-5 w-5" />} title="No care activity yet" description="Requests and hospital stays will be listed here as they happen." />
      ) : (
        <ul className="divide-y divide-border">
          {events.map((e) => (
            <li key={e.key} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{e.title}</p>
                <p className="truncate text-xs text-muted">{formatDateTime(e.at)}{e.sub ? ` · ${e.sub}` : ''}</p>
              </div>
              {e.status && <StatusBadge kind="request" value={e.status} />}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function NotificationsCard({ notifications }: { notifications: Async<{ results: Notification[] }> }) {
  const empty = <EmptyState icon={<Bell className="h-5 w-5" />} title="You're all caught up" description="New updates about your care will appear here." />;
  return (
    <Section icon={<Bell />} title="Important notifications" action={<Link href="/notifications" className="text-xs font-medium text-brand-dark hover:underline">View all</Link>}>
      <Body state={notifications} empty={empty}>
        {({ results }) => results.length === 0 ? empty : (
          <ul className="divide-y divide-border">
            {results.slice(0, 4).map((n) => (
              <li key={n.id} className="flex gap-3 px-5 py-3.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-border' : 'bg-brand'}`} aria-label={n.is_read ? 'Read' : 'Unread'} />
                <div className="min-w-0">
                  <p className={`truncate text-sm ${n.is_read ? 'text-foreground/80' : 'font-semibold'}`}>{n.title}</p>
                  {n.body && <p className="line-clamp-2 text-xs text-muted">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-muted">{formatDateTime(n.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Body>
    </Section>
  );
}

const ACCESS_ACTION = { href: '/portal/access-requests', label: 'Access requests', icon: ShieldCheck };
const ACTIONS = [
  { href: '/portal/profile', label: 'My profile', icon: UserRound },
  { href: '/portal/documents', label: 'Documents', icon: FileText },
  { href: '/portal/consents', label: 'Consents', icon: FileCheck2 },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

export function QuickActions({ showAccessRequests = false }: { showAccessRequests?: boolean }) {
  const actions = showAccessRequests ? [...ACTIONS.slice(0, 3), ACCESS_ACTION, ACTIONS[3]] : ACTIONS;
  return (
    <div className={`grid grid-cols-2 gap-3 [&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1 ${showAccessRequests ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
      {actions.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint text-brand-dark group-hover:bg-brand group-hover:text-white"><Icon className="h-4 w-4" /></span>
          <span className="text-sm font-medium">{label}</span>
        </Link>
      ))}
    </div>
  );
}
