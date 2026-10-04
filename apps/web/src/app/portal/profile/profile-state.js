export function hasPatientProfileData(patient) {
  if (!patient || typeof patient !== 'object') return false;
  return typeof patient.full_name === 'string' && patient.full_name.trim().length > 0;
}
