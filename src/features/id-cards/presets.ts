// Starter ID-card templates inspired by common Indian school/college ID cards.
// They are HTML/CSS presets, so admins can still edit every field afterwards.
//
// Useful tokens:
//   {{school.name}}              {{student.name}}
//   {{school.address}}           {{student.registrationNumber}}
//   {{school.phone}}             {{student.udiseId}}
//   {{school.registrationNumber}} {{student.fatherName}}
//   {{school.udiseNumber}}       {{student.motherName}}
//   {{school.affiliationNumber}} {{student.classSection}}
//   {{school.establishedYear}}   {{student.dateOfBirth}}
//   {{photo}}                    {{signature}}
//   {{logo}}
//
// Add data-show-if="field.key" to hide an optional block when that field is blank.

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

const DEFAULT_META = `
  <span data-show-if="school.establishedYear">ESTD-{{school.establishedYear}}</span>
  <span data-show-if="school.udiseNumber">UDISE: {{school.udiseNumber}}</span>
  <span data-show-if="school.registrationNumber">REG NO: {{school.registrationNumber}}</span>
  <span data-show-if="school.affiliationNumber">AFFILIATION: {{school.affiliationNumber}}</span>`

const NAVY_VERTICAL_HTML = `
<div class="card">
  <div class="slot"></div>
  <div class="top">
    <img src="{{logo}}" class="logo" alt="" />
    <div class="school">{{school.name}}</div>
    <div class="medium" data-show-if="school.affiliationNumber">{{school.affiliationNumber}}</div>
    <div class="address" data-show-if="school.address">{{school.address}}</div>
  </div>
  <div class="curve"></div>
  <div class="ribbons"><span>IDENTITY CARD</span><span>IDENTITY CARD</span></div>
  <div class="photo-box"><img src="{{photo}}" class="photo" alt="" /></div>
  <div class="student-name">{{student.name}}</div>
  <table class="info">
    <tr data-show-if="student.fatherName"><td>Father</td><td>:</td><td>{{student.fatherName}}</td></tr>
    <tr data-show-if="student.motherName"><td>Mother</td><td>:</td><td>{{student.motherName}}</td></tr>
    <tr data-show-if="student.classSection"><td>Class</td><td>:</td><td>{{student.classSection}}</td></tr>
    <tr data-show-if="student.dateOfBirth"><td>D.O.B.</td><td>:</td><td>{{student.dateOfBirth}}</td></tr>
    <tr data-show-if="student.parentPhone"><td>Mob.</td><td>:</td><td>{{student.parentPhone}}</td></tr>
    <tr data-show-if="student.address"><td>Address</td><td>:</td><td>{{student.address}}</td></tr>
    <tr data-show-if="student.registrationNumber"><td>Reg. No.</td><td>:</td><td>{{student.registrationNumber}}</td></tr>
    <tr data-show-if="student.udiseId"><td>UDISE</td><td>:</td><td>{{student.udiseId}}</td></tr>
  </table>
  <div class="bottom">
    <div class="phone" data-show-if="school.phone">{{school.phone}}</div>
    <div class="signature">
      <img src="{{signature}}" alt="" />
      <span>Principal</span>
    </div>
  </div>
</div>`

