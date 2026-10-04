'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { patientsApi } from '@/lib/api';

interface MyPatientResult {
  patientId: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Resolves the current patient/family user's own PatientProfile via the
 * real GET /api/patients/me/ endpoint. This used to be a workaround
 * (discovering the id indirectly via family-links/admissions) because no
 * such endpoint existed — it now does, so this hook is a thin wrapper
 * around it rather than the workaround itself.
 */
export function useMyPatientId(): MyPatientResult {
  const { user } = useAuth();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
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
            user!.role === 'FAMILY'
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
 * Deliberately keeps ONLY id, LifeLink ID and name from /patients/me/.
 * Medical details are loaded through GET /patients/<id>/ instead, because
 * that endpoint enforces family consent and this one does not.
 */
export function useLinkedPatients() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    patientsApi.me()
      .then((rows) => !cancelled && setPatients(rows.map((r) => ({ id: r.id, lifelink_patient_id: r.lifelink_patient_id, full_name: r.full_name }))))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [user, tick]);

  return { patients, loading, failed, refetch: () => setTick((t) => t + 1) };
}
