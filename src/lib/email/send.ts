import { sendEmail } from './client'
import { buildPasswordResetEmail, type PasswordResetRole } from './templates/password-reset'

interface SendPasswordResetEmailInput {
  to: string
  name: string
  resetUrl: string
  ip: string
  userAgent: string
  expiresAt: Date
  role: PasswordResetRole
  schoolName: string | null
}

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<{ via: 'smtp' | 'console' }> {
  const envelope = buildPasswordResetEmail(input)
  const result = await sendEmail(envelope)
  return { via: result.via }
}
