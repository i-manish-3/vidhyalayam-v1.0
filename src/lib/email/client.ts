import nodemailer, { type Transporter } from 'nodemailer'

// Email transport. SMTP creds are validated lazily on first send so the dev
// environment can run without SMTP_HOST configured — the email module falls
// back to logging the message to the console in that case. Production enforces
// strict validation: a missing var while NODE_ENV === 'production' throws.

export interface EmailEnvelope {
  to: string
  subject: string
  text: string
  html: string
}

interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
  from: string
}

let cachedTransport: Transporter | null = null
let cachedConfig: SmtpConfig | null = null

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST
  const portRaw = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM

  // All-or-nothing: if any required var is missing we treat SMTP as
  // unconfigured. Partial config is almost always a misconfiguration, and
  // silently using a "half" config would just produce confusing failures.
  if (!host || !portRaw || !user || !pass || !from) {
    if (process.env.NODE_ENV === 'production') {
      const missing = [
        !host && 'SMTP_HOST',
        !portRaw && 'SMTP_PORT',
        !user && 'SMTP_USER',
        !pass && 'SMTP_PASS',
        !from && 'SMTP_FROM',
      ].filter(Boolean).join(', ')
      throw new Error(
        `SMTP is not configured in production. Missing: ${missing}. ` +
        'Set these in your environment before deploying.',
      )
    }
    return null
  }

  const port = Number(portRaw)
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`SMTP_PORT must be a valid port number, got: ${portRaw}`)
  }

  return { host, port, user, pass, from }
}

function getTransport(): Transporter | null {
  const config = readSmtpConfig()
  if (!config) return null

  // Re-create the transport if the env actually changed between calls.
  if (cachedTransport && cachedConfig && JSON.stringify(cachedConfig) === JSON.stringify(config)) {
    return cachedTransport
  }

  cachedTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // STARTTLS for 587/25, implicit TLS for 465.
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  })
  cachedConfig = config
  return cachedTransport
}

export async function sendEmail(envelope: EmailEnvelope): Promise<{ sent: boolean; via: 'smtp' | 'console' }> {
  const transport = getTransport()
  const config = cachedConfig

  if (!transport || !config) {
    // Dev fallback — print the email so the developer can grab the reset link
    // from the server logs without needing real SMTP credentials.
    console.log('\n========== [email:dev-fallback] ==========')
    console.log(`To:      ${envelope.to}`)
    console.log(`Subject: ${envelope.subject}`)
    console.log('---- Text ----')
    console.log(envelope.text)
    console.log('==========================================\n')
    return { sent: true, via: 'console' }
  }

  await transport.sendMail({
    from: config.from,
    to: envelope.to,
    subject: envelope.subject,
    text: envelope.text,
    html: envelope.html,
  })
  return { sent: true, via: 'smtp' }
}
