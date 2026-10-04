'use client';

import { useState } from 'react';
import { AlertTriangle, Droplet, ArrowLeftRight, Pill, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLinkedPatients, type LinkedPatient } from '@/lib/useMyPatient';
import { useApi } from '@/lib/useApi';
import { admissionsApi, aiApi, consentsApi, notificationsApi, patientsApi, referralsApi, requestsApi } from '@/lib/api';
import { friendlyError } from '@/lib/format';
import { Card } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { PatientHero } from '@/components/portal/PatientHero';
import { PatientSwitcher } from '@/components/portal/PatientSwitcher';
import { LockedPatientState } from '@/components/portal/LockedPatientState';
import { ActiveRequestsCard, CurrentCareCard, NotificationsCard, QuickActions, RecentActivityCard } from '@/components/portal/DashboardCards';
import { PatientCareJourney } from '@/components/health/PatientCareJourney';
import { PatientHistoryTimeline } from '@/components/records/PatientSummaryCard';
import { AIEmergencySummaryCard } from '@/components/health/AIEmergencySummaryCard';
import { RoleBasedActionCenter } from '@/components/management/RoleBasedActionCenter';

export default function PortalDashboardPage() {
  const { user } = useAuth();
  const { patients, loading, failed, refetch } = useLinkedPatients();
  const [chosen, setChosen] = useState<string | null>(null);

  if (loading) return <LoadingBlock rows={6} />;
  if (failed) return <Card><ErrorState description={friendlyError()} onRetry={refetch} /></Card>;
  if (patients.length === 0) {
    return (
      <Card>
        <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No linked patient profile yet"
          description={user?.role === 'FAMILY'
            ? 'No patient is linked to your family account yet. Ask the patient to add you from their Family Access settings.'
            : 'Once a hospital links your profile, your care information will appear here.'} />
      </Card>
    );
  }
  const selected = patients.find((p) => p.id === chosen) ?? patients[0];
  return (
    <div className="space-y-6">
      <PatientSwitcher patients={patients} selectedId={selected.id} onSelect={setChosen} />
      <PortalContent key={selected.id} summary={selected} isFamily={user?.role === 'FAMILY'} role={user?.role ?? 'PATIENT'} />
    </div>
  );
}

