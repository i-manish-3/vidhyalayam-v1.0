import { db } from '@/lib/db'

/**
 * Notification template rendering with {{variable}} interpolation.
 *
 * Resolution order for a (key, channel):
 *   1. school-specific template (schoolId = the tenant)
 *   2. system template (schoolId = null)
 *   3. caller-provided fallback
 * Unknown {{vars}} are replaced with an empty string (never left raw).
 */

export interface RenderedTemplate {
  title: string
  body: string
  /** true when a DB template was found; false when the fallback was used. */
  matched: boolean
}

export type TemplateVars = Record<string, string | number | null | undefined>

const VAR_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g

export function interpolate(text: string, vars: TemplateVars): string {
  return text.replace(VAR_PATTERN, (_match, name: string) => {
    const value = vars[name]
    return value === null || value === undefined ? '' : String(value)
  })
}

export interface ResolveTemplateArgs {
  schoolId: string | null
  key: string
  channel?: string
  vars?: TemplateVars
  fallback?: { title: string; body: string }
}

export async function renderTemplate(args: ResolveTemplateArgs): Promise<RenderedTemplate> {
  const { schoolId, key, channel = 'IN_APP', vars = {}, fallback } = args

  // Prefer the school override, then the system template.
  const candidates = await db.notificationTemplate.findMany({
    where: {
      key,
      channel,
      isActive: true,
      OR: [{ schoolId }, { schoolId: null }],
    },
  })

  const tmpl =
    candidates.find((t) => t.schoolId === schoolId) ??
    candidates.find((t) => t.schoolId === null) ??
    null

  if (tmpl) {
    return {
      title: interpolate(tmpl.title, vars),
      body: interpolate(tmpl.body, vars),
      matched: true,
    }
  }

  if (fallback) {
    return {
      title: interpolate(fallback.title, vars),
      body: interpolate(fallback.body, vars),
      matched: false,
    }
  }

  // Last resort: never throw — surface the key so the gap is visible.
  return { title: key, body: '', matched: false }
}
