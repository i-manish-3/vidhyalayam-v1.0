// Starter ID-card templates in the South Asian / Indian school card style:
// outer colored frame, decorative wave corners, navy/colored band with school
// name, ribbon title, circular photo with colored ring, tabular info with
// colon separators, principal signature. Each preset is a colour variation
// on the same proven layout — vertical 54×86mm, single-sided.
//
// Tokens recognised by the renderer:
//   {{school.name}}              {{student.name}}
//   {{school.address}}           {{student.admissionNumber}}
//   {{school.phone}}             {{student.rollNumber}}
//   {{school.email}}             {{student.class}}
//   {{school.website}}           {{student.section}}
//                                {{student.classSection}}
//                                {{student.dateOfBirth}}
//                                {{student.bloodGroup}}
//                                {{student.gender}}
//                                {{student.address}}
//                                {{student.parentName}}
//                                {{student.fatherName}}
//                                {{student.motherName}}
//                                {{student.parentPhone}}
//                                {{student.academicYear}}
//   {{photo}}     → student photo src (placeholder if missing)
//   {{logo}}      → school logo src
//   {{qr}}        → QR data URL

export interface IdCardPreset {
  id: string
  name: string
  description: string
  category: 'modern' | 'classic' | 'vibrant' | 'corporate' | 'compact'
  orientation: 'portrait' | 'landscape'
  widthMm: number
  heightMm: number
  hasBackSide: boolean
  frontHtml: string
  frontCss: string
  backHtml: string | null
  backCss: string | null
}

// Shared HTML structure — every preset uses the same body, varies via CSS
// custom properties so the visual identity (colors) is the only thing that
// changes.
const SHARED_HTML = `
<div class="card">
  <div class="frame">
    <div class="inner">
      <svg class="wave-tr" viewBox="0 0 60 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M60,0 C 30,15 60,30 35,45 C 60,60 25,75 60,100 L60,0 Z" class="w1"/>
        <path d="M60,12 C 35,25 55,38 40,50 C 58,62 32,78 60,95 L60,12 Z" class="w2"/>
        <path d="M60,28 C 45,35 55,45 45,55 C 55,65 40,80 60,92 L60,28 Z" class="w3"/>
      </svg>
      <svg class="wave-bl" viewBox="0 0 60 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,100 C 30,85 0,70 25,55 C 0,40 35,25 0,0 L0,100 Z" class="w1"/>
        <path d="M0,88 C 25,75 5,62 20,50 C 2,38 28,22 0,5 L0,88 Z" class="w2"/>
        <path d="M0,72 C 15,65 5,55 15,45 C 5,35 20,20 0,8 L0,72 Z" class="w3"/>
      </svg>
      <div class="header">
        <img src="{{logo}}" class="logo" alt="" />
        <div class="brand">{{school.name}}</div>
      </div>
      <div class="tagline">A home of quality &amp; education</div>
      <div class="title-band">
        <div class="title-inner">STUDENT ID CARD</div>
      </div>
      <div class="photo-ring">
        <img src="{{photo}}" class="photo" alt="" />
      </div>
      <table class="info">
        <tr><td class="k">Name</td><td class="sep">:</td><td class="v">{{student.name}}</td></tr>
        <tr><td class="k">Father</td><td class="sep">:</td><td class="v">{{student.fatherName}}</td></tr>
        <tr><td class="k">ID No.</td><td class="sep">:</td><td class="v">{{student.admissionNumber}}</td></tr>
        <tr><td class="k">Date of Birth</td><td class="sep">:</td><td class="v">{{student.dateOfBirth}}</td></tr>
        <tr><td class="k">Blood Group</td><td class="sep">:</td><td class="v">{{student.bloodGroup}}</td></tr>
        <tr><td class="k">Phone</td><td class="sep">:</td><td class="v">{{student.parentPhone}}</td></tr>
      </table>
      <div class="address"><b>Address :</b> {{student.address}}</div>
      <div class="bottom">
        <img src="{{qr}}" class="qr" alt="" />
        <div class="sig">
          <div class="sig-mark">{{student.academicYear}}</div>
          <div class="sig-line"></div>
          <div class="sig-text">Principal</div>
        </div>
      </div>
    </div>
  </div>
</div>`

