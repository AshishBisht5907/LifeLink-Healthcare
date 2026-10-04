'use client';

import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { hospitalsApi, ApiError } from '@/lib/api';
import { Card, CardHeader, Button, Input, Select, Field } from '@/components/ui/Primitives';
import { LoadingBlock, ErrorState, EmptyState } from '@/components/ui/States';
import { Building2, PlusCircle } from 'lucide-react';
import type { DepartmentType } from '@/lib/types';

const DEPARTMENT_TYPES: DepartmentType[] = ['GENERAL', 'RADIOLOGY', 'LABORATORY', 'PHARMACY', 'OT', 'WARD', 'BILLING', 'INSURANCE', 'MANAGEMENT', 'ADMIN'];

export default function AdminDepartmentsPage() {
  const departments = useApi(() => hospitalsApi.departments());
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<DepartmentType>('GENERAL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await hospitalsApi.createDepartment({ name, department_type: type });
      setName('');
      setShowForm(false);
      departments.refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the department.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Departments</h1>
        <Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
          <PlusCircle className="h-3.5 w-3.5" /> {showForm ? 'Cancel' : 'New department'}
        </Button>
      </div>
      <Card>
        {showForm && (
          <form onSubmit={submit} className="grid grid-cols-1 gap-3 border-b border-border p-5 sm:grid-cols-3 sm:items-end">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as DepartmentType)}>
                {DEPARTMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="primary" loading={saving}>Create</Button>
            {error && <p className="col-span-full text-xs text-danger">{error}</p>}
          </form>
        )}
        {departments.loading ? (
          <LoadingBlock rows={3} />
        ) : departments.error ? (
          <ErrorState status={departments.error.status} onRetry={departments.refetch} />
        ) : departments.data && departments.data.results.length > 0 ? (
          <ul className="divide-y divide-border">
            {departments.data.results.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-5 py-4">
                <p className="text-sm font-medium text-foreground">{d.name}</p>
                <span className="text-xs text-muted">{d.department_type}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Building2 className="h-5 w-5" />} title="No departments yet" />
        )}
      </Card>
    </div>
  );
}
