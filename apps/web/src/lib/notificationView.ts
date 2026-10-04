import type { Notification } from './types';
import type { Role } from './consentView';

export type NotificationFilter = 'ALL' | 'UNREAD';

export const filterNotifications = (list: Notification[], f: NotificationFilter) => (f === 'UNREAD' ? list.filter((n) => !n.is_read) : list);
export const unreadCount = (list: Notification[]) => list.filter((n) => !n.is_read).length;

/** 'danger' draws attention (emergency access); 'info' is routine. Labels come from the backend's own type names. */
export function notificationMeta(type: string): { label: string; tone: 'danger' | 'info' | 'brand' } {
  const label = type.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  if (type === 'EMERGENCY_ACCESS') return { label, tone: 'danger' };
  if (type === 'ACCESS_REQUEST' || type === 'NEW_CONSENT') return { label, tone: 'brand' };
  return { label, tone: 'info' };
}

/**
 * Where a notification should take this person. The backend sends no link, so this is a fixed
 * map from notification type + role to an existing page, and returns null when there isn't one.
 */
export function notificationHref(type: string, role: Role): string | null {
  if (role === 'PATIENT') {
    if (type === 'ACCESS_REQUEST') return '/portal/access-requests';
    if (type === 'EMERGENCY_ACCESS') return '/portal/access-requests';
    if (type === 'NEW_CONSENT') return '/portal/consents';
  }
  if (role === 'FAMILY' && type === 'NEW_CONSENT') return '/portal/consents';
  if (role === 'HOSPITAL_MANAGEMENT' && type === 'ACCESS_REQUEST') return '/management/patients';
  return null;
}