function PortalContent({ summary, isFamily, role }: { summary: LinkedPatient; isFamily: boolean; role: 'PATIENT' | 'FAMILY' | 'HOSPITAL_STAFF' | 'HOSPITAL_MANAGEMENT' | 'HOSPITAL_ADMIN' }) {
  const id = summary.id;
  const patient = useApi(() => patientsApi.get(id), [id]);
  const unlocked = Boolean(patient.data);
  // Nothing below is requested until the consent-checked patient call succeeds.
  const links = useApi(() => patientsApi.familyLinks(), [id], isFamily);
  const consents = useApi(() => consentsApi.list(), [id], unlocked);
  const live = useApi(() => patientsApi.liveStatus(id), [id], unlocked);
  const requests = useApi(() => requestsApi.list({ patient: id }), [id], unlocked);
  const admissions = useApi(() => admissionsApi.list(), [id], unlocked);
  const notifications = useApi(() => notificationsApi.list(), [id], unlocked);
  const referrals = useApi(() => referralsApi.list(), [id], unlocked);
  const insights = useApi(() => aiApi.list(id), [id], unlocked);
  const [generating, setGenerating] = useState(false);

  const link = links.data?.results.find((l) => l.patient === id && l.is_active);
  const latestConsent = consents.data?.results.find((c) => c.patient === id);
  const myAdmissions = { ...admissions, data: admissions.data ? admissions.data.results.filter((a) => a.patient === id) : null };
  const myRequests = { ...requests, data: requests.data?.results ?? null };
  const myReferrals = (referrals.data?.results ?? []).filter((r) => r.patient === id);

  if (patient.loading) return <LoadingBlock rows={6} />;

  if (patient.error) {
    const locked = isFamily && patient.error.status === 403;
    return (
      <div className="space-y-6">
        <PatientHero name={summary.full_name} lifelinkId={summary.lifelink_patient_id} eyebrow={isFamily ? 'Linked patient' : 'My care'}>
          {link && <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium ring-1 ring-border">{link.relationship_type}</span>}
        </PatientHero>
        {locked ? <LockedPatientState patientName={summary.full_name} />
          : <Card><ErrorState status={patient.error.status} description={friendlyError(patient.error.status)} onRetry={patient.refetch} /></Card>}
      </div>
    );
  }

  const p = patient.data!;
  const activeMeds = p.medications.filter((m) => m.status === 'ACTIVE');

  async function generateSummary() {
    setGenerating(true);
    try { await aiApi.generateEmergencySummary(id); insights.refetch(); } finally { setGenerating(false); }
  }

  return (
    <div className="space-y-6">
      <PatientHero name={p.full_name} lifelinkId={p.lifelink_patient_id} dateOfBirth={p.date_of_birth} gender={p.gender}
        eyebrow={isFamily ? 'Linked patient' : 'Welcome back'}>
        <StatusBadge kind="generic" value="LINKED" label={p.is_unclaimed ? 'Hospital-created record' : 'Account linked'} />
        {isFamily && link && <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium ring-1 ring-border">{link.relationship_type}</span>}
        {isFamily && link && <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium ring-1 ring-border">{link.access_level.replace(/_/g, ' ').toLowerCase()} access</span>}
        {isFamily && latestConsent && <StatusBadge kind="consent" value={latestConsent.status} label={`Consent ${latestConsent.status.toLowerCase()}`} />}
      </PatientHero>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><Droplet className="h-3.5 w-3.5" /> Blood group</div>
          {p.blood_group ? <p className="text-lg font-semibold">{p.blood_group}</p>
            : <StatusBadge kind="generic" value={p.blood_group_verification} label={p.blood_group_verification === 'CONFLICT' ? 'Conflict — verification required' : 'Not yet verified'} />}
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><AlertTriangle className="h-3.5 w-3.5" /> Allergies</div>
          {p.allergies.length === 0 ? <p className="text-sm text-muted">None recorded</p> : (
            <div className="flex flex-wrap gap-1.5">{p.allergies.map((a) => <span key={a.id} className="rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium text-danger">{a.substance}</span>)}</div>
          )}
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><Pill className="h-3.5 w-3.5" /> Active medicines</div>
          {activeMeds.length === 0 ? <p className="text-sm text-muted">None recorded</p> : <p className="text-sm">{activeMeds.map((m) => m.name).join(', ')}</p>}
        </Card>
      </div>

      <QuickActions showAccessRequests={!isFamily} />

      <div className="grid gap-6 lg:grid-cols-2">
        <CurrentCareCard admissions={myAdmissions} />
        <ActiveRequestsCard items={live} />
        <RecentActivityCard requests={myRequests} admissions={myAdmissions} />
        <NotificationsCard notifications={notifications} />
      </div>

      {myReferrals.length > 0 && (
        <Card>
          <div className="p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><ArrowLeftRight className="h-4 w-4 text-brand" /> Referral &amp; transfer</p>
            <ul className="divide-y divide-border">
              {myReferrals.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{r.from_hospital_name} → {r.to_hospital_name}</p><p className="truncate text-xs text-muted">{r.reason}</p></div>
                  <StatusBadge kind="referral" value={r.status} />
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <RoleBasedActionCenter role={role} requests={requests.data?.results ?? []} referrals={referrals.data?.results ?? []} patientId={id} />
      <PatientCareJourney
        admissions={myAdmissions.data ?? []}
        requests={requests.data?.results ?? []}
        referrals={myReferrals}
        variant="patient"
        loading={requests.loading || admissions.loading || referrals.loading}
        error={requests.error ?? admissions.error ?? referrals.error}
        onRetry={() => { requests.refetch(); admissions.refetch(); referrals.refetch(); }}
      />
      <PatientHistoryTimeline patient={p} />
      <AIEmergencySummaryCard patient={p} insights={insights.data} generating={generating} onRefresh={generateSummary} />
    </div>
  );
}
