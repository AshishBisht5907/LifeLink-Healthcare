'use client';

import { RoleGuard } from '@/components/layout/RoleGuard';
import { AppShell } from '@/components/layout/AppShell';

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={['HOSPITAL_MANAGEMENT']}>
      <AppShell>{children}</AppShell>
    </RoleGuard>
  );
}
