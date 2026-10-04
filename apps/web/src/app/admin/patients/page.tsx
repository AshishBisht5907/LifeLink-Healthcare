'use client';

import { PatientSearchView } from '@/components/records/PatientSearchView';

// Admin can look a patient up for administration, but opening a clinical record and registering patients stay with care staff.
export default function AdminPatientsPage() {
  return <PatientSearchView basePath="/admin/patients" allowOpen={false} allowRegister={false} />;
}
