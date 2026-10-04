import { clsx } from 'clsx';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  brand: 'bg-brand-tint text-brand-dark border-brand/20',
  success: 'bg-success-tint text-success border-success/20',
  warning: 'bg-warning-tint text-warning border-warning/20',
  danger: 'bg-danger-tint text-danger border-danger/20',
  info: 'bg-info-tint text-info border-info/20',
  neutral: 'bg-neutral-tint text-muted border-border',
};

// Single source of truth for status -> color across the whole app, so a
// given status always reads the same way no matter which screen it's on.
const REQUEST_STATUS_TONE: Record<string, Tone> = {
  REQUESTED: 'neutral',
  PENDING: 'info',
  APPROVAL_REQUIRED: 'warning',
  APPROVED: 'brand',
  READY: 'brand',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  POSTPONED: 'warning',
  CANCELLED: 'neutral',
  BLOCKED: 'danger',
  REJECTED: 'danger',
};

const REFERRAL_STATUS_TONE: Record<string, Tone> = {
  PENDING: 'info',
  ACCEPTED: 'success',
  CONDITIONAL: 'warning',
  REJECTED: 'danger',
};

const CONSENT_STATUS_TONE: Record<string, Tone> = {
  PENDING: 'info',
  APPROVED: 'success',
  DECLINED: 'danger',
};

const PRIORITY_TONE: Record<string, Tone> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  EMERGENCY: 'danger',
};

const GENERIC_TONE: Record<string, Tone> = {
  VERIFIED: 'success', LINKED: 'success', REJECTED: 'danger',
  PENDING_VERIFICATION: 'warning', CONFLICT: 'danger',
  SELF_REPORTED: 'info',
};

function toneFor(kind: 'request' | 'referral' | 'consent' | 'priority' | 'generic', value: string): Tone {
  if (kind === 'request') return REQUEST_STATUS_TONE[value] ?? 'neutral';
  if (kind === 'referral') return REFERRAL_STATUS_TONE[value] ?? 'neutral';
  if (kind === 'consent') return CONSENT_STATUS_TONE[value] ?? 'neutral';
  if (kind === 'priority') return PRIORITY_TONE[value] ?? 'neutral';
  return GENERIC_TONE[value] ?? 'neutral';
}

export function StatusBadge({
  kind = 'generic',
  value,
  label,
}: {
  kind?: 'request' | 'referral' | 'consent' | 'priority' | 'generic';
  value: string;
  label?: string;
}) {
  const tone = toneFor(kind, value);
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone]
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label ?? value.replaceAll('_', ' ')}
    </span>
  );
}
