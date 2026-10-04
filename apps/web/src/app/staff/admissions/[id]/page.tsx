'use client';

import { use } from 'react';
import { AdmissionDetailView } from '@/components/records/AdmissionDetailView';

export default function StaffAdmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdmissionDetailView admissionId={id} backHref="/staff/admissions" />;
}
