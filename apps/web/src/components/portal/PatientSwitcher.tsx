import type { LinkedPatient } from '@/lib/useMyPatient';

export function PatientSwitcher({ patients, selectedId, onSelect }: { patients: LinkedPatient[]; selectedId: string; onSelect: (id: string) => void }) {
  if (patients.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Linked patients">
      <span className="text-xs font-medium text-muted">Viewing:</span>
      {patients.map((p) => (
        <button key={p.id} role="tab" aria-selected={p.id === selectedId} onClick={() => onSelect(p.id)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${p.id === selectedId ? 'border-brand bg-brand text-white' : 'border-border bg-surface hover:bg-neutral-tint'}`}>
          {p.full_name}
        </button>
      ))}
    </div>
  );
}