// Shared CSS — uses CSS variables so each preset only needs to override:
//   --frame    outer border color
//   --band     header band color
//   --accent   wave / ring / title color
//   --accent-2 secondary wave shade (lighter)
//   --accent-3 third wave shade (even lighter)
//   --ink      info value color (default near-black)
const SHARED_CSS = `
.card { width: 100%; height: 100%; box-sizing: border-box; padding: 2mm; background: var(--frame); font-family: 'Inter', Arial, sans-serif; color: var(--ink, #1f1f1f); }
.frame { width: 100%; height: 100%; box-sizing: border-box; background: #ffffff; position: relative; overflow: hidden; }
.inner { position: relative; padding: 2mm 2.5mm 1.5mm 2.5mm; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; }
.wave-tr { position: absolute; top: 0; right: 0; width: 16mm; height: 32mm; pointer-events: none; z-index: 0; }
.wave-bl { position: absolute; bottom: 0; left: 0; width: 16mm; height: 32mm; pointer-events: none; z-index: 0; }
.wave-tr .w1, .wave-bl .w1 { fill: var(--accent); }
.wave-tr .w2, .wave-bl .w2 { fill: var(--accent-2); }
.wave-tr .w3, .wave-bl .w3 { fill: var(--accent-3); }
.header { background: var(--band); color: #ffffff; padding: 1.2mm 2mm; display: flex; align-items: center; gap: 1.5mm; border-radius: 1mm; position: relative; z-index: 2; }
.logo { width: 8mm; height: 8mm; background: #ffffff; padding: 0.4mm; box-sizing: border-box; border-radius: 50%; object-fit: contain; }
.brand { font-family: 'Georgia', 'Times New Roman', serif; font-size: 9px; font-weight: 800; letter-spacing: -0.2px; flex: 1; min-width: 0; line-height: 1.05; }
.tagline { text-align: center; font-size: 5px; font-style: italic; color: #6b7280; margin: 0.6mm 0 0.8mm 0; font-family: 'Georgia', serif; position: relative; z-index: 2; }
.title-band { position: relative; align-self: center; z-index: 2; }
.title-inner { background: var(--accent); color: #ffffff; font-size: 6.5px; font-weight: 800; letter-spacing: 2.5px; padding: 0.8mm 4mm; clip-path: polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%); -webkit-clip-path: polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%); }
.photo-ring { align-self: center; width: 24mm; height: 24mm; border-radius: 50%; padding: 0.5mm; background: var(--accent); box-sizing: border-box; margin: 1.6mm 0 1.2mm 0; position: relative; z-index: 2; box-shadow: 0 0.3mm 0.8mm rgba(0,0,0,0.1); }
.photo { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: #f3f4f6; display: block; border: 0.2mm solid #ffffff; box-sizing: border-box; }
.info { width: 100%; font-size: 6.4px; border-collapse: collapse; line-height: 1.5; margin: 0 auto; position: relative; z-index: 2; }
.info td { vertical-align: top; padding: 0.05mm 0; }
.info .k { color: #1f1f1f; font-weight: 700; width: 15mm; }
.info .sep { width: 1mm; padding-right: 1mm; font-weight: 700; }
.info .v { font-weight: 600; }
.address { font-size: 6.2px; line-height: 1.4; margin-top: 0.6mm; position: relative; z-index: 2; }
.address b { font-weight: 700; }
.bottom { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; padding-top: 1.5mm; position: relative; z-index: 2; }
.qr { width: 13mm; height: 13mm; background: #ffffff; padding: 0.3mm; box-sizing: border-box; }
.sig { width: 22mm; text-align: center; }
.sig-mark { font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; font-size: 9px; font-style: italic; color: var(--band); font-weight: 700; line-height: 1; }
.sig-line { height: 0.2mm; background: #1f1f1f; margin: 0.2mm 0 0.3mm 0; }
.sig-text { font-size: 5.5px; font-weight: 700; color: #1f1f1f; font-family: 'Georgia', serif; }`

