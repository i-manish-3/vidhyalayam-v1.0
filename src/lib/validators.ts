export const digitsOnly = (value: string): string => value.replace(/\D/g, '')

export const validateRequired = (value: string, label: string): string | null => {
  if (!value || !value.trim()) return `${label} is required.`
  return null
}

export const validateEmail = (value: string, required = false): string | null => {
  const v = (value || '').trim()
  if (!v) return required ? 'Email is required.' : null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address.'
  return null
}

export const validatePhone10 = (value: string, required = false): string | null => {
  const v = (value || '').trim()
  if (!v) return required ? 'Phone number is required.' : null
  const digits = digitsOnly(v)
  if (digits.length !== 10) return 'Phone must be exactly 10 digits.'
  if (!/^[6-9]/.test(digits)) return 'Phone must start with 6, 7, 8 or 9.'
  return null
}

export const validatePincode = (value: string, required = false): string | null => {
  const v = (value || '').trim()
  if (!v) return required ? 'Pincode is required.' : null
  if (!/^\d{6}$/.test(v)) return 'Pincode must be exactly 6 digits.'
  if (/^0/.test(v)) return 'Pincode cannot start with 0.'
  return null
}

export const validateSubdomain = (value: string, required = false): string | null => {
  const v = (value || '').trim().toLowerCase()
  if (!v) return required ? 'Subdomain is required.' : null
  if (v.length < 3) return 'Subdomain must be at least 3 characters.'
  if (v.length > 30) return 'Subdomain must be at most 30 characters.'
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(v))
    return 'Use lowercase letters, numbers and hyphens only (cannot start/end with hyphen).'
  return null
}

export const validateWebsite = (value: string, required = false): string | null => {
  const v = (value || '').trim()
  if (!v) return required ? 'Website is required.' : null
  if (!/^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/[^\s]*)?$/i.test(v))
    return 'Enter a valid website URL.'
  return null
}

export const validateHexColor = (value: string, required = false): string | null => {
  const v = (value || '').trim()
  if (!v) return required ? 'Color is required.' : null
  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) return 'Enter a valid hex color (e.g. #10B981).'
  return null
}

export const validatePassword = (value: string, minLength = 6): string | null => {
  if (!value) return 'Password is required.'
  if (value.length < minLength) return `Password must be at least ${minLength} characters.`
  return null
}

export const validatePasswordMatch = (password: string, confirm: string): string | null => {
  if (!confirm) return 'Please confirm the password.'
  if (password !== confirm) return 'Passwords do not match.'
  return null
}

export const validateName = (value: string, label = 'Name'): string | null => {
  const v = (value || '').trim()
  if (!v) return `${label} is required.`
  if (v.length < 2) return `${label} must be at least 2 characters.`
  if (!/^[a-zA-Z\s.'-]+$/.test(v)) return `${label} can only contain letters, spaces, dots, hyphens and apostrophes.`
  return null
}

export const validateAcademicYear = (value: string, required = false): string | null => {
  const v = (value || '').trim()
  if (!v) return required ? 'Academic year is required.' : null
  if (!/^\d{4}-\d{4}$/.test(v)) return 'Use format YYYY-YYYY (e.g. 2025-2026).'
  const [start, end] = v.split('-').map(Number)
  if (end !== start + 1) return 'End year must be exactly one after start year.'
  return null
}
