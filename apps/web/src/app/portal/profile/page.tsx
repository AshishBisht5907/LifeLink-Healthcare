'use client';

import { useState } from 'react';
import { AlertTriangle, CalendarDays, Droplet, Home, Mail, Phone, Pill, ShieldCheck, UserRound, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLinkedPatients, type LinkedPatient } from '@/lib/useMyPatient';
import { useApi } from '@/lib/useApi';
import { patientsApi } from '@/lib/api';
import { ageFrom, formatDate, friendlyError, genderLabel } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { PatientHero } from '@/components/portal/PatientHero';
import { PatientSwitcher } from '@/components/portal/PatientSwitcher';
import { LockedPatientState } from '@/components/portal/LockedPatientState';
import { hasPatientProfileData } from './profile-state.js';
import type { PatientDetail } from '@/lib/types';

export default function PortalProfilePage() {
  const { user } = useAuth();
  const { patients, loading, failed, refetch } = useLinkedPatients();
  const [chosen, setChosen] = useState<string | null>(null);

  if (loading) return <LoadingBlock rows={6} />;
  if (failed) return <Card><ErrorState description={friendlyError()} onRetry={refetch} /></Card>;
  if (patients.length === 0) {
    return <Card><EmptyState icon={<UserRound className="h-5 w-5" />} title="No linked patient profile" description="Your profile is not linked to a hospital record yet." /></Card>;
  }
  const selected = patients.find((p) => p.id === chosen) ?? patients[0];
  return (
    <div className="space-y-6">
      <PatientSwitcher patients={patients} selectedId={selected.id} onSelect={setChosen} />
      <ProfileContent key={selected.id} summary={selected} isFamily={user?.role === 'FAMILY'} accountEmail={user?.role === 'PATIENT' ? user.email : ''} />
    </div>
  );
}

function ProfileContent({ summary, isFamily, accountEmail }: { summary: LinkedPatient; isFamily: boolean; accountEmail: string }) {
  const patient = useApi(() => patientsApi.get(summary.id), [summary.id]);

  if (patient.loading) return <LoadingBlock rows={6} />;
  if (patient.error) {
    return isFamily && patient.error.status === 403
      ? <div className="space-y-6"><PatientHero name={summary.full_name} lifelinkId={summary.lifelink_patient_id} eyebrow="Patient profile" /><LockedPatientState patientName={summary.full_name} /></div>
      : <Card><ErrorState status={patient.error.status} description={friendlyError(patient.error.status)} onRetry={patient.refetch} /></Card>;
  }
  if (!patient.data || !hasPatientProfileData(patient.data)) {
    return <Card><EmptyState icon={<UserRound className="h-5 w-5" />} title="Profile unavailable" description="Profile information is temporarily unavailable. Please try again." /></Card>;
  }
  return <ProfileView p={patient.data} accountEmail={accountEmail} />;
}

function ProfileView({ p, accountEmail }: { p: PatientDetail; accountEmail: string }) {
  const age = ageFrom(p.date_of_birth);
  const activeMeds = p.medications.filter((m) => m.status === 'ACTIVE');
  return (
    <div className="space-y-6">
      <PatientHero name={p.full_name} lifelinkId={p.lifelink_patient_id} eyebrow="Patient profile" dateOfBirth={p.date_of_birth} gender={p.gender}>
        <StatusBadge kind="generic" value="LINKED" label={p.is_unclaimed ? 'Hospital-created record' : 'Account linked'} />
        <StatusBadge kind="generic" value={p.blood_group_verification} label={`Blood group: ${p.blood_group_verification.replaceAll('_', ' ').toLowerCase()}`} />
      </PatientHero>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Personal information" subtitle="Details held on your permanent LifeLink record." />
          <dl className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2">
            <Row icon={<UserRound />} label="Full name" value={p.full_name} />
            <Row icon={<CalendarDays />} label="Date of birth" value={p.date_of_birth ? `${formatDate(p.date_of_birth)}${age !== null ? ` (${age} yrs)` : ''}` : 'Not provided'} />
            <Row icon={<UserRound />} label="Gender" value={genderLabel(p.gender)} />
            <Row icon={<Phone />} label="Phone" value={p.phone || 'Not provided'} />
            {accountEmail && <Row icon={<Mail />} label="Email" value={accountEmail} />}
            <Row icon={<Home />} label="Address" value="Not collected by LifeLink yet" muted />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Health snapshot" />
          <div className="space-y-5 p-5">
            <div>
              <p className="mb-1 flex items-center gap-2 text-xs font-medium text-muted"><Droplet className="h-3.5 w-3.5" /> Blood group</p>
              <p className="text-lg font-semibold">{p.blood_group || <span className="text-sm font-normal text-muted">Not yet verified</span>}</p>
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted"><AlertTriangle className="h-3.5 w-3.5" /> Allergies</p>
              {p.allergies.length === 0 ? <p className="text-sm text-muted">None recorded</p> : (
                <ul className="space-y-1.5">{p.allergies.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm"><span>{a.substance}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.severity === 'SEVERE' ? 'bg-danger-tint text-danger' : 'bg-warning-tint text-warning'}`}>{a.severity.toLowerCase()}</span></li>
                ))}</ul>
              )}
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted"><Pill className="h-3.5 w-3.5" /> Active medicines</p>
              {activeMeds.length === 0 ? <p className="text-sm text-muted">None recorded</p> : (
                <ul className="space-y-1.5">{activeMeds.map((m) => <li key={m.id} className="text-sm"><span className="font-medium">{m.name}</span>{(m.dosage || m.frequency) && <span className="text-muted"> · {[m.dosage, m.frequency].filter(Boolean).join(', ')}</span>}</li>)}</ul>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Emergency contacts" subtitle="People your care team can reach if needed." />
        {p.emergency_contacts.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No emergency contacts yet" description="Contacts added to your record will appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {p.emergency_contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{c.name}{c.is_primary && <span className="ml-2 rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-dark">Primary</span>}</p><p className="text-xs text-muted">{c.relationship}</p></div>
                <a href={`tel:${c.phone}`} className="shrink-0 text-sm font-medium text-brand-dark hover:underline">{c.phone}</a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5" /> Your LifeLink Patient ID identifies you across hospitals. Share it only with people you trust.</p>
    </div>
  );
}

function Row({ icon, label, value, muted }: { icon: React.ReactNode; label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="mb-1 flex items-center gap-2 text-xs font-medium text-muted"><span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{label}</dt>
      <dd className={`break-words text-sm ${muted ? 'text-muted' : 'font-semibold text-foreground'}`}>{value}</dd>
    </div>
  );
}
