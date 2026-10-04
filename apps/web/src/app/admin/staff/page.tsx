'use client';

import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { staffApi, hospitalsApi, ApiError } from '@/lib/api';
import { Card, CardHeader, Button, Input, Select, Field } from '@/components/ui/Primitives';
import { LoadingBlock, ErrorState, EmptyState } from '@/components/ui/States';
import { UserCog, UserPlus } from 'lucide-react';
import type { StaffRole } from '@/lib/types';

const STAFF_ROLES: StaffRole[] = ['DOCTOR', 'NURSE', 'TECHNICIAN', 'PHARMACIST', 'COORDINATOR', 'BILLING_CLERK', 'INSURANCE_OFFICER', 'ADMIN'];

export default function AdminStaffPage() {
  const staff = useApi(() => staffApi.list());
  const departments = useApi(() => hospitalsApi.departments());
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [staffRole, setStaffRole] = useState<StaffRole>('DOCTOR');
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function provision(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await staffApi.provision({
        username, initial_password: password, staff_role: staffRole,
        department: departmentId || undefined, employee_id: employeeId, job_title: jobTitle,
      });
      setUsername(''); setPassword(''); setEmployeeId(''); setJobTitle('');
      setShowForm(false);
      staff.refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not provision the account.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, currentlyActive: boolean) {
    setBusyId(id);
    try {
      if (currentlyActive) await staffApi.deactivate(id);
      else await staffApi.activate(id);
      staff.refetch();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Staff</h1>
        <Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
          <UserPlus className="h-3.5 w-3.5" /> {showForm ? 'Cancel' : 'Provision new staff'}
        </Button>
      </div>

      <Card>
        {showForm && (
          <form onSubmit={provision} className="space-y-4 border-b border-border p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Username">
                <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
              </Field>
              <Field label="Initial password" hint="Staff will be required to change it (must_change_password)">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} />
              </Field>
              <Field label="Role">
                <Select value={staffRole} onChange={(e) => setStaffRole(e.target.value as StaffRole)}>
                  {STAFF_ROLES.map((r) => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}
                </Select>
              </Field>
              <Field label="Department" hint="Only departments in your own hospital are shown">
                <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">No department</option>
                  {departments.data?.results.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="Employee ID">
                <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required />
              </Field>
              <Field label="Job title">
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </Field>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <Button type="submit" variant="primary" loading={saving}>Provision account</Button>
          </form>
        )}

        {staff.loading ? (
          <LoadingBlock rows={4} />
        ) : staff.error ? (
          <ErrorState status={staff.error.status} onRetry={staff.refetch} />
        ) : staff.data && staff.data.results.length > 0 ? (
          <ul className="divide-y divide-border">
            {staff.data.results.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{s.username}</p>
                  <p className="text-xs text-muted">{s.staff_role.replaceAll('_', ' ')} · {s.department_name ?? 'No department'} · {s.employee_id}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${s.is_active ? 'text-success' : 'text-danger'}`}>{s.is_active ? 'Active' : 'Deactivated'}</span>
                  <Button size="sm" variant={s.is_active ? 'danger' : 'secondary'} loading={busyId === s.id} onClick={() => toggleActive(s.id, s.is_active)}>
                    {s.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<UserCog className="h-5 w-5" />} title="No staff yet" />
        )}
      </Card>
    </div>
  );
}
