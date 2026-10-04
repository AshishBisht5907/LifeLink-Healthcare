import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/ui/States';
import { formatDateTime } from '@/lib/format';
import { ACCESS_LABEL, kindOfGrant } from '@/lib/accessState';
import type { PatientAccessGrant } from '@/lib/types';
import { AccessStatusBadge } from './AccessStatusBadge';

/** The signed-in Management user's own access requests and emergency access, as the server reports them. */
export function AccessRequestsList({ grants, limit }: { grants: PatientAccessGrant[]; limit?: number }) {
  const rows = limit ? grants.slice(0, limit) : grants;
  if (rows.length === 0) {
    return <EmptyState icon={<ShieldAlert className="h-5 w-5" />} title="No access requests yet" description="Requests and emergency access you make will be listed here with their status." />;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((g) => {
        const kind = kindOfGrant(g);
        return (
          <li key={g.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <span className="font-mono">{g.lifelink_patient_id}</span>
                {g.grant_type === 'EMERGENCY' && <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">Emergency</span>}
              </p>
              <p className="truncate text-xs text-muted" title={g.reason}>{g.reason}</p>
              <p className="text-[11px] text-muted">
                Requested {formatDateTime(g.created_at)}
                {g.expires_at && (kind === 'APPROVED' || kind === 'EMERGENCY' ? ` · ends ${formatDateTime(g.expires_at)}` : ` · ended ${formatDateTime(g.expires_at)}`)}
              </p>
            </div>
            <span title={ACCESS_LABEL[kind]}><AccessStatusBadge kind={kind} /></span>
          </li>
        );
      })}
    </ul>
  );
}
