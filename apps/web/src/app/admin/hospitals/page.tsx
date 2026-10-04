'use client';

import { Hospital } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/lib/useApi';
import { hospitalsApi } from '@/lib/api';
import { friendlyError } from '@/lib/format';
import { Card } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { MoreNotice } from '@/components/ui/FilterPills';

export default function AdminHospitalsPage() {
  const { user } = useAuth();
  const mine = user?.staff_profile?.hospital_id;
  const hospitals = useApi(() => hospitalsApi.list());
  const rows = hospitals.data?.results ?? [];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Hospitals</h1>
        <p className="mt-0.5 text-sm text-muted">Every active hospital on LifeLink is listed so referrals can be matched. You administer only your own hospital&rsquo;s staff and departments.</p>
      </div>
      <Card>
        {hospitals.loading ? <LoadingBlock rows={4} /> : hospitals.error ? <ErrorState status={hospitals.error.status} description={friendlyError(hospitals.error.status)} onRetry={hospitals.refetch} />
          : rows.length === 0 ? <EmptyState icon={<Hospital className="h-5 w-5" />} title="No hospitals" description="No active hospitals are registered." />
          : (
            <ul className="divide-y divide-border">
              {rows.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-dark"><Hospital className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{h.name}</p><p className="truncate text-xs text-muted">{[h.address, h.city].filter(Boolean).join(', ') || 'Location not recorded'}</p></div>
                  </div>
                  <div className="flex items-center gap-2"><span className="font-mono text-xs text-muted">{h.code}</span>{h.id === mine && <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-white">Your hospital</span>}</div>
                </li>
              ))}
            </ul>
          )}
        {hospitals.data?.next && <MoreNotice shown={rows.length} />}
      </Card>
    </div>
  );
}
