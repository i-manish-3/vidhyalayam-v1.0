export type EasyTemplateStyleId = 'modern-band' | 'classic-center' | 'compact-pass'
export type EasyTemplatePaletteId = 'indigo' | 'emerald' | 'red' | 'slate'
export type EasyPhotoShape = 'rounded' | 'circle'

export type EasyFieldKey =
  | 'student.admissionNumber'
  | 'student.classSection'
  | 'student.rollNumber'
  | 'student.dateOfBirth'
  | 'student.bloodGroup'
  | 'student.parentPhone'
  | 'student.fatherName'
  | 'student.address'

export interface EasyTemplateSettings {
  styleId: EasyTemplateStyleId
  paletteId: EasyTemplatePaletteId
  orientation: 'portrait' | 'landscape'
  widthMm: number
  heightMm: number
  photoShape: EasyPhotoShape
  showSignature: boolean
  showQr: boolean
  hasBackSide: boolean
  fields: Record<EasyFieldKey, boolean>
}

export interface EasyTemplateBuildResult {
  frontHtml: string
  frontCss: string
  backHtml: string
  backCss: string
}

export const EASY_TEMPLATE_STYLES: Array<{ id: EasyTemplateStyleId; name: string; description: string }> = [
  {
    id: 'modern-band',
    name: 'Modern Band',
    description: 'Clean school header, strong name band, balanced photo and details.',
  },
  {
    id: 'classic-center',
    name: 'Classic Center',
    description: 'Formal centered card with photo focus and tidy information rows.',
  },
  {
    id: 'compact-pass',
    name: 'Compact Pass',
    description: 'Dense horizontal pass for quick scanning and bulk printing.',
  },
]

export const EASY_TEMPLATE_PALETTES: Array<{
  id: EasyTemplatePaletteId
  name: string
  primary: string
  accent: string
  soft: string
  ink: string
}> = [
  { id: 'indigo', name: 'Indigo', primary: '#1d4ed8', accent: '#f59e0b', soft: '#eff6ff', ink: '#0f172a' },
  { id: 'emerald', name: 'Emerald', primary: '#047857', accent: '#f97316', soft: '#ecfdf5', ink: '#10201a' },
  { id: 'red', name: 'Red', primary: '#dc2626', accent: '#facc15', soft: '#fff1f2', ink: '#1f1717' },
  { id: 'slate', name: 'Slate', primary: '#334155', accent: '#0ea5e9', soft: '#f1f5f9', ink: '#111827' },
]

export const EASY_TEMPLATE_FIELDS: Array<{ key: EasyFieldKey; label: string; token: string }> = [
  { key: 'student.admissionNumber', label: 'Admission No.', token: '{{student.admissionNumber}}' },
  { key: 'student.classSection', label: 'Class', token: '{{student.classSection}}' },
  { key: 'student.rollNumber', label: 'Roll No.', token: '{{student.rollNumber}}' },
  { key: 'student.dateOfBirth', label: 'Date of Birth', token: '{{student.dateOfBirth}}' },
  { key: 'student.bloodGroup', label: 'Blood Group', token: '{{student.bloodGroup}}' },
  { key: 'student.parentPhone', label: 'Parent Phone', token: '{{student.parentPhone}}' },
  { key: 'student.fatherName', label: "Father's Name", token: '{{student.fatherName}}' },
  { key: 'student.address', label: 'Address', token: '{{student.address}}' },
]

export const DEFAULT_EASY_TEMPLATE_SETTINGS: EasyTemplateSettings = {
  styleId: 'modern-band',
  paletteId: 'indigo',
  orientation: 'portrait',
  widthMm: 54,
  heightMm: 86,
  photoShape: 'rounded',
  showSignature: true,
  showQr: false,
  hasBackSide: false,
  fields: {
    'student.admissionNumber': true,
    'student.classSection': true,
    'student.rollNumber': true,
    'student.dateOfBirth': true,
    'student.bloodGroup': false,
    'student.parentPhone': false,
    'student.fatherName': false,
    'student.address': false,
  },
}

export function buildEasyTemplate(settings: EasyTemplateSettings): EasyTemplateBuildResult {
  const palette = EASY_TEMPLATE_PALETTES.find((item) => item.id === settings.paletteId) || EASY_TEMPLATE_PALETTES[0]
  const rows = buildRows(settings)
  const optionalQr = settings.showQr ? '<img src="{{qr}}" class="qr" alt="" />' : ''
  const optionalSignature = settings.showSignature
    ? '<div class="signature"><img src="{{signature}}" alt="" /><span>Principal</span></div>'
    : ''

  const frontHtml = settings.styleId === 'compact-pass'
    ? buildCompactHtml(rows, optionalQr, optionalSignature)
    : settings.styleId === 'classic-center'
      ? buildClassicHtml(rows, optionalQr, optionalSignature)
      : buildModernHtml(rows, optionalQr, optionalSignature)

  const frontCss = buildCss(settings, palette)
  const backHtml = settings.hasBackSide ? buildBackHtml(settings.showQr) : ''
  const backCss = settings.hasBackSide ? buildBackCss(palette) : ''

  return { frontHtml, frontCss, backHtml, backCss }
}

