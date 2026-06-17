/**
 * Admit-card template config — the visual customization a school controls from
 * the Exams → Admit Card Template page. Stored as JSON on `School.admitCardTemplate`.
 * The data (student/exam/school values) comes from the generator; this config only
 * decides how it looks and which parts are shown.
 */

export type AdmitCardHeaderStyle = 'logo-left' | 'centered' | 'banner'

export interface AdmitCardStudentFieldVisibility {
  fatherName: boolean
  motherName: boolean
  dateOfBirth: boolean
  admissionNumber: boolean
  rollNumber: boolean
  gender: boolean
  session: boolean
  classSection: boolean
}

export interface AdmitCardScheduleColumns {
  day: boolean
  time: boolean
  room: boolean
  duration: boolean
}

export interface AdmitCardSignatureLabels {
  left: string
  middle: string
  right: string // principal column
}

export interface AdmitCardTemplateConfig {
  accentColor: string // hex; drives header bar / table head / footer
  headerStyle: AdmitCardHeaderStyle
  titlePrefix: string // e.g. "Admit Card"
  showPhoto: boolean
  showQr: boolean
  showInstructions: boolean
  fields: AdmitCardStudentFieldVisibility
  scheduleColumns: AdmitCardScheduleColumns
  signatures: AdmitCardSignatureLabels
}

export const DEFAULT_ADMIT_CARD_TEMPLATE: AdmitCardTemplateConfig = {
  accentColor: '#1a3a6b',
  headerStyle: 'logo-left',
  titlePrefix: 'Admit Card',
  showPhoto: true,
  showQr: true,
  showInstructions: true,
  fields: {
    fatherName: true,
    motherName: true,
    dateOfBirth: true,
    admissionNumber: true,
    rollNumber: true,
    gender: false,
    session: true,
    classSection: true,
  },
  scheduleColumns: {
    day: true,
    time: true,
    room: false,
    duration: false,
  },
  signatures: {
    left: "Student's Signature",
    middle: 'Class Teacher',
    right: 'Principal',
  },
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function asString(v: unknown, fallback: string, maxLen = 60): string {
  if (typeof v !== 'string') return fallback
  const t = v.trim()
  return t ? t.slice(0, maxLen) : fallback
}

/**
 * Parse the stored JSON into a fully-populated config, merging over defaults so
 * a partial/old/missing value never breaks the renderer.
 */
export function parseAdmitCardTemplate(raw: string | null | undefined): AdmitCardTemplateConfig {
  const d = DEFAULT_ADMIT_CARD_TEMPLATE
  if (!raw) return d
  let obj: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return d
    obj = parsed as Record<string, unknown>
  } catch {
    return d
  }

  const accent = typeof obj.accentColor === 'string' && HEX_RE.test(obj.accentColor.trim())
    ? obj.accentColor.trim()
    : d.accentColor
  const headerStyle: AdmitCardHeaderStyle =
    obj.headerStyle === 'centered' || obj.headerStyle === 'banner' || obj.headerStyle === 'logo-left'
      ? obj.headerStyle
      : d.headerStyle

  const f = (obj.fields ?? {}) as Record<string, unknown>
  const sc = (obj.scheduleColumns ?? {}) as Record<string, unknown>
  const sg = (obj.signatures ?? {}) as Record<string, unknown>

  return {
    accentColor: accent,
    headerStyle,
    titlePrefix: asString(obj.titlePrefix, d.titlePrefix, 40),
    showPhoto: asBool(obj.showPhoto, d.showPhoto),
    showQr: asBool(obj.showQr, d.showQr),
    showInstructions: asBool(obj.showInstructions, d.showInstructions),
    fields: {
      fatherName: asBool(f.fatherName, d.fields.fatherName),
      motherName: asBool(f.motherName, d.fields.motherName),
      dateOfBirth: asBool(f.dateOfBirth, d.fields.dateOfBirth),
      admissionNumber: asBool(f.admissionNumber, d.fields.admissionNumber),
      rollNumber: asBool(f.rollNumber, d.fields.rollNumber),
      gender: asBool(f.gender, d.fields.gender),
      session: asBool(f.session, d.fields.session),
      classSection: asBool(f.classSection, d.fields.classSection),
    },
    scheduleColumns: {
      day: asBool(sc.day, d.scheduleColumns.day),
      time: asBool(sc.time, d.scheduleColumns.time),
      room: asBool(sc.room, d.scheduleColumns.room),
      duration: asBool(sc.duration, d.scheduleColumns.duration),
    },
    signatures: {
      left: asString(sg.left, d.signatures.left),
      middle: asString(sg.middle, d.signatures.middle),
      right: asString(sg.right, d.signatures.right),
    },
  }
}

/** Validate + normalise an incoming config object (from the editor) for storage. */
export function normalizeAdmitCardTemplate(input: unknown): AdmitCardTemplateConfig {
  // Reuse the parser by round-tripping through JSON so the same guards apply.
  try {
    return parseAdmitCardTemplate(JSON.stringify(input))
  } catch {
    return DEFAULT_ADMIT_CARD_TEMPLATE
  }
}
