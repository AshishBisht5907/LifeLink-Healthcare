'use client';

import Link from 'next/link';
import { Activity, AlertTriangle, ArrowLeftRight, BedDouble, Bell, Building2, ClipboardList, Gauge, ShieldAlert, Siren } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/lib/useApi';
import { accessApi, admissionsApi, auditApi, hospitalsApi, notificationsApi, referralsApi, requestsApi } from '@/lib/api';
import { formatDateTime, friendlyError } from '@/lib/format';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, NotificationsCard, Section, type Async } from '@/components/portal/DashboardCards';
import { StatTile } from '@/components/ui/StatTile';
import { tally } from '@/lib/listViews';
import { AccessRequestsList } from '@/components/access/AccessRequestsList';
import type { AuditLogEntry, Paginated } from '@/lib/types';

const ACTIVE_REQUEST = new Set(['REQUESTED', 'PENDING', 'APPROVAL_REQUIRED', 'APPROVED', 'READY', 'IN_PROGRESS']);
const RESOURCE_LABEL: Record<string, string> = { ICU_BED: 'ICU beds', GENERAL_BED: 'General beds', OT_SLOT: 'OT slots', CARDIOLOGIST: 'Cardiologists', VENTILATOR: 'Ventilators' };

const actionText = (a: string) => { const t = a.replace(/_/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

export function CommandCenterOverview() {
  const { user } = useAuth();
  const hospitalId = user?.staff_profile?.hospital_id;
  const hospitalName = user?.staff_profile?.hospital;

  const admissions = useApi(() => admissionsApi.list());
  const requests = useApi(() => requestsApi.list());
  const referrals = useApi(() => referralsApi.list());
  const capacity = useApi(() => hospitalsApi.capacity(hospitalId), [hospitalId], !!hospitalId);
  const departments = useApi(() => hospitalsApi.departments(hospitalId), [hospitalId], !!hospitalId);
  const grants = useApi(() => accessApi.list());
  const audit = useApi(() => auditApi.list());
  const emergencyAudit = useApi(() => auditApi.list({ action: 'EMERGENCY_ACCESS_GRANTED' }));
  const notifications = useApi(() => notificationsApi.list());

  const activeAdmissions = tally(admissions.data, (a) => a.status === 'ACTIVE');
  const pendingRequests = tally(requests.data, (r) => ['REQUESTED', 'PENDING', 'APPROVAL_REQUIRED'].includes(r.status));
  const urgentRequests = tally(requests.data, (r) => ACTIVE_REQUEST.has(r.status) && (r.priority === 'EMERGENCY' || r.priority === 'HIGH'));
  const pendingReferrals = tally(referrals.data, (r) => r.status === 'PENDING');
  const openGrants = grants.data ? String(grants.data.filter((g) => g.status === 'PENDING').length) : null;
  const unread = notifications.data ? String(notifications.data.results.filter((n) => !n.is_read).length) : null;

  const workload = new Map<string, number>();
  (requests.data?.results ?? []).filter((r) => ACTIVE_REQUEST.has(r.status) && r.department_name).forEach((r) => workload.set(r.department_name!, (workload.get(r.department_name!) ?? 0) + 1));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-dark">Hospital management</p>
        <h1 className="text-2xl font-semibold">{hospitalName ?? 'Command Center'}</h1>
        <p className="mt-0.5 text-sm text-muted">Live view of your hospital. Numbers come straight from LifeLink records.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile href="/management/admissions" icon={<BedDouble />} label="Active admissions" value={activeAdmissions} loading={admissions.loading} />
        <StatTile href="/management/requests" icon={<ClipboardList />} label="Pending requests" value={pendingRequests} loading={requests.loading} />
        <StatTile href="/management/requests" icon={<AlertTriangle />} label="Urgent requests" value={urgentRequests} loading={requests.loading} urgent />
        <StatTile href="/management/referrals" icon={<ArrowLeftRight />} label="Referrals awaiting reply" value={pendingReferrals} loading={referrals.loading} />
        <StatTile href="/management/patients" icon={<ShieldAlert />} label="Access requests pending" value={openGrants} loading={grants.loading} />
        <StatTile href="/notifications" icon={<Bell />} label="Unread notifications" value={unread} loading={notifications.loading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={<Siren />} title="Emergency access activity" action={<span className="text-[11px] font-medium text-muted">Audited</span>}>
          <Body state={emergencyAudit as Async<Paginated<AuditLogEntry>>} empty={<EmptyState title="No emergency access" description="Any emergency access used at your hospital will be listed here." />}>
            {(page) => page.results.length === 0
              ? <EmptyState icon={<Siren className="h-5 w-5" />} title="No emergency access" description="Any emergency access used at your hospital will be listed here." />
              : (
                <ul className="divide-y divide-border">
                  {page.results.slice(0, 5).map((e) => (
                    <li key={e.id} className="px-5 py-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium">{e.actor_username ?? 'Unknown user'}</p>
                        <span className="shrink-0 text-[11px] text-muted">{formatDateTime(e.created_at)}</span>
                      </div>
                      {typeof e.context?.reason === 'string' && <p className="truncate text-xs text-muted" title={e.context.reason}>{e.context.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
          </Body>
        </Section>

        <Section icon={<ShieldAlert />} title="Your patient access requests" action={<Link href="/management/patients" className="text-xs font-medium text-brand-dark hover:underline">Find a patient</Link>}>
          {grants.loading ? <LoadingBlock rows={3} /> : grants.error
            ? <ErrorState status={grants.error.status} description={friendlyError(grants.error.status)} onRetry={grants.refetch} />
            : <AccessRequestsList grants={grants.data ?? []} limit={5} />}
        </Section>

        <Section icon={<Gauge />} title="Capacity" action={<Link href="/management/capacity" className="text-xs font-medium text-brand-dark hover:underline">Manage</Link>}>
          <Body state={capacity} empty={<EmptyState title="No capacity recorded" description="Set resource totals on the Capacity page." />}>
            {({ results }) => results.length === 0
              ? <EmptyState icon={<Gauge className="h-5 w-5" />} title="No capacity recorded" description="Set resource totals on the Capacity page." />
              : (
                <ul className="space-y-4 p-5">
                  {results.map((c) => {
                    const pct = c.total > 0 ? Math.round((c.available / c.total) * 100) : null;
                    const bar = pct === null ? 'bg-border' : pct <= 10 ? 'bg-danger' : pct <= 30 ? 'bg-warning' : 'bg-brand';
                    return (
                      <li key={c.id}>
                        <div className="mb-1 flex items-baseline justify-between text-sm">
                          <span className="font-medium">{RESOURCE_LABEL[c.resource_type] ?? c.resource_type}</span>
                          <span className="tabular-nums text-muted">{c.available} of {c.total} free</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-neutral-tint" role="img" aria-label={`${c.available} of ${c.total} available`}>
                          <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct ?? 0}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
          </Body>
        </Section>

        <Section icon={<Building2 />} title="Departments">
          <Body state={departments} empty={<EmptyState title="No departments" description="Departments are set up by your system administrator." />}>
            {({ results }) => results.length === 0
              ? <EmptyState icon={<Building2 className="h-5 w-5" />} title="No departments" description="Departments are set up by your system administrator." />
              : (
                <ul className="divide-y divide-border">
                  {results.map((d) => {
                    const open = workload.get(d.name) ?? 0;
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${open ? 'bg-brand-tint text-brand-dark' : 'bg-neutral-tint text-muted'}`}>{open} open {open === 1 ? 'request' : 'requests'}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
          </Body>
        </Section>

        <Section icon={<ArrowLeftRight />} title="Referrals" action={<Link href="/management/referrals" className="text-xs font-medium text-brand-dark hover:underline">View all</Link>}>
          <Body state={referrals} empty={<EmptyState title="No referrals" description="Referrals to and from your hospital will appear here." />}>
            {({ results }) => results.length === 0
              ? <EmptyState icon={<ArrowLeftRight className="h-5 w-5" />} title="No referrals" description="Referrals to and from your hospital will appear here." />
              : (
                <ul className="divide-y divide-border">
                  {results.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{r.from_hospital_name} → {r.to_hospital_name}</p><p className="text-xs text-muted">{formatDateTime(r.created_at)}</p></div>
                      <StatusBadge kind="referral" value={r.status} />
                    </li>
                  ))}
                </ul>
              )}
          </Body>
        </Section>

        <NotificationsCard notifications={notifications} />
      </div>

      <Section icon={<Activity />} title="Recent activity" action={<span className="text-[11px] text-muted">From the audit log</span>}>
        <Body state={audit} empty={<EmptyState title="No recorded activity" description="Actions taken in your hospital are recorded here." />}>
          {({ results }) => results.length === 0
            ? <EmptyState icon={<Activity className="h-5 w-5" />} title="No recorded activity" description="Actions taken in your hospital are recorded here." />
            : (
              <ul className="divide-y divide-border">
                {results.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{actionText(e.action)}</p>
                      <p className="truncate text-xs text-muted">{e.actor_username ?? 'System'} · {e.actor_role.replace(/_/g, ' ').toLowerCase()}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {e.result !== 'SUCCESS' && <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[10px] font-semibold uppercase text-danger">{e.result}</span>}
                      <span className="text-[11px] text-muted">{formatDateTime(e.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </Body>
      </Section>
    </div>
  );
}