function buildRows(settings: EasyTemplateSettings) {
  return EASY_TEMPLATE_FIELDS
    .filter((field) => settings.fields[field.key])
    .map((field) => (
      `<div class="info-row" data-show-if="${field.key}"><span>${field.label}</span><strong>${field.token}</strong></div>`
    ))
    .join('\n    ')
}

function buildModernHtml(rows: string, qr: string, signature: string) {
  return `<div class="card easy modern">
  <div class="accent-shape"></div>
  <div class="top-bar">
    <img src="{{logo}}" class="logo" alt="" />
    <div>
      <div class="school">{{school.name}}</div>
      <div class="school-meta" data-show-if="school.address">{{school.address}}</div>
    </div>
  </div>
  <div class="body">
    <div class="photo-frame"><img src="{{photo}}" class="photo" alt="" /></div>
    <div class="student-name">{{student.name}}</div>
    <div class="student-class" data-show-if="student.classSection">{{student.classSection}}</div>
    <div class="info-list">
    ${rows}
    </div>
  </div>
  <div class="footer">
    <div data-show-if="school.phone">Ph: {{school.phone}}</div>
    ${qr}
    ${signature}
  </div>
</div>`
}

function buildClassicHtml(rows: string, qr: string, signature: string) {
  return `<div class="card easy classic">
  <div class="corner-mark"></div>
  <div class="school-block">
    <img src="{{logo}}" class="logo" alt="" />
    <div class="school">{{school.name}}</div>
    <div class="school-meta" data-show-if="school.address">{{school.address}}</div>
  </div>
  <div class="photo-frame"><img src="{{photo}}" class="photo" alt="" /></div>
  <div class="student-name">{{student.name}}</div>
  <div class="info-list">
    ${rows}
  </div>
  <div class="footer">
    <div data-show-if="school.phone">Ph: {{school.phone}}</div>
    ${qr}
    ${signature}
  </div>
</div>`
}

function buildCompactHtml(rows: string, qr: string, signature: string) {
  return `<div class="card easy compact">
  <div class="side-band"></div>
  <div class="main">
    <div class="header">
      <img src="{{logo}}" class="logo" alt="" />
      <div>
        <div class="school">{{school.name}}</div>
        <div class="school-meta" data-show-if="school.phone">{{school.phone}}</div>
      </div>
    </div>
    <div class="content">
      <div class="photo-frame"><img src="{{photo}}" class="photo" alt="" /></div>
      <div class="details">
        <div class="student-name">{{student.name}}</div>
        <div class="student-class" data-show-if="student.classSection">{{student.classSection}}</div>
        <div class="info-list">
          ${rows}
        </div>
      </div>
      <div class="right-stack">
        ${qr}
        ${signature}
      </div>
    </div>
  </div>
</div>`
}

