'use client';
import { use } from 'react';
import { PatientDetailView } from '@/components/records/PatientDetailView';
export default function ManagementPatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PatientDetailView patientId={id} searchBasePath="/management/patients" admissionBasePath="/management/admissions" accessGate />;
}
