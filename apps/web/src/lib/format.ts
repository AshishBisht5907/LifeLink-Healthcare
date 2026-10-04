const REQUEST_LABELS: Record<string, string> = {
  CT_SCAN: 'CT scan', MRI: 'MRI', XRAY: 'X-ray', BLOOD_TEST: 'Blood test', PATHOLOGY: 'Pathology',
  MEDICATION: 'Medication', SURGERY: 'Surgery', INSURANCE_APPROVAL: 'Insurance approval', PAYMENT: 'Payment',
  CONSULTATION: 'Consultation', DOCUMENT_VERIFICATION: 'Document verification', GENERIC_TASK: 'General task',
};

/** 'CT_SCAN' -> 'CT scan'. Unknown codes fall back to sentence case, never to raw codes. */
export function requestLabel(code: string): string {
  if (REQUEST_LABELS[code]) return REQUEST_LABELS[code];
  const t = code.replace(/_/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function ageFrom(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const b = new Date(iso);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function genderLabel(g: string): string {
  return ({ M: 'Male', F: 'Female', O: 'Other', U: 'Not specified' } as Record<string, string>)[g] ?? 'Not specified';
}

/** Plain-language message for a failed request. Never shows backend text. */
export function friendlyError(status?: number): string {
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to view this.';
  if (status === 404) return 'We could not find this information.';
  if (status === undefined || status === 0) return 'We could not reach LifeLink. Check your connection and try again.';
  return 'Something went wrong on our side. Please try again in a moment.';
}
