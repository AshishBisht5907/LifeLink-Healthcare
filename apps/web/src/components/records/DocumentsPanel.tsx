'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Download, File as FileIcon, FileImage, FileText, ShieldCheck, UploadCloud, XCircle } from 'lucide-react';
import { documentsApi } from '@/lib/api';
import { serverMessage } from '@/lib/errorMessages';
import { displayName, docTypeLabel, fileExtension, fileKind, validateUpload, verificationLabel, DOC_TYPE_LABEL, type FileKind } from '@/lib/documentRules';
import { formatDate } from '@/lib/format';
import { Button, Card, CardHeader, Field, Select } from '@/components/ui/Primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import type { Document as LLDocument } from '@/lib/types';

const KIND_ICON: Record<FileKind, React.ComponentType<{ className?: string }>> = { PDF: FileText, DOCX: FileText, IMAGE: FileImage, FILE: FileIcon };

export function DocumentsPanel({ patientId, documents, onChanged, canUpload, canVerify }: {
  patientId: string;
  documents: LLDocument[];
  onChanged: () => void;
  canUpload: boolean;
  /** ONLY staff/management/admin: never patient/family, even on reuse. */
  canVerify: boolean;
}) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [docType, setDocType] = useState('OTHER');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  function pick(f: File | null) { setFile(f); setError(f ? validateUpload(f) ?? '' : ''); }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateUpload(file);
    if (problem) { setError(problem); return; }
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('patient', patientId); fd.append('doc_type', docType); fd.append('file', file!);
      await documentsApi.upload(fd);
      toast.show('success', 'Document uploaded', 'It will show as pending until hospital staff verify it.');
      setFile(null); if (fileInput.current) fileInput.current.value = '';
      setShowUpload(false);
      onChanged();
    } catch (err) { setError(serverMessage(err, [400, 403, 413])); } finally { setUploading(false); }
  }

  async function download(doc: LLDocument) {
    setError('');
    try {
      const { download_path } = await documentsApi.signedUrl(doc.id); // short-lived link issued after the server checks access
      if (!window.open(download_path, '_blank')) window.location.assign(download_path);
    } catch (err) { setError(serverMessage(err, [403, 404])); }
  }

  async function verify(id: string) {
    setBusyId(id); setError('');
    try { await documentsApi.verify(id); toast.show('success', 'Document verified'); onChanged(); }
    catch (err) { setError(serverMessage(err)); } finally { setBusyId(null); }
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) { setError('A rejection reason is required.'); return; }
    setBusyId(id); setError('');
    try { await documentsApi.reject(id, rejectReason.trim()); toast.show('success', 'Document rejected'); setRejectingId(null); setRejectReason(''); onChanged(); }
    catch (err) { setError(serverMessage(err)); } finally { setBusyId(null); }
  }

  return (
    <Card>
      <CardHeader
        title="Documents"
        subtitle="PDF, DOCX, PNG or JPEG up to 15 MB. Hospital staff verify uploads before they count as official records."
        action={canUpload ? <Button size="sm" variant="secondary" onClick={() => { setShowUpload((v) => !v); setError(''); }}><UploadCloud className="h-3.5 w-3.5" />{showUpload ? 'Cancel' : 'Upload'}</Button> : undefined}
      />

      {showUpload && (
        <form onSubmit={upload} className="space-y-3 border-b border-border bg-neutral-tint/50 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Document type">
              <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
                {Object.entries(DOC_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="File" hint="PDF, DOCX, PNG or JPEG, up to 15 MB">
              <input ref={fileInput} type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(e) => pick(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-tint file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-dark" />
            </Field>
          </div>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          <Button type="submit" variant="primary" loading={uploading} disabled={!file}>Upload document</Button>
        </form>
      )}

      {documents.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="No documents yet" description={canUpload ? 'Uploaded reports, prescriptions and other records will be listed here.' : 'No documents have been added to this record.'} />
      ) : (
        <ul className="divide-y divide-border">
          {documents.map((doc) => {
            const ext = fileExtension(doc.file);
            const name = displayName(doc.file, `${docTypeLabel(doc.doc_type)}${ext ? ` (${ext.toUpperCase()})` : ''}`);
            const Icon = KIND_ICON[fileKind(`x.${ext}`)];
            return (
              <li key={doc.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-dark"><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={name}>{name}</p>
                      <p className="text-xs text-muted">{docTypeLabel(doc.doc_type)} · {formatDate(doc.uploaded_at)} · by {doc.uploaded_by_username}</p>
                      {doc.verification_status === 'VERIFIED' && doc.verified_at && <p className="flex items-center gap-1 text-xs text-success"><ShieldCheck className="h-3 w-3" />Verified {formatDate(doc.verified_at)}</p>}
                      {doc.verification_status === 'REJECTED' && doc.rejection_reason && <p className="mt-0.5 text-xs text-danger">Rejected: {doc.rejection_reason}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge kind="generic" value={doc.verification_status} label={verificationLabel(doc.verification_status)} />
                    <Button size="sm" variant="secondary" onClick={() => download(doc)} aria-label={`Download ${name}`}><Download className="h-3.5 w-3.5" /> Download</Button>
                  </div>
                </div>

                {canVerify && doc.verification_status === 'PENDING_VERIFICATION' && (
                  <div className="mt-3 border-t border-border pt-3">
                    {rejectingId === doc.id ? (
                      <div className="space-y-2">
                        <input type="text" placeholder="Reason for rejection (required)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                          className="w-full rounded-lg border border-border px-3 py-1.5 text-xs outline-none focus:border-brand" />
                        <div className="flex gap-2">
                          <Button size="sm" variant="danger" loading={busyId === doc.id} onClick={() => reject(doc.id)}>Confirm reject</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(''); }}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" loading={busyId === doc.id} onClick={() => verify(doc.id)}><CheckCircle2 className="h-3.5 w-3.5" /> Verify</Button>
                        <Button size="sm" variant="danger" onClick={() => setRejectingId(doc.id)}><XCircle className="h-3.5 w-3.5" /> Reject</Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && !showUpload && <p role="alert" className="px-5 pb-4 text-xs text-danger">{error}</p>}
    </Card>
  );
}
