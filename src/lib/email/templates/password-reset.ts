import type { EmailEnvelope } from '../client'

export type PasswordResetRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN'

interface PasswordResetEmailInput {
  to: string
  name: string
  resetUrl: string
  ip: string
  userAgent: string
  expiresAt: Date
  role: PasswordResetRole
  schoolName: string | null
}

const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const formatExpiry = (date: Date): string => {
  const minutes = Math.max(1, Math.round((date.getTime() - Date.now()) / 60000))
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

export function buildPasswordResetEmail(input: PasswordResetEmailInput): EmailEnvelope {
  const { to, name, resetUrl, ip, userAgent, expiresAt, role, schoolName } = input
  const expiryLabel = formatExpiry(expiresAt)

  // Subject + intro adapt to whether this is a platform-level (super admin)
  // or school-level (school admin) reset, so the recipient instantly knows
  // which inbox/account the link is for.
  const roleLabel = role === 'SUPER_ADMIN' ? 'super admin' : 'school admin'
  const subject =
    role === 'SUPER_ADMIN'
      ? 'Reset your Vidhyalayam ERP super admin password'
      : schoolName
        ? `Reset your ${schoolName} admin password`
        : 'Reset your Vidhyalayam ERP school admin password'

  const accountLine =
    role === 'SCHOOL_ADMIN' && schoolName
      ? `We received a request to reset the password for your school admin account at ${schoolName}.`
      : `We received a request to reset the password for your ${roleLabel} account.`

  const text = [
    `Hi ${name},`,
    '',
    accountLine,
    '',
    `Reset link (valid for ${expiryLabel}):`,
    resetUrl,
    '',
    'Request details:',
    `  IP address: ${ip}`,
    `  Device:     ${userAgent}`,
    `  Time:       ${new Date().toISOString()}`,
    '',
    'If you did not request this, ignore this email and your password will not change.',
    'If you suspect your account is compromised, consider rotating your password as a precaution.',
    '',
    '— Vidhyalayam ERP',
  ].join('\n')

  const htmlAccountLine =
    role === 'SCHOOL_ADMIN' && schoolName
      ? `We received a request to reset the password for your school admin account at <strong>${escapeHtml(schoolName)}</strong>. Click the button below to choose a new password. This link is valid for <strong>${escapeHtml(expiryLabel)}</strong>.`
      : `We received a request to reset the password for your ${escapeHtml(roleLabel)} account. Click the button below to choose a new password. This link is valid for <strong>${escapeHtml(expiryLabel)}</strong>.`

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; background: #f5f5f5; padding: 24px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 600;">Reset your password</h1>
    <p style="margin: 0 0 12px;">Hi ${escapeHtml(name)},</p>
    <p style="margin: 0 0 20px;">${htmlAccountLine}</p>
    <p style="margin: 0 0 24px;">
      <a href="${escapeHtml(resetUrl)}" style="display: inline-block; background: #1a1a1a; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 500;">Reset password</a>
    </p>
    <p style="margin: 0 0 8px; font-size: 13px; color: #555;">Or paste this link into your browser:</p>
    <p style="margin: 0 0 24px; font-size: 13px; word-break: break-all; color: #1a1a1a;"><a href="${escapeHtml(resetUrl)}" style="color: #1a1a1a;">${escapeHtml(resetUrl)}</a></p>
    <div style="border-top: 1px solid #eee; padding-top: 16px; margin-top: 16px; font-size: 13px; color: #555;">
      <p style="margin: 0 0 8px; font-weight: 600; color: #1a1a1a;">Request details</p>
      <p style="margin: 0 0 4px;">IP address: ${escapeHtml(ip)}</p>
      <p style="margin: 0 0 4px;">Device: ${escapeHtml(userAgent)}</p>
      <p style="margin: 0 0 4px;">Time: ${escapeHtml(new Date().toISOString())}</p>
    </div>
    <p style="margin: 24px 0 0; font-size: 13px; color: #555;">
      If you did not request this, you can safely ignore this email — your password will not change. If you suspect your account is compromised, rotate your password as a precaution.
    </p>
  </div>
</body>
</html>`

  return { to, subject, text, html }
}
