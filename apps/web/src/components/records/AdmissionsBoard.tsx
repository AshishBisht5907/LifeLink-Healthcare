'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BedDouble, Search } from 'lucide-react';
import type { AdmissionListItem } from '@/lib/types';
import { Card, Input } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { FilterPills, MoreNotice } from '@/components/ui/FilterPills';
import { admissionCounts, filterAdmissions, type AdmissionGroup } from '@/lib/listViews';
import { formatDate, friendlyError } from '@/lib/format';

const STATUS_UI: Record<AdmissionListItem['status'], { label: string; cls: string }> = {
  ACTIVE: { label: 'Admitted', cls: 'bg-success-tint text-success' },
  DISCHARGED: { label: 'Discharged', cls: 'bg-neutral-tint text-muted' },
  TRANSFERRED: { label: 'Transferred', cls: 'bg-info-tint text-info' },
};

export function AdmissionRows({ admissions, detailBase, showPatient = true }: { admissions: AdmissionListItem[]; detailBase?: string; showPatient?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {admissions.map((a) => {
        const ui = STATUS_UI[a.status];
        const body = (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{showPatient ? a.patient_name : a.hospital_name}</p>
              <p className="text-xs text-muted">{showPatient ? `${a.admission_number} · ` : `Admission ${a.admission_number} · `}Admitted {formatDate(a.admitted_at)}{a.discharged_at ? ` · ${a.status === 'TRANSFERRED' ? 'Left' : 'Discharged'} ${formatDate(a.discharged_at)}` : ''}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ui.cls}`}>{ui.label}</span>
          </div>
        );
        return <li key={a.id}>{detailBase ? <Link href={`${detailBase}/${a.id}`} className="block px-5 py-4 hover:bg-neutral-tint">{body}</Link> : <div className="px-5 py-4">{body}</div>}</li>;
      })}
    </ul>
  );
}

interface Props {
  admissions: AdmissionListItem[]; loading: boolean; error: { status: number } | null; refetch: () => void;
  detailBase?: string; hasMore?: boolean; emptyHint: string; action?: React.ReactNode;
}

export function AdmissionsBoard({ admissions, loading, error, refetch, detailBase, hasMore, emptyHint, action }: Props) {
  const [group, setGroup] = useState<AdmissionGroup>('ACTIVE');
  const [query, setQuery] = useState('');
  if (loading) return <LoadingBlock rows={5} />;
  if (error) return <Card><ErrorState status={error.status} description={friendlyError(error.status)} onRetry={refetch} /></Card>;

  const c = admissionCounts(admissions);
  const rows = filterAdmissions(admissions, group, query);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterPills label="Admission status" value={group} onChange={setGroup}
          options={[{ value: 'ACTIVE', label: 'Active', count: c.ACTIVE }, { value: 'DISCHARGED', label: 'Discharged', count: c.DISCHARGED }, { value: 'TRANSFERRED', label: 'Transferred', count: c.TRANSFERRED }, { value: 'ALL', label: 'All', count: c.ALL }]} />
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or admission no." aria-label="Search admissions" />
        </div>
      </div>
      <Card>
        {rows.length === 0
          ? <EmptyState icon={<BedDouble className="h-5 w-5" />} title={admissions.length === 0 ? 'No admissions yet' : 'No admissions match'} description={admissions.length === 0 ? emptyHint : 'Try another status or search term.'} />
          : <AdmissionRows admissions={rows} detailBase={detailBase} />}
        {hasMore && <MoreNotice shown={admissions.length} />}
      </Card>
      {action}
    </div>
  );
}
