import type { School } from '@/lib/store'

const DEFAULT_TITLE = 'Vidhyalayam - School Management System'
const DEFAULT_ICON = '/icon.svg'
const BRANDING_STORAGE_KEY = 'erp_schoolBranding'
const ICON_SELECTOR = "link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"

type SchoolBranding = Pick<School, 'name' | 'favicon' | 'logo'>

let managedIconUrl: string | null = null

export function getSchoolBrowserTitle(school?: Pick<School, 'name'> | null) {
  return school?.name ? `${school.name} Dashboard` : DEFAULT_TITLE
}

export function getSchoolBrowserIcon(school?: Pick<School, 'favicon' | 'logo'> | null) {
  return school?.favicon || school?.logo || DEFAULT_ICON
}

function getImageMimeType(source: string) {
  const match = source.match(/^data:(image\/[^;,]+)[;,]/)
  return match?.[1] || undefined
}

function getSourceMimeType(source: string) {
  const dataMimeType = getImageMimeType(source)
  if (dataMimeType) return dataMimeType

  const path = source.split('?', 1)[0].toLowerCase()
  if (path.endsWith('.ico')) return 'image/x-icon'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.gif')) return 'image/gif'
  return undefined
}

function getFreshIconHref(source: string) {
  if (managedIconUrl) {
    URL.revokeObjectURL(managedIconUrl)
    managedIconUrl = null
  }

  if (!source.startsWith('data:image/')) {
    return source.includes('?') ? `${source}&v=${Date.now()}` : `${source}?v=${Date.now()}`
  }

  try {
    const [meta, data] = source.split(',', 2)
    const mime = getImageMimeType(source) || 'image/png'
    const isBase64 = meta.includes(';base64')
    const binary = isBase64 ? atob(data) : decodeURIComponent(data)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    managedIconUrl = URL.createObjectURL(new Blob([bytes], { type: mime }))
    return managedIconUrl
  } catch {
    return source
  }
}

function syncIconLink(icon: HTMLLinkElement, source: string, href: string) {
  const type = getSourceMimeType(source)
  if (type) icon.type = type
  else icon.removeAttribute('type')
  icon.sizes = 'any'
  icon.setAttribute('data-school-icon-source', source)
  icon.href = href
}

function syncExistingIconLinks(source: string, href: string) {
  document.querySelectorAll<HTMLLinkElement>(ICON_SELECTOR).forEach((icon) => {
    syncIconLink(icon, source, href)
  })
}

function upsertIconLink(rel: string, source: string, href: string) {
  let icon = document.querySelector<HTMLLinkElement>(`link[data-school-branding='favicon'][rel='${rel}']`)
  if (!icon) {
    icon = document.createElement('link')
    icon.rel = rel
    icon.setAttribute('data-school-branding', 'favicon')
    document.head.appendChild(icon)
  }

  syncIconLink(icon, source, href)
}

export function cacheSchoolBranding(school?: SchoolBranding | null) {
  if (typeof window === 'undefined' || !school?.name) return

  const branding: SchoolBranding = {
    name: school.name,
    favicon: school.favicon || undefined,
    logo: school.logo || undefined,
  }

  try {
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(branding))
  } catch {
    try {
      sessionStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(branding))
    } catch {
      // Branding still updates in the current tab even if storage is full.
    }
  }
}

export function applySchoolBranding(school?: SchoolBranding | null) {
  if (typeof document === 'undefined') return

  document.title = getSchoolBrowserTitle(school)

  // Do NOT remove existing <link rel="icon"> elements here even if they look
  // "default" — React's reconciler may still track them, and removing them
  // out-of-band crashes the next commit with "Cannot read properties of null
  // (reading 'removeChild')". Browsers honor the LAST favicon link, so
  // upserting our managed link below is enough to win.
  const iconSource = getSchoolBrowserIcon(school)
  const iconHref = getFreshIconHref(iconSource)
  syncExistingIconLinks(iconSource, iconHref)
  upsertIconLink('icon', iconSource, iconHref)
  upsertIconLink('shortcut icon', iconSource, iconHref)
  upsertIconLink('apple-touch-icon', iconSource, iconHref)
  cacheSchoolBranding(school)
}
