'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/lib/useApi';
import { patientsApi } from '@/lib/api';
import { useLinkedPatients } from '@/lib/useMyPatient';
import { friendlyError } from '@/lib/format';
import { Card } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { PatientSwitcher } from './PatientSwitcher';
import { LockedPatientState } from './LockedPatientState';

/**
 * Wraps a patient/family page. It renders the page only after GET /patients/<id>/ succeeds.
 * That endpoint enforces family consent, whereas some list endpoints do not, so this is what
 * stops a family member seeing care lists before the patient has consented.
 */
export function PortalPatientGate({ title, subtitle, children }: { title: string; subtitle: string; children: (patientId: string) => React.ReactNode }) {
  const { user } = useAuth();
  const { patients, loading, failed, refetch } = useLinkedPatients();
  const [chosen, setChosen] = useState<string | null>(null);

  if (loading) return <LoadingBlock rows={5} />;
  if (failed) return <Card><ErrorState description={friendlyError()} onRetry={refetch} /></Card>;
  if (patients.length === 0) {
    return <Card><EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No linked patient profile yet" description={user?.role === 'FAMILY' ? 'No patient is linked to your family account yet.' : 'Once a hospital links your profile, this page will fill in.'} /></Card>;
  }
  const selected = patients.find((p) => p.id === chosen) ?? patients[0];
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">{title}</h1><p className="mt-0.5 text-sm text-muted">{subtitle}</p></div>
      <PatientSwitcher patients={patients} selectedId={selected.id} onSelect={setChosen} />
      <Consented key={selected.id} id={selected.id} name={selected.full_name} isFamily={user?.role === 'FAMILY'}>{children}</Consented>
    </div>
  );
}

function Consented({ id, name, isFamily, children }: { id: string; name: string; isFamily: boolean; children: (patientId: string) => React.ReactNode }) {
  const check = useApi(() => patientsApi.get(id), [id]);
  if (check.loading) return <LoadingBlock rows={4} />;
  if (check.error) {
    return isFamily && check.error.status === 403
      ? <LockedPatientState patientName={name} />
      : <Card><ErrorState status={check.error.status} description={friendlyError(check.error.status)} onRetry={check.refetch} /></Card>;
  }
  return <>{children(id)}</>;
}
