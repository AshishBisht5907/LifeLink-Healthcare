'use client';

import { useState } from 'react';
import { AlertTriangle, Hourglass, PauseCircle, PlayCircle } from 'lucide-react';
import type { ServiceRequest } from '@/lib/types';
import { Card } from '@/components/ui/Primitives';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { FilterPills, MoreNotice } from '@/components/ui/FilterPills';
import { ServiceRequestList } from './ServiceRequestList';
import { filterRequests, mineOnly, requestCounts, sortRequests, type RequestGroup } from '@/lib/listViews';
import { friendlyError } from '@/lib/format';

type Viewer = 'management' | 'staff' | 'patient' | 'admin';

interface Props {
  requests: ServiceRequest[];
  loading: boolean;
  error: { status: number } | null;
  refetch: () => void;
  hasMore?: boolean;
  viewer: Viewer;
  userId?: string | null;
  departmentName?: string | null;
}

function Stat({ icon, label, value, danger }: { icon: React.ReactNode; label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg [&>svg]:h-3.5 [&>svg]:w-3.5 ${danger && value > 0 ? 'bg-danger-tint text-danger' : 'bg-brand-tint text-brand-dark'}`}>{icon}</span>
      <p className={`mt-2 text-xl font-semibold tabular-nums ${danger && value > 0 ? 'text-danger' : ''}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

export function RequestsView({ requests, loading, error, refetch, hasMore, viewer, userId, departmentName }: Props) {
  const [group, setGroup] = useState<RequestGroup>(viewer === 'patient' ? 'ALL' : 'NEEDS_ACTION');
  const [scope, setScope] = useState<'QUEUE' | 'MINE'>('QUEUE');

  if (loading) return <LoadingBlock rows={5} />;
  if (error) return <Card><ErrorState status={error.status} description={friendlyError(error.status)} onRetry={refetch} /></Card>;

  const base = viewer === 'staff' && scope === 'MINE' ? mineOnly(requests, userId) : requests;
  const counts = requestCounts(base);
  const shown = sortRequests(filterRequests(base, group));
  const staffOrMgmt = viewer !== 'patient';
  // Admin is an administrative role, not a clinical one: it sees the same board but can act on nothing.
  const canAct = viewer === 'management' || viewer === 'staff';

  return (
    <div className="space-y-4">
      {staffOrMgmt && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={<Hourglass />} label="Needs action" value={counts.NEEDS_ACTION} />
          <Stat icon={<AlertTriangle />} label="Urgent" value={counts.URGENT} danger />
          <Stat icon={<PlayCircle />} label="In progress" value={counts.IN_PROGRESS} />
          <Stat icon={<PauseCircle />} label="On hold" value={counts.ON_HOLD} />
        </div>
      )}

      {viewer === 'staff' && (
        <FilterPills label="Queue scope" value={scope} onChange={setScope}
          options={[{ value: 'QUEUE', label: departmentName ? `${departmentName} queue` : 'Department queue', count: requests.length }, { value: 'MINE', label: 'My requests', count: mineOnly(requests, userId).length }]} />
      )}

      <FilterPills label="Request status" value={group} onChange={setGroup}
        options={[
          { value: 'ALL', label: 'All', count: counts.ALL },
          { value: 'NEEDS_ACTION', label: 'Needs action', count: counts.NEEDS_ACTION },
          { value: 'IN_PROGRESS', label: 'In progress', count: counts.IN_PROGRESS },
          { value: 'ON_HOLD', label: 'On hold', count: counts.ON_HOLD },
          { value: 'RESOLVED', label: 'Resolved', count: counts.RESOLVED },
        ]} />

      <Card>
        <ServiceRequestList
          requests={shown}
          interactive={canAct}
          showPatientName={staffOrMgmt}
          viewerIsManagementOrAdmin={viewer === 'management'}
          viewerDepartmentName={viewer === 'staff' ? departmentName : null}
          onChanged={refetch}
          emptyMessage={group === 'ALL' ? 'Nothing here yet.' : 'No requests in this view.'}
        />
        {hasMore && <MoreNotice shown={requests.length} />}
      </Card>
    </div>
  );
}
