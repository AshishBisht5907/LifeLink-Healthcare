'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/api';
import { friendlyError } from '@/lib/format';
import { Card } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MoreNotice } from '@/components/ui/FilterPills';

export default function AdminManagementPage() {
  const staff = useApi(() => staffApi.list());
  // Provisioning creates a Management account when the staff role is "Care Coordinator".
  const rows = (staff.data?.results ?? []).filter((s) => s.staff_role === 'COORDINATOR');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Management</h1>
        <p className="mt-0.5 text-sm text-muted">Hospital management accounts (created with the Care Coordinator role). To add, activate or deactivate one, use <Link href="/admin/staff" className="font-medium text-brand-dark hover:underline">Staff</Link>.</p>
      </div>
      <Card>
        {staff.loading ? <LoadingBlock rows={3} /> : staff.error ? <ErrorState status={staff.error.status} description={friendlyError(staff.error.status)} onRetry={staff.refetch} />
          : rows.length === 0 ? <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No management accounts" description="Provision a Care Coordinator from the Staff page to create one." />
          : (
            <ul className="divide-y divide-border">
              {rows.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{s.username}</p><p className="truncate text-xs text-muted">{s.job_title || 'Care Coordinator'} · {s.employee_id}</p></div>
                  <StatusBadge kind="generic" value={s.is_active ? 'VERIFIED' : 'REJECTED'} label={s.is_active ? 'Active' : 'Deactivated'} />
                </li>
              ))}
            </ul>
          )}
        {staff.data?.next && <MoreNotice shown={staff.data.results.length} />}
      </Card>
    </div>
  );
}