function buildCss(
  settings: EasyTemplateSettings,
  palette: (typeof EASY_TEMPLATE_PALETTES)[number],
) {
  const photoRadius = settings.photoShape === 'circle' ? '50%' : '2.5mm'
  const compact = settings.styleId === 'compact-pass'
  const isLandscape = settings.orientation === 'landscape'
  const selectedCount = EASY_TEMPLATE_FIELDS.filter((field) => settings.fields[field.key]).length
  const isSmallPortrait = settings.orientation === 'portrait' && settings.heightMm <= 90
  const crowded = selectedCount >= 6 || (isSmallPortrait && selectedCount >= 5 && settings.showQr)
  const packed = selectedCount >= 8
  const rowGap = packed ? '.45mm' : crowded ? '.62mm' : '1mm'
  const rowPadding = '0'
  const rowFont = packed ? '4.9px' : crowded ? '5.25px' : isLandscape ? '5.9px' : '6.25px'
  const rowLineHeight = crowded ? '1.1' : '1.22'
  const portraitPhotoWidth = crowded ? '19mm' : '22mm'
  const portraitPhotoHeight = crowded ? '22mm' : '27mm'
  const headerHeight = isSmallPortrait && crowded ? '17mm' : isLandscape ? '16mm' : '21mm'
  const identityTop = isSmallPortrait && crowded ? '14.5mm' : isLandscape ? '13mm' : '18mm'
  const bodyPadding = isLandscape ? '3mm 4mm 2mm' : crowded ? '4mm 3.2mm 12mm' : '5mm 4mm 13mm'
  const footerBottom = crowded ? '1.6mm' : '2.5mm'
  const footerFont = crowded ? '4.5px' : '5.5px'
  const signatureWidth = crowded ? '15mm' : compact ? '17mm' : '19mm'
  const signatureImageHeight = crowded ? '4.6mm' : '6mm'
  const qrSize = crowded ? '9mm' : '12mm'

  return `.card.easy {
  --primary: ${palette.primary};
  --accent: ${palette.accent};
  --soft: ${palette.soft};
  --ink: ${palette.ink};
  width: 100%;
  height: 100%;
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
  background: linear-gradient(180deg, #ffffff 0%, var(--soft) 100%);
  color: var(--ink);
  border: .45mm solid rgba(148, 163, 184, .72);
  box-shadow: inset 0 0 0 .25mm rgba(255,255,255,.8);
  font-family: Arial, Helvetica, sans-serif;
}
.logo { width: ${compact ? '8mm' : '10mm'}; height: ${compact ? '8mm' : '10mm'}; object-fit: contain; border-radius: 50%; background: #fff; padding: .7mm; box-sizing: border-box; box-shadow: 0 .6mm 1.6mm rgba(15,23,42,.16); }
.school { font-size: ${crowded ? '7.2px' : compact ? '8px' : '9.5px'}; line-height: 1.05; font-weight: 900; text-transform: uppercase; overflow-wrap: anywhere; }
.school-meta { margin-top: .5mm; font-size: ${crowded ? '4.3px' : compact ? '4.8px' : '5.3px'}; line-height: 1.12; font-weight: 700; opacity: .9; }
.identity { display: inline-flex; align-items: center; justify-content: center; background: var(--accent); color: #111827; font-size: ${compact ? '5px' : '6px'}; font-weight: 900; letter-spacing: .3px; box-shadow: 0 .45mm 1.2mm rgba(15,23,42,.16); }
.photo-frame { overflow: hidden; border: .9mm solid #fff; outline: .55mm solid var(--primary); border-radius: ${photoRadius}; background: #f8fafc; box-shadow: 0 1mm 2.5mm rgba(15,23,42,.16); }
.photo { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: inherit; }
.student-name { color: var(--primary); font-size: ${crowded ? '8px' : isLandscape ? '11px' : '10px'}; line-height: 1.03; font-weight: 900; text-align: center; text-transform: uppercase; overflow-wrap: anywhere; }
.student-class { margin-top: ${crowded ? '.45mm' : '.8mm'}; text-align: center; font-size: ${crowded ? '5.6px' : '7px'}; font-weight: 800; color: #475569; }
.info-list { display: grid; gap: ${rowGap}; }
.info-row { display: grid; grid-template-columns: ${isLandscape ? '17mm' : crowded ? '15.5mm' : '18mm'} 1fr; gap: ${crowded ? '.7mm' : '1mm'}; align-items: start; font-size: ${rowFont}; line-height: ${rowLineHeight}; padding: ${rowPadding}; background: transparent; border: 0; }
.info-row span { color: #64748b; font-weight: 800; }
.info-row strong { color: var(--ink); font-weight: 900; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.qr { width: ${qrSize}; height: ${qrSize}; object-fit: contain; background: #fff; border: .3mm solid #e2e8f0; }
.signature { width: ${signatureWidth}; text-align: center; font-size: ${crowded ? '4.4px' : '5px'}; line-height: 1; font-weight: 800; color: var(--ink); }
.signature img { display: block; width: 100%; height: ${signatureImageHeight}; object-fit: contain; }
.modern .accent-shape { position: absolute; left: -18mm; top: -22mm; width: 55mm; height: 55mm; border-radius: 50%; background: rgba(255,255,255,.13); z-index: 1; }
.modern .top-bar { position: relative; z-index: 2; height: ${headerHeight}; display: flex; align-items: center; gap: 2mm; padding: ${crowded ? '2.3mm 2.6mm' : '3mm'}; box-sizing: border-box; color: #fff; background: linear-gradient(135deg, var(--primary), #111827); }
.modern .identity { position: absolute; z-index: 3; top: ${identityTop}; right: 3mm; height: ${crowded ? '4.2mm' : '5mm'}; padding: 0 2mm; border-radius: 6mm; font-size: ${crowded ? '4.7px' : compact ? '5px' : '6px'}; }
.modern .body { position: relative; z-index: 2; padding: ${bodyPadding}; }
.modern .photo-frame { width: ${isLandscape ? '20mm' : portraitPhotoWidth}; height: ${isLandscape ? '23mm' : portraitPhotoHeight}; margin: 0 auto ${crowded ? '1.2mm' : '2mm'}; }
.modern .info-list { margin-top: ${crowded ? '1.4mm' : isLandscape ? '2mm' : '3mm'}; }
.modern .footer { position: absolute; left: 3mm; right: 3mm; bottom: ${footerBottom}; display: flex; align-items: end; justify-content: space-between; gap: 1.5mm; font-size: ${footerFont}; font-weight: 800; }
.classic { padding: 3mm; }
.classic:before { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, var(--soft), #fff 42%, var(--soft)); z-index: 0; }
.classic .corner-mark { position: absolute; right: -13mm; top: -16mm; width: 34mm; height: 34mm; border-radius: 50%; background: var(--primary); opacity: .13; z-index: 0; }
.classic > * { position: relative; z-index: 1; }
.classic .school-block { text-align: center; display: grid; justify-items: center; gap: .8mm; }
.classic .photo-frame { width: ${isLandscape ? '22mm' : crowded ? '18mm' : '24mm'}; height: ${isLandscape ? '24mm' : crowded ? '21mm' : '29mm'}; margin: ${isLandscape ? '2mm' : crowded ? '1.6mm' : '3mm'} auto ${crowded ? '1mm' : '2mm'}; }
.classic .identity { height: ${crowded ? '3.8mm' : '4.5mm'}; margin: ${crowded ? '.9mm' : '1.5mm'} auto ${crowded ? '1.2mm' : '2mm'}; padding: 0 2.5mm; border-radius: 6mm; font-size: ${crowded ? '4.8px' : compact ? '5px' : '6px'}; }
.classic .info-list { margin: 0 auto; width: ${isLandscape ? '52mm' : '43mm'}; padding-bottom: ${settings.showQr || settings.showSignature ? '10mm' : '2mm'}; }
.classic .footer { position: absolute; left: 3mm; right: 3mm; bottom: ${footerBottom}; display: flex; align-items: end; justify-content: space-between; gap: 1.5mm; font-size: ${footerFont}; font-weight: 800; z-index: 2; }
.compact { display: grid; grid-template-columns: 9mm 1fr; background: #fff; }
.compact .side-band { display: flex; align-items: center; justify-content: center; writing-mode: vertical-rl; transform: rotate(180deg); background: var(--primary); color: #fff; font-size: 7px; font-weight: 900; letter-spacing: .8px; }
.compact .main { padding: 2.5mm; min-width: 0; }
.compact .header { display: flex; gap: 2mm; align-items: center; padding-bottom: 1.8mm; border-bottom: .35mm solid var(--soft); }
.compact .content { display: grid; grid-template-columns: ${isLandscape ? '20mm 1fr 18mm' : '22mm 1fr'}; gap: ${crowded ? '1.4mm' : '2mm'}; align-items: start; margin-top: ${crowded ? '1.4mm' : '2mm'}; }
.compact .photo-frame { width: ${isLandscape ? '20mm' : '22mm'}; height: ${isLandscape ? '23mm' : '26mm'}; }
.compact .student-name { text-align: left; font-size: ${isLandscape ? '10px' : '8px'}; }
.compact .student-class { text-align: left; }
.compact .info-list { margin-top: 1.5mm; }
.compact .right-stack { display: flex; flex-direction: column; align-items: center; gap: 2mm; }
`
}