const NAVY_VERTICAL_CSS = `
.card { width: 100%; height: 100%; position: relative; box-sizing: border-box; overflow: hidden; background: #fff; border: 1.4mm solid #22307c; font-family: Arial, Helvetica, sans-serif; color: #222; }
.slot { position: absolute; left: 50%; top: 1.8mm; width: 15mm; height: 1.4mm; transform: translateX(-50%); border-radius: 2mm; background: #68bfd3; z-index: 3; }
.top { position: relative; height: 31mm; padding: 8mm 4mm 0; box-sizing: border-box; text-align: center; color: #fff; background: #21246d; z-index: 1; }
.top:after { content: ""; position: absolute; left: -5mm; right: -5mm; bottom: -8mm; height: 18mm; border-radius: 0 0 50% 50%; background: #21246d; z-index: -1; }
.logo { position: absolute; left: 4mm; top: 5mm; width: 9mm; height: 9mm; border-radius: 50%; background: #fff; object-fit: contain; padding: .5mm; box-sizing: border-box; }
.school { font-family: Impact, Arial Black, Arial, sans-serif; font-size: 12px; line-height: 1.05; text-transform: uppercase; letter-spacing: .2px; text-shadow: 0 .4mm .5mm rgba(0,0,0,.35); }
.medium { margin-top: 1mm; font-size: 5.4px; font-weight: 700; }
.address { margin: .8mm auto 0; max-width: 42mm; font-size: 5.2px; line-height: 1.25; }
.curve { position: absolute; left: 1mm; right: 1mm; top: 28mm; height: 12mm; border-bottom: .7mm solid #1883b7; border-radius: 0 0 50% 50%; z-index: 2; }
.ribbons { position: relative; z-index: 3; display: flex; justify-content: space-between; margin-top: -2.8mm; padding: 0 0.5mm; }
.ribbons span { background: #ed1f2f; color: #fff; font-size: 5px; font-weight: 800; padding: 1mm 1.8mm; }
.photo-box { position: relative; z-index: 4; width: 21mm; height: 24mm; margin: -2mm auto 1.5mm; overflow: hidden; border: .8mm solid #24205d; border-radius: 2mm; background: #f8fafc; }
.photo { width: 100%; height: 100%; object-fit: cover; display: block; }
.student-name { text-align: center; color: #d8263c; font-size: 8.5px; line-height: 1.05; font-weight: 900; text-transform: uppercase; margin: 0 3mm 1.3mm; }
.info { width: 40mm; margin: 0 auto; border-collapse: collapse; font-size: 6.2px; line-height: 1.25; }
.info td { padding: .1mm 0; vertical-align: top; }
.info td:first-child { width: 13mm; }
.info td:nth-child(2) { width: 2mm; text-align: center; }
.info td:last-child { font-weight: 600; }
.bottom { position: absolute; left: 0; right: 0; bottom: 0; min-height: 14mm; padding: 3.5mm 5mm 1.5mm; box-sizing: border-box; background: #ed1f2f; color: #fff; text-align: center; }
.bottom:before, .bottom:after { content: ""; position: absolute; bottom: 0; width: 19mm; height: 19mm; background: #203078; border-radius: 50%; }
.bottom:before { left: -8mm; }
.bottom:after { right: -8mm; }
.phone { position: relative; z-index: 2; display: inline-block; border-radius: 8mm; background: #f8b429; color: #172554; padding: .9mm 3mm; font-size: 7px; font-weight: 900; }
.signature { position: relative; z-index: 2; margin: .7mm auto 0; width: 19mm; color: #fff; font-size: 5px; font-weight: 800; }
.signature img { display: block; width: 100%; height: 5mm; object-fit: contain; filter: brightness(0) invert(1); }`

const RED_COLLEGE_HTML = `
<div class="card">
  <div class="header">
    <img src="{{logo}}" class="logo" alt="" />
    <div class="school">{{school.name}}</div>
  </div>
  <div class="yellow-wave"></div>
  <div class="white-wave"></div>
  <div class="photo-box"><img src="{{photo}}" class="photo" alt="" /></div>
  <div class="student-name">{{student.name}}</div>
  <div class="course">{{student.classSection}}</div>
  <div class="year">{{student.academicYear}}</div>
  <div class="details">
    <div class="row" data-show-if="student.bloodGroup"><span class="ico">B</span><span>{{student.bloodGroup}}</span></div>
    <div class="row" data-show-if="student.dateOfBirth"><span class="ico">D</span><span>{{student.dateOfBirth}}</span></div>
    <div class="row" data-show-if="student.fatherName"><span class="ico">H</span><span>D/O {{student.fatherName}}</span></div>
    <div class="row" data-show-if="student.address"><span class="ico">A</span><span>{{student.address}}</span></div>
    <div class="row" data-show-if="student.parentPhone"><span class="ico">P</span><span>{{student.parentPhone}}</span></div>
    <div class="row" data-show-if="student.registrationNumber"><span class="ico">R</span><span>{{student.registrationNumber}}</span></div>
  </div>
  <div class="signature"><img src="{{signature}}" alt="" /><span>Principal</span></div>
  <div class="footer">
    <div class="meta">${DEFAULT_META}</div>
    <div data-show-if="school.address">{{school.address}}</div>
    <div data-show-if="school.phone">Ph: {{school.phone}}</div>
  </div>
</div>`

