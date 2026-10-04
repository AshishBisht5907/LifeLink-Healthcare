'use client';
import { use } from 'react';
import { PatientDetailView } from '@/components/records/PatientDetailView';
export default function StaffPatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PatientDetailView patientId={id} searchBasePath="/staff/patients" admissionBasePath="/staff/admissions" />;
}
