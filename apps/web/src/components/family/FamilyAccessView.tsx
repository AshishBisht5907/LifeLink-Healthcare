'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Info, LockKeyhole, PauseCircle, PlayCircle, Unlock, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/lib/useApi';
import { consentsApi, patientsApi } from '@/lib/api';
import { useLinkedPatients } from '@/lib/useMyPatient';
import { explainFamilyAccess, latestConsentStatus, type FamilyAccessKind } from '@/lib/familyAccess';
import { serverMessage } from '@/lib/errorMessages';
import { formatDate, friendlyError } from '@/lib/format';
import { Button, Card, CardHeader } from '@/components/ui/Primitives';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import type { FamilyRelationship } from '@/lib/types';

const LEVEL: Record<string, string> = { FULL_REPRESENTATIVE: 'Full representative', UPDATES_ONLY: 'Updates only', LIMITED: 'Limited' };
const TONE: Record<FamilyAccessKind, string> = {
  ACTIVE: 'bg-success-tint text-success', PAUSED: 'bg-neutral-tint text-muted', UPDATES_ONLY: 'bg-info-tint text-info',
  NO_CONSENT: 'bg-warning-tint text-warning', CONSENT_PENDING: 'bg-warning-tint text-warning', CONSENT_DECLINED: 'bg-danger-tint text-danger',
};

export function FamilyAccessView() {
  const { user } = useAuth();
  const isPatient = user?.role === 'PATIENT';
  const toast = useToast();
  const { patients, loading: pLoading, failed, refetch: refetchPatients } = useLinkedPatients();
  const ownId = isPatient ? patients[0]?.id : undefined;

  // Patient: links about their record. Family: their own links. The backend scopes both.
  const links = useApi(() => (isPatient ? patientsApi.familyLinksForPatient(ownId!) : patientsApi.familyLinks()), [isPatient, ownId], !pLoading && (!isPatient || !!ownId));
  const consents = useApi(() => consentsApi.list(), [], !pLoading);

  const [target, setTarget] = useState<FamilyRelationship | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (pLoading || links.loading || consents.loading) return <LoadingBlock rows={4} />;
  if (failed) return <Card><ErrorState description={friendlyError()} onRetry={refetchPatients} /></Card>;
  if (links.error) return <Card><ErrorState status={links.error.status} description={friendlyError(links.error.status)} onRetry={links.refetch} /></Card>;

  const rows = links.data?.results ?? [];
  const nameOf = (patientId: string) => patients.find((p) => p.id === patientId)?.full_name ?? 'Linked patient';

  async function toggle() {
    if (!target) return;
    setBusy(true); setError('');
    try {
      await patientsApi.setFamilyLinkActive(target.id, !target.is_active);
      toast.show('success', target.is_active ? 'Family access paused' : 'Family access restored', target.family_username);
      setTarget(null);
      links.refetch(); // show what the server stored
    } catch (err) { setError(serverMessage(err)); links.refetch(); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Family access</h1>
        <p className="mt-0.5 text-sm text-muted">{isPatient ? 'Who is linked to your record, and whether they can open it.' : 'The patients you are linked to, and whether you can open their record.'}</p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-tint px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div className="space-y-1">
          <p className="font-medium">A family member can open the record only when all three are true:</p>
          <p className="text-foreground/80">the link is switched on, their access level is Full representative, and the patient&rsquo;s most recent <Link href="/portal/consents" className="font-medium text-brand-dark underline">consent</Link> is approved.</p>
        </div>
      </div>

      <Card>
        <CardHeader title={isPatient ? 'People linked to you' : 'Your links'} subtitle={rows.length ? `${rows.length} ${rows.length === 1 ? 'link' : 'links'}` : undefined} />
        {rows.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title={isPatient ? 'No family members linked' : 'You are not linked to any patient'}
            description={isPatient ? 'Linking a family member is not available from this screen yet. Ask your hospital to link their account.' : 'A hospital or the patient must link your account first.'} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((l) => {
              const ex = explainFamilyAccess(l, latestConsentStatus(consents.data?.results ?? [], l.patient));
              return (
                <li key={l.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{isPatient ? l.family_username : nameOf(l.patient)}</p>
                      <p className="text-xs text-muted">{l.relationship_type} · {LEVEL[l.access_level] ?? l.access_level} · linked {formatDate(l.created_at)}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${TONE[ex.kind]}`}>
                      {ex.canViewRecord ? <Unlock className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}{ex.title}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{ex.detail}</p>
                  {isPatient && (
                    <Button size="sm" variant="secondary" className={l.is_active ? 'border-danger/40 text-danger hover:bg-danger-tint' : ''} onClick={() => { setError(''); setTarget(l); }}>
                      {l.is_active ? <><PauseCircle className="h-3.5 w-3.5" /> Pause access</> : <><PlayCircle className="h-3.5 w-3.5" /> Restore access</>}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Dialog open={!!target} onClose={() => setTarget(null)} busy={busy} title={target?.is_active ? 'Pause family access?' : 'Restore family access?'}>
        {target && (
          <div className="space-y-4">
            <p className="text-sm text-foreground/80">
              {target.is_active
                ? `${target.family_username} will stop seeing your care information straight away. You can restore this at any time.`
                : `${target.family_username} will be able to see your record again if your access level and consent allow it.`}
            </p>
            {error && <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setTarget(null)} disabled={busy}>Cancel</Button>
              <Button variant={target.is_active ? 'danger' : 'primary'} loading={busy} onClick={toggle}>{target.is_active ? 'Pause access' : 'Restore access'}</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
