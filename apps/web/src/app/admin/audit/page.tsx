'use client';

import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { auditApi } from '@/lib/api';
import { Card, Input } from '@/components/ui/Primitives';
import { LoadingBlock, ErrorState, EmptyState } from '@/components/ui/States';
import { ScrollText } from 'lucide-react';

export default function AdminAuditPage() {
  const [actionFilter, setActionFilter] = useState('');
  const audit = useApi(() => auditApi.list(actionFilter ? { action: actionFilter } : undefined), [actionFilter]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Audit Log</h1>
      <Input placeholder="Filter by action (e.g. LOGIN_SUCCESS, REQUEST_STATUS_CHANGED)..." value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="max-w-md" />

      <Card>
        {audit.loading ? (
          <LoadingBlock rows={6} />
        ) : audit.error ? (
          <ErrorState status={audit.error.status} onRetry={audit.refetch} />
        ) : audit.data && audit.data.results.length > 0 ? (
          <ul className="divide-y divide-border">
            {audit.data.results.map((a) => (
              <li key={a.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{a.action.replaceAll('_', ' ')}</p>
                  <span className={`text-xs font-medium ${a.result === 'DENIED' ? 'text-danger' : a.result === 'ERROR' ? 'text-warning' : 'text-muted'}`}>{a.result}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {a.actor_username ?? 'system'} ({a.actor_role || '—'}) · {new Date(a.created_at).toLocaleString()}
                  {a.target_description && <> · {a.target_description}</>}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No audit events match" />
        )}
      </Card>
    </div>
  );
}
