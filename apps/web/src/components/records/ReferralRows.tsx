import Link from 'next/link';
import { ArrowRight, ArrowLeftRight } from 'lucide-react';
import type { Referral } from '@/lib/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/States';
import { formatDate } from '@/lib/format';
import { referralDirection } from '@/lib/listViews';

const sentence = (s: string) => { const t = s.replace(/_/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

/** One row per referral. `hospitalId` (staff/management only) adds an Incoming/Outgoing chip; `detailBase` makes rows clickable. */
export function ReferralRows({ referrals, hospitalId, detailBase, showPatient = true, emptyTitle, emptyHint }: {
  referrals: Referral[]; hospitalId?: string | null; detailBase?: string; showPatient?: boolean; emptyTitle: string; emptyHint: string;
}) {
  if (referrals.length === 0) return <EmptyState icon={<ArrowLeftRight className="h-5 w-5" />} title={emptyTitle} description={emptyHint} />;
  return (
    <ul className="divide-y divide-border">
      {referrals.map((r) => {
        const dir = referralDirection(r, hospitalId);
        const body = (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              {showPatient && <p className="truncate text-sm font-semibold">{r.patient_name}</p>}
              <p className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="font-medium">{r.from_hospital_name}</span><ArrowRight className="h-3.5 w-3.5 text-muted" /><span className="font-medium">{r.to_hospital_name}</span>
              </p>
              <p className="text-xs text-muted">
                {r.required_department_type ? `${sentence(r.required_department_type)} · ` : ''}Sent {formatDate(r.created_at)}
                {r.responded_at ? ` · Answered ${formatDate(r.responded_at)}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {dir && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${dir === 'OUTGOING' ? 'bg-brand-tint text-brand-dark' : 'bg-info-tint text-info'}`}>{dir === 'OUTGOING' ? 'Outgoing' : 'Incoming'}</span>}
              {r.priority && r.priority !== 'NORMAL' && <StatusBadge kind="priority" value={r.priority} />}
              <StatusBadge kind="referral" value={r.status} />
            </div>
          </div>
        );
        return <li key={r.id}>{detailBase ? <Link href={`${detailBase}/${r.id}`} className="block px-5 py-4 hover:bg-neutral-tint">{body}</Link> : <div className="px-5 py-4">{body}</div>}</li>;
      })}
    </ul>
  );
}