const RED_COLLEGE_CSS = `
.card { width: 100%; height: 100%; position: relative; overflow: hidden; box-sizing: border-box; background: #fff; font-family: Arial, Helvetica, sans-serif; color: #2b2b2b; border: .4mm solid #e5e7eb; }
.header { position: relative; z-index: 2; height: 24mm; background: #f3272f; color: #ffe44d; display: flex; align-items: flex-start; gap: 3mm; padding: 5mm 4mm 0; box-sizing: border-box; }
.logo { width: 14mm; height: 14mm; border-radius: 50%; background: #fff; object-fit: contain; padding: .7mm; box-sizing: border-box; }
.school { flex: 1; min-width: 0; font-size: 11px; line-height: 1.05; font-weight: 900; text-transform: uppercase; }
.yellow-wave { position: absolute; left: -5mm; right: -8mm; top: 33mm; height: 6mm; transform: rotate(-5deg); background: #ffd329; z-index: 1; }
.white-wave { position: absolute; left: -9mm; right: -5mm; top: 28mm; height: 19mm; transform: rotate(-8deg); background: #fff; border-radius: 50% 0 0 0; z-index: 2; }
.photo-box { position: relative; z-index: 3; width: 24mm; height: 31mm; margin: 10mm auto 1.5mm; overflow: hidden; border: .7mm solid #28265d; border-radius: 3mm; background: #fff; }
.photo { width: 100%; height: 100%; object-fit: cover; display: block; }
.student-name { position: relative; z-index: 3; text-align: center; font-size: 10px; line-height: 1; font-weight: 900; text-transform: uppercase; }
.course { position: relative; z-index: 3; text-align: center; color: #d82072; font-size: 8px; font-weight: 900; margin-top: 1mm; }
.year { position: relative; z-index: 3; text-align: center; font-size: 7px; font-weight: 800; margin-top: 1mm; }
.details { position: relative; z-index: 3; margin: 3mm 5mm 0; display: grid; gap: 1.3mm; font-size: 6.3px; line-height: 1.2; }
.row { display: grid; grid-template-columns: 7mm 1fr; align-items: start; }
.ico { width: 4.5mm; height: 4.5mm; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #2f3486; color: #fff; font-size: 5px; font-weight: 900; }
.signature { position: absolute; right: 6mm; bottom: 20mm; width: 19mm; text-align: center; color: #303030; font-size: 6px; font-weight: 700; z-index: 4; }
.signature img { display: block; width: 100%; height: 8mm; object-fit: contain; }
.footer { position: absolute; left: 0; right: 0; bottom: 0; min-height: 13mm; background: #f3272f; border-top: 1.2mm solid #ffe11d; color: #fff; text-align: right; padding: 2mm 4mm 1.5mm; box-sizing: border-box; font-size: 4.9px; line-height: 1.25; font-weight: 700; }
.meta { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 1mm; }`

const RED_PUBLIC_HTML = `
<div class="card">
  <div class="red-corner"></div>
  <div class="top">
    <div class="meta">${DEFAULT_META}</div>
    <div class="school">{{school.name}}</div>
    <div class="address" data-show-if="school.address">{{school.address}}</div>
    <div class="phone" data-show-if="school.phone">Phone: {{school.phone}}</div>
  </div>
  <img src="{{logo}}" class="logo" alt="" />
  <div class="photo-ring"><img src="{{photo}}" class="photo" alt="" /></div>
  <div class="student-name">{{student.name}}</div>
  <div class="role">{{student.classSection}}</div>
  <table class="info">
    <tr data-show-if="student.fatherName"><td>F./Name</td><td>:</td><td>{{student.fatherName}}</td></tr>
    <tr data-show-if="student.dateOfBirth"><td>D.O.B.</td><td>:</td><td>{{student.dateOfBirth}}</td></tr>
    <tr data-show-if="student.parentPhone"><td>Mobile</td><td>:</td><td>{{student.parentPhone}}</td></tr>
    <tr data-show-if="student.address"><td>Address</td><td>:</td><td>{{student.address}}</td></tr>
    <tr data-show-if="student.registrationNumber"><td>Reg. No.</td><td>:</td><td>{{student.registrationNumber}}</td></tr>
    <tr data-show-if="student.udiseId"><td>UDISE</td><td>:</td><td>{{student.udiseId}}</td></tr>
  </table>
  <div class="signature"><img src="{{signature}}" alt="" /><span>Principal</span></div>
  <div class="bottom-shapes"></div>
</div>`

