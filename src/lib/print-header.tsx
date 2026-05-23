// Shared print header used across every printable surface (admission form,
// fee receipt, future TC / certificates). If the school admin has uploaded a
// banner image, it's rendered full-width. Otherwise we fall back to an
// auto-built header from the school's logo + name + address + contact.

export interface SchoolForPrintHeader {
  printHeader?: string | null
  logo?: string | null
  name: string
  address?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  country?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  website?: string | null
  board?: string | null
}

function joinSchoolAddress(school: SchoolForPrintHeader): string {
  return [school.address, school.city, school.state, school.pincode].filter(Boolean).join(', ')
}

function joinSchoolContact(school: SchoolForPrintHeader): string {
  return [school.contactPhone, school.contactEmail, school.website].filter(Boolean).join(' · ')
}

// React surface — used inside the admission form's print container.
// `rightSlot` lets the caller drop a student photo (or any extra artwork) on
// the right side of the fallback header. It is ignored when the banner image
// is used, because the banner is meant to be a single piece of artwork.
export function SchoolPrintHeader({
  school,
  rightSlot,
}: {
  school: SchoolForPrintHeader | null
  rightSlot?: React.ReactNode
}) {
  if (!school) return null

  if (school.printHeader) {
    return (
      <div className="w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={school.printHeader} alt="" className="block w-full" />
      </div>
    )
  }

  const addressLine = joinSchoolAddress(school)
  const contactLine = joinSchoolContact(school)

  return (
    <div className="flex items-start gap-3 border-b-2 border-black pb-3">
      {school.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={school.logo} alt="" className="h-16 w-16 shrink-0 object-contain" />
      )}
      <div className="flex-1 text-center">
        <h1 className="text-xl font-bold uppercase tracking-wide">{school.name}</h1>
        {addressLine && <p className="text-[11px]">{addressLine}</p>}
        {contactLine && <p className="text-[11px]">{contactLine}</p>}
        {school.board && <p className="text-[11px] italic">Affiliated to {school.board}</p>}
      </div>
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// HTML-string surface — used by code paths that inject raw HTML into a new
// window (e.g. fee receipt's window.open(...).document.write()). Returns an
// empty string when there's no banner AND the caller didn't ask for a fallback,
// so receipts stay header-less by default (matches the chosen UX: receipt is
// only branded once admin uploads a banner).
export function buildPrintHeaderHtml(
  school: SchoolForPrintHeader | null,
  options: { fallbackToAutoHeader?: boolean } = {}
): string {
  if (!school) return ''

  if (school.printHeader) {
    return `<div style="width:100%"><img src="${escapeHtml(school.printHeader)}" alt="" style="display:block;width:100%" /></div>`
  }

  if (!options.fallbackToAutoHeader) return ''

  const addressLine = escapeHtml(joinSchoolAddress(school))
  const contactLine = escapeHtml(joinSchoolContact(school))
  const name = escapeHtml(school.name)
  const logo = school.logo ? escapeHtml(school.logo) : ''
  const board = school.board ? escapeHtml(school.board) : ''

  return `
    <div style="display:flex;align-items:flex-start;gap:12px;border-bottom:2px solid #000;padding-bottom:10px;">
      ${logo ? `<img src="${logo}" alt="" style="height:60px;width:60px;flex-shrink:0;object-fit:contain;" />` : ''}
      <div style="flex:1;text-align:center;">
        <h1 style="margin:0;font-size:18px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">${name}</h1>
        ${addressLine ? `<p style="margin:2px 0;font-size:11px;">${addressLine}</p>` : ''}
        ${contactLine ? `<p style="margin:2px 0;font-size:11px;">${contactLine}</p>` : ''}
        ${board ? `<p style="margin:2px 0;font-size:11px;font-style:italic;">Affiliated to ${board}</p>` : ''}
      </div>
    </div>
  `
}