function makePreset(
  id: string,
  name: string,
  description: string,
  vars: { frame: string; band: string; accent: string; accent2: string; accent3: string },
  overrideCss = '',
): IdCardPreset {
  const varCss = `
.card {
  --frame: ${vars.frame};
  --band: ${vars.band};
  --accent: ${vars.accent};
  --accent-2: ${vars.accent2};
  --accent-3: ${vars.accent3};
  --ink: #1f1f1f;
}`
  return {
    id,
    name,
    description,
    category: 'classic',
    orientation: 'portrait',
    widthMm: 54,
    heightMm: 86,
    hasBackSide: false,
    frontHtml: SHARED_HTML,
    frontCss: `${varCss}\n${SHARED_CSS}\n${overrideCss}`,
    backHtml: null,
    backCss: null,
  }
}

// ============================================================================
// 1. RADIANT MAROON — Matches the Bangladeshi/Indian reference exactly
//    Maroon frame, navy school band, orange wave decorations
// ============================================================================
const RADIANT_MAROON = makePreset(
  'radiant-maroon',
  'Radiant Maroon',
  'Maroon outer frame, navy school band, vibrant orange wave decorations. Classic South Asian school card.',
  {
    frame: '#7B1E1E',
    band: '#1e3a8a',
    accent: '#F26522',
    accent2: '#FF8C42',
    accent3: '#FFB570',
  },
)

// ============================================================================
// 2. ROYAL EMERALD — Forest green frame, deep teal band, amber waves
// ============================================================================
const ROYAL_EMERALD = makePreset(
  'royal-emerald',
  'Royal Emerald',
  'Forest green outer frame, deep teal school band, warm amber wave decorations.',
  {
    frame: '#0f5132',
    band: '#0d3b66',
    accent: '#D4A017',
    accent2: '#E5B53D',
    accent3: '#F5D782',
  },
)

// ============================================================================
// 3. CRIMSON DEEP — Crimson frame, charcoal band, cream waves
// ============================================================================
const CRIMSON_DEEP = makePreset(
  'crimson-deep',
  'Crimson Deep',
  'Crimson outer frame, charcoal school band, warm cream and gold wave decorations.',
  {
    frame: '#9b1c1c',
    band: '#1c1917',
    accent: '#D4A574',
    accent2: '#E8C39E',
    accent3: '#F5E0C7',
  },
)

// ============================================================================
// 4. NAVAL BLUE — Navy frame, gold band, sky waves
// ============================================================================
const NAVAL_BLUE = makePreset(
  'naval-blue',
  'Naval Blue',
  'Deep navy outer frame, gold school band, bright sky-blue wave decorations.',
  {
    frame: '#0c2461',
    band: '#b8860b',
    accent: '#0EA5E9',
    accent2: '#38BDF8',
    accent3: '#7DD3FC',
  },
)

// ============================================================================
// 5. SAFFRON BLOOM — Saffron frame, maroon band, deep orange waves
// ============================================================================
const SAFFRON_BLOOM = makePreset(
  'saffron-bloom',
  'Saffron Bloom',
  'Warm saffron outer frame, deep maroon school band, festive orange wave decorations.',
  {
    frame: '#F27121',
    band: '#7B1E1E',
    accent: '#1e3a8a',
    accent2: '#3B5BC1',
    accent3: '#7C9CE8',
  },
)

export const ID_CARD_PRESETS: IdCardPreset[] = [
  RADIANT_MAROON,
  ROYAL_EMERALD,
  CRIMSON_DEEP,
  NAVAL_BLUE,
  SAFFRON_BLOOM,
]

export function getPresetById(id: string): IdCardPreset | null {
  return ID_CARD_PRESETS.find((p) => p.id === id) || null
}
