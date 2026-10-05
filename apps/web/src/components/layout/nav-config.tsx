import {
  LayoutDashboard, Users, ClipboardList, Building2, Bell, ArrowLeftRight,
  HeartPulse, FileCheck2, UserCog, ScrollText, Search, FileText, UserRound, ShieldCheck, Hospital, Settings,
} from 'lucide-react';
import type { Me } from '@/lib/types';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function navForRole(role: Me['role']): NavItem[] {
  switch (role) {
    case 'HOSPITAL_MANAGEMENT':
      return [
        { href: '/management', label: 'Command Center', icon: LayoutDashboard },
        { href: '/management/patients', label: 'Patients', icon: Search },
        { href: '/management/admissions', label: 'Admissions', icon: Users },
        { href: '/management/requests', label: 'Requests', icon: ClipboardList },
        { href: '/management/referrals', label: 'Referrals', icon: ArrowLeftRight },
        { href: '/management/capacity', label: 'Capacity', icon: Building2 },
        { href: '/notifications', label: 'Notifications', icon: Bell },
      ];
    case 'HOSPITAL_STAFF':
      return [
        { href: '/staff', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/staff/patients', label: 'Patients', icon: Search },
        { href: '/staff/requests', label: 'Requests', icon: ClipboardList },
        { href: '/staff/admissions', label: 'Admissions', icon: Users },
        { href: '/staff/referrals', label: 'Referrals', icon: ArrowLeftRight },
        { href: '/staff/consents', label: 'Consents', icon: FileCheck2 },
        { href: '/notifications', label: 'Notifications', icon: Bell },
      ];
    case 'HOSPITAL_ADMIN':
      return [
        { href: '/admin', label: 'System Dashboard', icon: LayoutDashboard },
        { href: '/admin/hospitals', label: 'Hospitals', icon: Hospital },
        { href: '/admin/departments', label: 'Departments', icon: Building2 },
        { href: '/admin/staff', label: 'Staff', icon: UserCog },
        { href: '/admin/management', label: 'Management', icon: ShieldCheck },
        { href: '/admin/patients', label: 'Patients', icon: Search },
        { href: '/admin/admissions', label: 'Admissions', icon: Users },
        { href: '/admin/requests', label: 'Requests', icon: ClipboardList },
        { href: '/admin/referrals', label: 'Referrals', icon: ArrowLeftRight },
        { href: '/notifications', label: 'Notifications', icon: Bell },
        { href: '/admin/audit', label: 'Audit Log', icon: ScrollText },
        { href: '/settings', label: 'Settings', icon: Settings },
      ];
    case 'PATIENT':
      return [
        { href: '/portal', label: 'Dashboard', icon: HeartPulse },
        { href: '/portal/profile', label: 'My profile', icon: UserRound },
        { href: '/portal/admissions', label: 'Admissions', icon: Users },
        { href: '/portal/requests', label: 'Requests', icon: ClipboardList },
        { href: '/portal/referrals', label: 'Referrals', icon: ArrowLeftRight },
        { href: '/portal/documents', label: 'Documents', icon: FileText },
        { href: '/portal/consents', label: 'Consent', icon: FileCheck2 },
        { href: '/portal/family-access', label: 'Family access', icon: Users },
        { href: '/portal/access-requests', label: 'Access requests', icon: ShieldCheck },
        { href: '/notifications', label: 'Notifications', icon: Bell },
      ];
    case 'FAMILY':
      return [
        { href: '/portal', label: 'Dashboard', icon: HeartPulse },
        { href: '/portal/profile', label: 'Patient profile', icon: UserRound },
        { href: '/portal/admissions', label: 'Admissions', icon: Users },
        { href: '/portal/requests', label: 'Requests', icon: ClipboardList },
        { href: '/portal/referrals', label: 'Referrals', icon: ArrowLeftRight },
        { href: '/portal/documents', label: 'Documents', icon: FileText },
        { href: '/portal/consents', label: 'Consent', icon: FileCheck2 },
        { href: '/portal/family-access', label: 'Family access', icon: Users },
        { href: '/notifications', label: 'Notifications', icon: Bell },
      ];
    default:
      return [];
  }
}

export const ROLE_LABEL: Record<Me['role'], string> = {
  PATIENT: 'Patient',
  FAMILY: 'Family Representative',
  HOSPITAL_STAFF: 'Hospital Staff',
  HOSPITAL_MANAGEMENT: 'Care Coordination',
  HOSPITAL_ADMIN: 'Hospital Admin',
};

/** The one line that answers "which part of LifeLink am I in right now?" */
export function contextLabel(user: Me): { role: string; detail: string | null } {
  switch (user.role) {
    case 'HOSPITAL_STAFF': {
      const dept = user.staff_profile?.department;
      return { role: dept ? `STAFF · ${dept.toUpperCase()}` : 'HOSPITAL STAFF', detail: user.staff_profile?.hospital ?? null };
    }
    case 'HOSPITAL_MANAGEMENT':
      return { role: 'CARE COORDINATION', detail: user.staff_profile?.hospital ?? null };
    case 'HOSPITAL_ADMIN':
      return { role: 'HOSPITAL ADMIN', detail: user.staff_profile?.hospital ?? null };
    case 'FAMILY':
      return { role: 'FAMILY', detail: null };
    default:
      return { role: 'PATIENT', detail: null };
  }
}