const RED_PUBLIC_CSS = `
.card { width: 100%; height: 100%; position: relative; overflow: hidden; box-sizing: border-box; background: #fff; border-radius: 3mm; font-family: Arial, Helvetica, sans-serif; color: #050505; }
.red-corner { position: absolute; inset: 0 0 auto 0; height: 43mm; background: #f21d10; z-index: 0; }
.red-corner:before { content: ""; position: absolute; left: -7mm; bottom: -15mm; width: 28mm; height: 42mm; transform: rotate(-34deg); background: #fff; border-right: 1.2mm solid #ffb400; box-shadow: 2.2mm 0 0 #fff, 3.6mm 0 0 #f6a500; }
.red-corner:after { content: ""; position: absolute; right: -8mm; bottom: -16mm; width: 24mm; height: 34mm; transform: rotate(-35deg); background: #fff; border-left: 1.2mm solid #ffb400; box-shadow: -2.2mm 0 0 #fff, -3.6mm 0 0 #f6a500; }
.top { position: relative; z-index: 2; color: #fff; text-align: center; padding: 4mm 2mm 0; text-shadow: .5mm .5mm .5mm rgba(0,0,0,.55); }
.meta { display: flex; justify-content: center; flex-wrap: wrap; gap: 1.2mm; min-height: 4mm; font-size: 5.4px; font-weight: 900; letter-spacing: .2px; }
.school { margin-top: 1.5mm; font-family: Impact, Arial Black, Arial, sans-serif; font-size: 13.5px; line-height: 1.05; letter-spacing: .5px; text-transform: uppercase; }
.address, .phone { margin: .8mm auto 0; max-width: 82mm; font-size: 6.2px; line-height: 1.15; font-weight: 900; }
.logo { position: absolute; left: 7mm; top: 36mm; z-index: 4; width: 17mm; height: 17mm; object-fit: contain; background: #fff; padding: 1mm; box-sizing: border-box; }
.photo-ring { position: relative; z-index: 3; width: 33mm; height: 33mm; margin: 31mm auto 3mm; border-radius: 50%; padding: 1.4mm; background: #ffc400; box-sizing: border-box; }
.photo { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
.student-name { text-align: center; color: #f21d10; font-size: 13px; line-height: 1; font-weight: 900; text-transform: uppercase; }
.role { margin-top: 2mm; text-align: center; font-size: 10px; line-height: 1; font-weight: 900; text-transform: uppercase; }
.info { width: 78mm; margin: 4mm auto 0; border-collapse: collapse; font-size: 7.2px; line-height: 1.55; }
.info td { padding: .2mm 0; vertical-align: top; }
.info td:first-child { width: 20mm; color: #0a3b7a; font-weight: 900; }
.info td:nth-child(2) { width: 3mm; text-align: center; font-weight: 900; }
.info td:last-child { font-weight: 900; }
.signature { position: absolute; left: 50%; bottom: 10mm; transform: translateX(-50%); width: 25mm; text-align: center; font-size: 10px; font-weight: 900; z-index: 4; }
.signature img { display: block; width: 100%; height: 9mm; object-fit: contain; }
.bottom-shapes { position: absolute; left: 0; right: 0; bottom: 0; height: 11mm; background: #06366d; z-index: 1; }
.bottom-shapes:before { content: ""; position: absolute; left: 0; top: -6mm; width: 23mm; height: 14mm; background: #06366d; clip-path: polygon(0 100%, 0 0, 50% 60%, 100% 100%); }
.bottom-shapes:after { content: ""; position: absolute; right: 0; top: -6mm; width: 23mm; height: 14mm; background: #06366d; clip-path: polygon(0 100%, 50% 60%, 100% 0, 100% 100%); box-shadow: -5mm 1mm 0 #f6a500; }`

const PRESETS: IdCardPreset[] = [
  {
    id: 'navy-school-classic',
    name: 'Navy School Classic',
    description: 'Navy header, red identity ribbons, centered student photo, emergency phone, and principal signature.',
    category: 'classic',
    orientation: 'portrait',
    widthMm: 54,
    heightMm: 86,
    hasBackSide: false,
    frontHtml: NAVY_VERTICAL_HTML,
    frontCss: NAVY_VERTICAL_CSS,
    backHtml: null,
    backCss: null,
  },
  {
    id: 'red-college-wave',
    name: 'Red College Wave',
    description: 'Red and yellow college-style card with icon rows, footer approvals, and signature area.',
    category: 'vibrant',
    orientation: 'portrait',
    widthMm: 54,
    heightMm: 86,
    hasBackSide: false,
    frontHtml: RED_COLLEGE_HTML,
    frontCss: RED_COLLEGE_CSS,
    backHtml: null,
    backCss: null,
  },
  {
    id: 'red-public-school',
    name: 'Red Public School',
    description: 'Bold red public school style with top ESTD/UDISE/REG line, logo, round photo, and large principal signature.',
    category: 'vibrant',
    orientation: 'portrait',
    widthMm: 86,
    heightMm: 135,
    hasBackSide: false,
    frontHtml: RED_PUBLIC_HTML,
    frontCss: RED_PUBLIC_CSS,
    backHtml: null,
    backCss: null,
  },
]

export const ID_CARD_PRESETS: IdCardPreset[] = PRESETS

export function getPresetById(id: string): IdCardPreset | null {
  return ID_CARD_PRESETS.find((p) => p.id === id) || null
}
