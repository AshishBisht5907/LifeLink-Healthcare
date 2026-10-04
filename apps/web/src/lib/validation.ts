/**
 * Field validation utilities for LifeLink forms.
 * Provides validation for common fields used in registration and management forms.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate email format.
 */
export function validateEmail(email: string): ValidationResult {
  if (!email.trim()) {
    return { valid: false, error: 'Email is required' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }

  return { valid: true };
}

/**
 * Validate phone number format (basic: 10+ digits).
 */
export function validatePhone(phone: string): ValidationResult {
  if (!phone.trim()) {
    return { valid: false, error: 'Phone number is required' };
  }

  const phoneRegex = /^\d{10,}$/;
  const digitsOnly = phone.replace(/\D/g, '');

  if (!phoneRegex.test(digitsOnly)) {
    return { valid: false, error: 'Phone number must be at least 10 digits' };
  }

  return { valid: true };
}

/**
 * Validate date of birth (must be a past date).
 */
export function validateDOB(dob: string): ValidationResult {
  if (!dob.trim()) {
    return { valid: false, error: 'Date of birth is required' };
  }

  const dobDate = new Date(dob);
  const today = new Date();

  if (isNaN(dobDate.getTime())) {
    return { valid: false, error: 'Please enter a valid date' };
  }

  if (dobDate >= today) {
    return { valid: false, error: 'Date of birth must be in the past' };
  }

  // Optionally check for reasonable age (e.g., not more than 150 years old)
  const age = today.getFullYear() - dobDate.getFullYear();
  if (age > 150) {
    return { valid: false, error: 'Please enter a valid date of birth' };
  }

  return { valid: true };
}

/**
 * Validate required field (non-empty string).
 */
export function validateRequired(value: string, fieldName: string): ValidationResult {
  if (!value.trim()) {
    return { valid: false, error: `${fieldName} is required` };
  }

  return { valid: true };
}

/**
 * Validate gender selection (optional, but must match expected values if provided).
 */
export function validateGender(gender: string): ValidationResult {
  const validGenders = ['M', 'F', 'U', 'O'];
  if (gender && !validGenders.includes(gender)) {
    return { valid: false, error: 'Please select a valid gender' };
  }

  return { valid: true };
}

/**
 * Validate address (optional, but max length check if provided).
 */
export function validateAddress(address: string, maxLength = 500): ValidationResult {
  if (address && address.length > maxLength) {
    return { valid: false, error: `Address must not exceed ${maxLength} characters` };
  }

  return { valid: true };
}
