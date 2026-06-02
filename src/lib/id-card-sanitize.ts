// Server-side sanitizer for HTML/CSS templates authored by school admins.
//
// We render these templates inside the app and on the print page, so a script
// tag or an `onerror=` handler injected by a malicious admin could run with
// the same privileges as the user viewing the cards. This module strips
// anything dangerous before the template hits the DB.
//
// Design decisions:
//   - Reject any <script>, <iframe>, <object>, <embed>, <link>, <meta>, <base>.
//   - Strip every `on*=...` event handler (onclick, onerror, onload, ...).
//   - Strip URL schemes that execute code: `javascript:`, `data:text/html`,
//     `vbscript:`. Allow `data:image/*` so admins can embed inline images.
//   - Strip `<style>` blocks inside HTML (CSS belongs in the CSS field).
//   - For CSS: block `expression(...)` (legacy IE) and `@import`/`url(javascript:...)`.
//
// This is a defence-in-depth measure — even with sanitized input we still
// render via React's controlled `dangerouslySetInnerHTML` inside a scoped
// container, never at the document root, and never with JS execution.

const FORBIDDEN_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'style',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'video',
  'audio',
  'source',
  'track',
]

const FORBIDDEN_PROTOCOLS = /javascript:|vbscript:|data:text\/html|data:application\/xhtml/i

export interface SanitizeResult {
  html: string
  warnings: string[]
}

export function sanitizeTemplateHtml(input: string | null | undefined): SanitizeResult {
  if (!input) return { html: '', warnings: [] }
  const warnings: string[] = []
  let html = input

  // Drop forbidden tags entirely — opening tag, optional content, closing tag.
  for (const tag of FORBIDDEN_TAGS) {
    const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
    if (pattern.test(html)) {
      warnings.push(`Removed <${tag}> blocks`)
      html = html.replace(pattern, '')
    }
    // Also drop self-closing variants e.g. <input/>, <meta>
    const selfClose = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi')
    if (selfClose.test(html)) {
      warnings.push(`Removed <${tag}> tags`)
      html = html.replace(selfClose, '')
    }
  }

  // Strip event handlers — anything matching `on[a-z]+=` whether quoted or not.
  const handlerCount = (html.match(/\son[a-z]+\s*=/gi) || []).length
  if (handlerCount > 0) {
    warnings.push(`Removed ${handlerCount} event handler${handlerCount === 1 ? '' : 's'}`)
    html = html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    html = html.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
  }

  // Strip dangerous protocols inside attribute values.
  if (FORBIDDEN_PROTOCOLS.test(html)) {
    warnings.push('Removed unsafe URL schemes (javascript:, vbscript:, data:text/html)')
    html = html.replace(/(href|src|action|formaction|background|poster|xlink:href)\s*=\s*"[^"]*(javascript:|vbscript:|data:text\/html|data:application\/xhtml)[^"]*"/gi, '$1=""')
    html = html.replace(/(href|src|action|formaction|background|poster|xlink:href)\s*=\s*'[^']*(javascript:|vbscript:|data:text\/html|data:application\/xhtml)[^']*'/gi, "$1=''")
  }

  return { html, warnings }
}

export function sanitizeTemplateCss(input: string | null | undefined): SanitizeResult {
  if (!input) return { html: '', warnings: [] }
  const warnings: string[] = []
  let css = input

  // Block CSS expression() — legacy IE attack vector still recognised by some
  // older bundlers.
  if (/expression\s*\(/i.test(css)) {
    warnings.push('Removed CSS expression() calls')
    css = css.replace(/expression\s*\([^)]*\)/gi, '')
  }

  // Block `url(javascript:...)`, `url(vbscript:...)`.
  if (/url\s*\(\s*["']?\s*(javascript:|vbscript:|data:text\/html)/i.test(css)) {
    warnings.push('Removed unsafe url() schemes')
    css = css.replace(/url\s*\(\s*["']?\s*(javascript:|vbscript:|data:text\/html)[^)]*\)/gi, 'url()')
  }

  // Block @import — admins shouldn't be loading external stylesheets that
  // might leak the rendered page state to a third party.
  if (/@import\b/i.test(css)) {
    warnings.push('Removed @import rules')
    css = css.replace(/@import[^;]+;/gi, '')
  }

  return { html: css, warnings }
}

// Re-scopes raw CSS so its selectors only match elements under `.scope`. This
// lets us render two different card templates on the same A4 sheet without
// their CSS leaking into each other.
//
// Implementation: walks the rule list and prepends `.scope ` to every selector
// in every rule. Skips at-rules (@media, @keyframes, @font-face, etc.) which
// either need recursion or aren't selector-based.
//
// Caveat: this is a best-effort regex-based parser, not a full CSS parser.
// It handles the cases real admin templates will use; truly hostile CSS would
// have been sanitized above.
export function scopeCss(css: string, scope: string): string {
  if (!css) return ''
  const safeScope = scope.startsWith('.') || scope.startsWith('#') ? scope : `.${scope}`

  // Drop the body/html selectors entirely — they'd target the host page.
  let stripped = css
    .replace(/(^|\})\s*(html|body)\s*\{/gi, (_, prefix) => `${prefix} ${safeScope} {`)

  // Match top-level rules: `selectorList { body }` and at-rules.
  const RULE_RE = /(@[\w-]+[^{;]*(?:\{(?:[^{}]|\{[^{}]*\})*\}|;))|([^{}]+)\{([^{}]*)\}/g

  return stripped.replace(RULE_RE, (full, atRule, selectorList, body) => {
    if (atRule) {
      // Recurse into the block contents for @media, @supports, etc. so their
      // inner selectors also get scoped.
      const blockMatch = atRule.match(/^(@[\w-]+[^{]*)\{([\s\S]*)\}$/)
      if (!blockMatch) return atRule
      const [, header, inner] = blockMatch
      // Skip @keyframes / @font-face — selectors inside aren't real selectors.
      if (/^@(keyframes|font-face|page|charset|namespace)/i.test(header)) {
        return atRule
      }
      return `${header}{${scopeCss(inner, safeScope)}}`
    }
    const scoped = selectorList
      .split(',')
      .map((s: string) => {
        const sel = s.trim()
        if (!sel) return ''
        // Don't double-scope if author already wrote our scope.
        if (sel.startsWith(safeScope)) return sel
        // Wrap :root etc. so it targets the card box.
        if (sel.startsWith(':root')) return safeScope + sel.replace(':root', '')
        return `${safeScope} ${sel}`
      })
      .filter(Boolean)
      .join(', ')
    return `${scoped}{${body}}`
  })
}