function buildBackHtml(showQr: boolean) {
  return `<div class="card easy-back">
  <div class="title">Important Information</div>
  <div class="rule">This card is the property of {{school.name}}.</div>
  <div class="rule" data-show-if="school.phone">If found, please contact {{school.phone}}.</div>
  <div class="address" data-show-if="school.address">{{school.address}}</div>
  ${showQr ? '<img src="{{qr}}" class="qr" alt="" />' : ''}
</div>`
}

function buildBackCss(palette: (typeof EASY_TEMPLATE_PALETTES)[number]) {
  return `.card.easy-back { width: 100%; height: 100%; box-sizing: border-box; padding: 5mm; display: grid; align-content: center; justify-items: center; gap: 2mm; text-align: center; font-family: Arial, Helvetica, sans-serif; color: ${palette.ink}; background: ${palette.soft}; border: .45mm solid ${palette.primary}; }
.title { color: ${palette.primary}; font-size: 10px; line-height: 1.1; font-weight: 900; text-transform: uppercase; }
.rule { font-size: 7px; line-height: 1.35; font-weight: 800; }
.address { max-width: 42mm; font-size: 6px; line-height: 1.35; color: #475569; font-weight: 700; }
.qr { width: 14mm; height: 14mm; object-fit: contain; background: #fff; border: .3mm solid #dbe2ea; }`
}
