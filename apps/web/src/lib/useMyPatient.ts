'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ApiError, patientsApi } from '@/lib/api';

interface MyPatientResult {
  patientId: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Resolves the current patient/family user's own PatientProfile via the
 * GET /api/patients/me/ endpoint. This endpoint is intentionally limited
 * to patient and family accounts; hospital users must use their scoped APIs.
 */
export function useMyPatientId(): MyPatientResult {
  const { user } = useAuth();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'PATIENT' && user.role !== 'FAMILY') {
      setPatientId(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function resolve() {
      setLoading(true);
      setError(null);
      try {
        const patients = await patientsApi.me();
        if (cancelled) return;
        if (patients.length > 0) {
          setPatientId(patients[0].id);
        } else {
          setError(
            user.role === 'FAMILY'
              ? 'No patient profile is linked to your family account yet.'
              : 'Your profile has not been linked to any hospital record yet, so it cannot be displayed here.'
          );
        }
      } catch {
        if (!cancelled) setError('Could not load your profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { patientId, loading, error };
}

export interface LinkedPatient {
  id: string;
  lifelink_patient_id: string;
  full_name: string;
}

/**
 * All patients linked to this account (a family user may have several).
 * Hospital roles are deliberately excluded: /patients/me/ is not a staff
 * search endpoint and must never be called from their dashboards.
 */
export function useLinkedPatients() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [failureStatus, setFailureStatus] = useState<number | undefined>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'PATIENT' && user.role !== 'FAMILY') {
      setPatients([]);
      setLoading(false);
      setFailed(false);
      setFailureStatus(undefined);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setFailureStatus(undefined);
    patientsApi.me()
      .then((rows) => !cancelled && setPatients(rows.map((r) => ({ id: r.id, lifelink_patient_id: r.lifelink_patient_id, full_name: r.full_name }))))
      .catch((err) => {
        if (cancelled) return;
        setFailed(true);
        setFailureStatus(err instanceof ApiError ? err.status : undefined);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, tick]);

  return { patients, loading, failed, failureStatus, refetch: () => setTick((t) => t + 1) };
}
