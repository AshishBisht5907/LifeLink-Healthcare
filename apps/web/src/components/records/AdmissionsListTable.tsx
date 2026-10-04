import Link from 'next/link';
import type { AdmissionListItem } from '@/lib/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/States';
import { Users } from 'lucide-react';

export function AdmissionsListTable({ admissions, detailBase }: { admissions: AdmissionListItem[]; detailBase: string }) {
  if (admissions.length === 0) {
    return <EmptyState icon={<Users className="h-5 w-5" />} title="No admissions" description="Active admissions at your hospital will appear here." />;
  }
  return (
    <ul className="divide-y divide-border">
      {admissions.map((a) => (
        <li key={a.id}>
          <Link href={`${detailBase}/${a.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-neutral-tint">
            <div>
              <p className="text-sm font-medium text-foreground">{a.patient_name}</p>
              <p className="text-xs text-muted">{a.admission_number} · admitted {new Date(a.admitted_at).toLocaleDateString()}</p>
            </div>
            <StatusBadge kind="generic" value={a.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
