/**
 * Upload rules, mirrored from the backend (LIFELINK_ALLOWED_UPLOAD_TYPES / LIFELINK_MAX_UPLOAD_BYTES)
 * ONLY to give an instant, friendly message. The backend re-checks everything and stays the authority.
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'png', 'jpg', 'jpeg'] as const;

export type FileKind = 'PDF' | 'DOCX' | 'IMAGE' | 'FILE';

const ext = (name: string) => (name.includes('.') ? (name.split('.').pop() ?? '') : '').toLowerCase();

export function fileKind(name: string): FileKind {
  const e = ext(name);
  if (e === 'pdf') return 'PDF';
  if (e === 'docx') return 'DOCX';
  if (['png', 'jpg', 'jpeg'].includes(e)) return 'IMAGE';
  return 'FILE';
}

export function validateUpload(file: { name: string; size: number } | null): string | null {
  if (!file) return 'Choose a file first.';
  if (file.size === 0) return 'This file is empty.';
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext(file.name))) return 'Only PDF, DOCX, PNG or JPEG files can be uploaded.';
  if (file.size > MAX_UPLOAD_BYTES) return `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 15 MB.`;
  return null;
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  LAB_REPORT: 'Lab report', IMAGING_REPORT: 'Imaging report', DISCHARGE_SUMMARY: 'Discharge summary', PRESCRIPTION: 'Prescription',
  CONSENT_FORM: 'Consent form', INSURANCE_DOCUMENT: 'Insurance document', IDENTITY_DOCUMENT: 'Identity document', OTHER: 'Other',
};
export const docTypeLabel = (t: string) => DOC_TYPE_LABEL[t] ?? t.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

export const VERIFICATION_LABEL: Record<string, string> = { VERIFIED: 'Verified', PENDING_VERIFICATION: 'Pending verification', REJECTED: 'Rejected' };
export const verificationLabel = (s: string) => VERIFICATION_LABEL[s] ?? s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i;
const UUID_START = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/**
 * The backend stores files as `<uuid>_<original name>` and may truncate long names, which leaves
 * a meaningless id. Show the original name when it can be recovered, otherwise the given fallback
 * (e.g. "Lab report (PDF)") - never a raw storage name.
 */
export function displayName(path: string, fallback = 'Document'): string {
  const last = decodeURIComponent((path.split('?')[0].split('/').pop() ?? '').trim());
  const stripped = last.replace(UUID_PREFIX, '');
  return !stripped || UUID_START.test(stripped) ? fallback : stripped;
}

export const fileExtension = (path: string): string => ext(path.split('?')[0]);
