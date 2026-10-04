'use client';

import Link from 'next/link';
import { Activity, AlertTriangle, ArrowLeftRight, BedDouble, Building2, ClipboardList, Hospital, UserCog, UserX } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/lib/useApi';
import { admissionsApi, auditApi, hospitalsApi, notificationsApi, referralsApi, requestsApi, staffApi } from '@/lib/api';
import { isResolved, tally } from '@/lib/listViews';
import { formatDateTime } from '@/lib/format';
import { EmptyState } from '@/components/ui/States';
import { StatTile } from '@/components/ui/StatTile';
import { Body, NotificationsCard, Section } from '@/components/portal/DashboardCards';

const actionText = (a: string) => { const t = a.replace(/_/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const hospitalId = user?.staff_profile?.hospital_id;

  const hospitals = useApi(() => hospitalsApi.list());
  const staff = useApi(() => staffApi.list());
  const departments = useApi(() => hospitalsApi.departments(hospitalId), [hospitalId], !!hospitalId);
  const admissions = useApi(() => admissionsApi.list());
  const requests = useApi(() => requestsApi.list());
  const referrals = useApi(() => referralsApi.list());
  const audit = useApi(() => auditApi.list());
  const notifications = useApi(() => notificationsApi.list());

  const hospital = hospitals.data?.results.find((h) => h.id === hospitalId);
  const staffRows = staff.data?.results ?? [];
  const staffComplete = !!staff.data && !staff.data.next;
  const activeStaff = staffRows.filter((s) => s.is_active).length;
  const inactive = staffRows.filter((s) => !s.is_active);

  // Staff per department: shown only when the whole list was loaded, so the numbers are never partial.
  const perDept = new Map<string, number>();
  staffRows.filter((s) => s.is_active).forEach((s) => { const k = s.department_name ?? 'No department'; perDept.set(k, (perDept.get(k) ?? 0) + 1); });

  const denied = audit.data?.results.filter((a) => a.result !== 'SUCCESS').length ?? 0;
  const plus = (page: { next: string | null } | null) => (page?.next ? '+' : '');

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-dark">Administration</p>
        <h1 className="text-2xl font-semibold">{hospital?.name ?? user?.staff_profile?.hospital ?? 'System dashboard'}</h1>
        <p className="mt-0.5 text-sm text-muted">Staff, departments and activity for your hospital. Clinical decisions are made by care teams, not from here.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile href="/admin/staff" icon={<UserCog />} label="Active staff" value={staff.data ? `${activeStaff}${plus(staff.data)}` : null} loading={staff.loading} />
        <StatTile href="/admin/staff" icon={<UserX />} label="Deactivated staff" value={staff.data ? `${inactive.length}${plus(staff.data)}` : null} loading={staff.loading} />
        <StatTile href="/admin/departments" icon={<Building2 />} label="Departments" value={departments.data ? `${departments.data.count}` : null} loading={departments.loading} />
        <StatTile href="/admin/admissions" icon={<BedDouble />} label="Active admissions" value={tally(admissions.data, (a) => a.status === 'ACTIVE')} loading={admissions.loading} />
        <StatTile href="/admin/requests" icon={<ClipboardList />} label="Open requests" value={tally(requests.data, (r) => !isResolved(r))} loading={requests.loading} />
        <StatTile href="/admin/referrals" icon={<ArrowLeftRight />} label="Referrals awaiting reply" value={tally(referrals.data, (r) => r.status === 'PENDING')} loading={referrals.loading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={<Hospital />} title="Your hospital" action={<Link href="/admin/hospitals" className="text-xs font-medium text-brand-dark hover:underline">All hospitals</Link>}>
          <Body state={hospitals} empty={<EmptyState title="Hospital details unavailable" />}>
            {() => hospital ? (
              <dl className="grid gap-4 p-5 sm:grid-cols-2">
                <div><dt className="text-xs font-medium text-muted">Name</dt><dd className="text-sm font-semibold">{hospital.name}</dd></div>
                <div><dt className="text-xs font-medium text-muted">Code</dt><dd className="font-mono text-sm font-semibold">{hospital.code}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs font-medium text-muted">Location</dt><dd className="text-sm">{[hospital.address, hospital.city].filter(Boolean).join(', ') || 'Not recorded'}</dd></div>
              </dl>
            ) : <EmptyState icon={<Hospital className="h-5 w-5" />} title="Hospital details unavailable" description="Your hospital was not found in the hospital list." />}
          </Body>
        </Section>

        <Section icon={<UserCog />} title="Active staff by department" action={<Link href="/admin/staff" className="text-xs font-medium text-brand-dark hover:underline">Manage staff</Link>}>
          <Body state={staff} empty={<EmptyState title="No staff" />}>
            {() => !staffComplete ? <p className="p-5 text-sm text-muted">There are more staff than fit on one page, so a per-department breakdown is not shown. Open Staff for the full list.</p>
              : perDept.size === 0 ? <EmptyState icon={<UserCog className="h-5 w-5" />} title="No active staff" description="Provision accounts from the Staff page." />
              : (
                <ul className="divide-y divide-border">
                  {[...perDept.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
                    <li key={name} className="flex items-center justify-between gap-3 px-5 py-3"><span className="truncate text-sm font-medium">{name}</span><span className="shrink-0 rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-medium tabular-nums text-brand-dark">{n}</span></li>
                  ))}
                </ul>
              )}
          </Body>
        </Section>

        <Section icon={<Activity />} title="Recent activity" action={<Link href="/admin/audit" className="text-xs font-medium text-brand-dark hover:underline">Audit log</Link>}>
          <Body state={audit} empty={<EmptyState title="No recorded activity" />}>
            {({ results }) => results.length === 0 ? <EmptyState icon={<Activity className="h-5 w-5" />} title="No recorded activity" description="Actions are recorded here as they happen." /> : (
              <>
                {denied > 0 && <p className="flex items-center gap-1.5 border-b border-border bg-warning-tint px-5 py-2 text-xs"><AlertTriangle className="h-3.5 w-3.5 text-warning" />{denied} blocked or failed {denied === 1 ? 'action' : 'actions'} among the latest {results.length} events.</p>}
                <ul className="divide-y divide-border">
                  {results.slice(0, 6).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{actionText(a.action)}</p><p className="truncate text-xs text-muted">{a.actor_username ?? 'System'} · {formatDateTime(a.created_at)}</p></div>
                      {a.result !== 'SUCCESS' && <span className="shrink-0 rounded-full bg-danger-tint px-2 py-0.5 text-[10px] font-semibold uppercase text-danger">{a.result}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Body>
        </Section>

        <NotificationsCard notifications={notifications} />
      </div>
    </div>
  );
}
