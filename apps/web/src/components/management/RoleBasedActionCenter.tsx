'use client';

import Link from 'next/link';
import { AlertCircle, ArrowRightLeft, ClipboardCheck, UserRound } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Primitives';
import type { Me, Referral, ServiceRequest } from '@/lib/types';

function ActionPill({ text, tone }: { text: string; tone: 'danger' | 'warning' | 'info' | 'success' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
      tone === 'danger' ? 'bg-danger-tint text-danger' :
      tone === 'warning' ? 'bg-warning-tint text-warning' :
      tone === 'info' ? 'bg-info-tint text-info' : 'bg-success-tint text-success'
    }`}>
      {text}
    </span>
  );
}

export function RoleBasedActionCenter({
  role,
  requests,
  referrals,
  patientId,
}: {
  role: Me['role'];
  requests: ServiceRequest[];
  referrals: Referral[];
  patientId?: string;
}) {
  const filteredRequests = patientId ? requests.filter((request) => request.patient === patientId) : requests;
  const departmentRoute = role === 'HOSPITAL_STAFF' ? '/staff/admissions' : '/management/admissions';

  const items = (() => {
    switch (role) {
      case 'HOSPITAL_MANAGEMENT':
      case 'HOSPITAL_ADMIN':
        return [
          ...requests.filter((r) => ['REQUESTED', 'PENDING', 'APPROVAL_REQUIRED'].includes(r.status)).slice(0, 2).map((r) => ({
            label: `${r.request_type.replaceAll('_', ' ')} needs approval`,
            href: `/management/admissions/${r.admission}`,
            tone: 'danger' as const,
            meta: `${r.patient_name} · ${r.department_name ?? 'Unrouted'}`,
          })),
          ...requests.filter((r) => ['APPROVED', 'READY', 'IN_PROGRESS'].includes(r.status)).slice(0, 2).map((r) => ({
            label: `${r.request_type.replaceAll('_', ' ')} in progress`,
            href: `/management/admissions/${r.admission}`,
            tone: 'warning' as const,
            meta: `${r.patient_name} · ${r.department_name ?? 'Unrouted'}`,
          })),
          ...referrals.filter((r) => r.status === 'PENDING').slice(0, 2).map((r) => ({
            label: 'Referral awaiting response',
            href: `/management/referrals/${r.id}`,
            tone: 'info' as const,
            meta: `${r.patient_name} · ${r.to_hospital_name}`,
          })),
        ];
      case 'HOSPITAL_STAFF':
        return [
          ...requests.filter((r) => r.priority === 'EMERGENCY' && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(r.status)).slice(0, 2).map((r) => ({
            label: 'Urgent request',
            href: `${departmentRoute}/${r.admission}`,
            tone: 'danger' as const,
            meta: `${r.patient_name} · ${r.request_type.replaceAll('_', ' ')}`,
          })),
          ...requests.filter((r) => ['APPROVED', 'READY', 'IN_PROGRESS'].includes(r.status)).slice(0, 2).map((r) => ({
            label: 'Waiting request',
            href: `${departmentRoute}/${r.admission}`,
            tone: 'warning' as const,
            meta: `${r.department_name ?? 'Unrouted'} · ${r.patient_name}`,
          })),
          ...requests.filter((r) => r.status === 'READY').slice(0, 2).map((r) => ({
            label: 'Ready to start',
            href: `${departmentRoute}/${r.admission}`,
            tone: 'info' as const,
            meta: `${r.request_type.replaceAll('_', ' ')} · ${r.department_name ?? 'Unrouted'}`,
          })),
        ];
      case 'PATIENT':
      case 'FAMILY':
        return [
          ...filteredRequests.filter((r) => r.status === 'COMPLETED').slice(0, 2).map((r) => ({
            label: 'Request completed',
            href: '/portal/requests',
            tone: 'success' as const,
            meta: `${r.request_type.replaceAll('_', ' ')} · ${r.department_name ?? 'Department update'}`,
          })),
          ...referrals.filter((r) => r.patient === patientId && r.status === 'ACCEPTED').slice(0, 2).map((r) => ({
            label: 'Referral accepted',
            href: '/portal/referrals',
            tone: 'info' as const,
            meta: `${r.from_hospital_name} → ${r.to_hospital_name}`,
          })),
          ...filteredRequests.filter((r) => ['APPROVED', 'READY', 'IN_PROGRESS'].includes(r.status)).slice(0, 1).map((r) => ({
            label: 'Department update',
            href: '/portal/requests',
            tone: 'warning' as const,
            meta: `${r.request_type.replaceAll('_', ' ')} is in progress`,
          })),
        ];
      default:
        return [];
    }
  })();

  const titleMap = {
    PATIENT: 'Your updates',
    FAMILY: 'Your updates',
    HOSPITAL_STAFF: 'Department actions',
    HOSPITAL_MANAGEMENT: 'Coordination actions',
    HOSPITAL_ADMIN: 'Coordination actions',
  };

  const iconMap = {
    PATIENT: UserRound,
    FAMILY: UserRound,
    HOSPITAL_STAFF: ClipboardCheck,
    HOSPITAL_MANAGEMENT: AlertCircle,
    HOSPITAL_ADMIN: AlertCircle,
  };

  const Icon = iconMap[role] ?? ClipboardCheck;

  return (
    <Card>
      <CardHeader title={titleMap[role] ?? 'Action center'} subtitle="Generated from live workflow data" action={<Icon className="h-4 w-4 text-muted" />} />
      <div className="space-y-3 p-5">
        {items.length === 0 ? (
          <p className="text-sm text-muted">No action items currently match your role.</p>
        ) : (
          items.slice(0, 4).map((item, index) => (
            <Link key={`${item.label}-${index}`} href={item.href} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-3 hover:bg-neutral-tint">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <ActionPill text={item.label} tone={item.tone} />
                </div>
                <p className="text-xs text-muted">{item.meta}</p>
              </div>
              <ArrowRightLeft className="h-4 w-4 text-muted" />
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}
