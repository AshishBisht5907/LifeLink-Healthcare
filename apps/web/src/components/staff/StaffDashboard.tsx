'use client';

import Link from 'next/link';
import { AlertTriangle, BedDouble, CheckCircle2, ClipboardList, Hourglass, Info, PlayCircle, UserCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/lib/useApi';
import { admissionsApi, notificationsApi, requestsApi } from '@/lib/api';
import { filterRequests, isResolved, mineOnly, openRequests, requestCounts, sortRequests, tally } from '@/lib/listViews';
import { friendlyError } from '@/lib/format';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { StatTile } from '@/components/ui/StatTile';
import { NotificationsCard, Section } from '@/components/portal/DashboardCards';
import { ServiceRequestList } from '@/components/records/ServiceRequestList';

const VIEW_ALL = 'text-xs font-medium text-brand-dark hover:underline';

export function StaffDashboard() {
  const { user } = useAuth();
  const sp = user?.staff_profile;
  const dept = sp?.department ?? null;

  const requests = useApi(() => requestsApi.list());
  const admissions = useApi(() => admissionsApi.list());
  const notifications = useApi(() => notificationsApi.list());

  const all = requests.data?.results ?? [];
  const counts = requestCounts(all);
  const mineOpen = openRequests(mineOnly(all, user?.id));
  const needsAction = openRequests(filterRequests(all, 'NEEDS_ACTION'));
  const resolved = sortRequests(all).filter(isResolved).slice(0, 5);
  const activeAdmissions = tally(admissions.data, (a) => a.status === 'ACTIVE');
  const partial = !!requests.data?.next; // counts below cover the loaded page only

  const list = (items: typeof all, empty: string, interactive = true) => (
    requests.loading ? <LoadingBlock rows={3} />
      : requests.error ? <ErrorState status={requests.error.status} description={friendlyError(requests.error.status)} onRetry={requests.refetch} />
      : <ServiceRequestList requests={items.slice(0, 5)} interactive={interactive} viewerDepartmentName={dept} onChanged={requests.refetch} emptyMessage={empty} />
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-dark">{dept ? `Staff \u00B7 ${dept}` : 'Hospital staff'}</p>
        <h1 className="text-2xl font-semibold">{dept ?? 'My work'}</h1>
        <p className="mt-0.5 text-sm text-muted">{[sp?.hospital, sp?.job_title].filter(Boolean).join(' \u00B7 ')}</p>
      </div>

      {!dept && (
        <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-tint px-4 py-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p>You are not assigned to a department, so you see requests across your hospital. Ask your administrator to assign you to a department to focus your queue.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile href="/staff/requests" icon={<Hourglass />} label="Needs action" value={requests.data ? `${counts.NEEDS_ACTION}${partial ? '+' : ''}` : null} loading={requests.loading} />
        <StatTile href="/staff/requests" icon={<AlertTriangle />} label="Urgent" value={requests.data ? `${counts.URGENT}${partial ? '+' : ''}` : null} loading={requests.loading} urgent />
        <StatTile href="/staff/requests" icon={<PlayCircle />} label="In progress" value={requests.data ? `${counts.IN_PROGRESS}${partial ? '+' : ''}` : null} loading={requests.loading} />
        <StatTile href="/staff/requests" icon={<UserCheck />} label="My open requests" value={requests.data ? `${mineOpen.length}${partial ? '+' : ''}` : null} loading={requests.loading} />
        <StatTile href="/staff/admissions" icon={<BedDouble />} label="Active admissions" value={activeAdmissions} loading={admissions.loading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={<Hourglass />} title={dept ? `${dept} queue \u2014 needs action` : 'Queue \u2014 needs action'} action={<Link href="/staff/requests" className={VIEW_ALL}>Open full queue</Link>}>
          {list(needsAction, 'Nothing is waiting for action.')}
        </Section>
        <Section icon={<UserCheck />} title="My requests" action={<Link href="/staff/requests" className={VIEW_ALL}>View all</Link>}>
          {list(mineOpen, 'No open requests are assigned to you or created by you.')}
        </Section>
        <NotificationsCard notifications={notifications} />
        <Section icon={<CheckCircle2 />} title="Recently resolved">
          {list(resolved, 'Completed, cancelled and rejected requests will appear here.', false)}
        </Section>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted"><ClipboardList className="h-3.5 w-3.5" />You only see requests the system routes to your department, plus ones you created.{partial && ' Counts cover the most recent items loaded.'}</p>
    </div>
  );
}
