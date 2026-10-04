'use client';

import { use } from 'react';
import { AdmissionDetailView } from '@/components/records/AdmissionDetailView';

export default function ManagementAdmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdmissionDetailView admissionId={id} backHref="/management/admissions" />;
}
