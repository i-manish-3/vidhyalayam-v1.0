import { z } from 'zod'

// ============================================================
// ID CARD LAYOUT TYPES
// ============================================================
// The template designer saves a list of `CardElement`s as JSON per side.
// Each element is absolutely positioned in millimetres so the same layout
// renders identically on screen, on print, and in the saved PDF.

export const DYNAMIC_FIELDS = [
  'student.name',
  'student.admissionNumber',
  'student.rollNumber',
  'student.class',
  'student.section',
  'student.classSection',
  'student.dateOfBirth',
  'student.bloodGroup',
  'student.gender',
  'student.address',
  'student.parentName',
  'student.fatherName',
  'student.motherName',
  'student.parentPhone',
  'student.academicYear',
  'student.registrationNumber',
  'student.udiseId',
  'school.name',
  'school.address',
  'school.phone',
  'school.email',
  'school.website',
  'school.registrationNumber',
  'school.udiseNumber',
  'school.affiliationNumber',
  'school.establishedYear',
  'school.principalSignature',
] as const

export type DynamicFieldKey = (typeof DYNAMIC_FIELDS)[number]

export const ELEMENT_TYPES = [
  'dynamicField',
  'staticText',
  'studentPhoto',
  'schoolLogo',
  'qrCode',
  'barcode',
  'signature',
  'shape',
  'image',
] as const

export type ElementType = (typeof ELEMENT_TYPES)[number]

const baseElement = z.object({
  id: z.string().min(1),
  type: z.enum(ELEMENT_TYPES),
  // Position + dimensions in millimetres relative to the card's top-left.
  x: z.number().min(-200).max(400),
  y: z.number().min(-200).max(400),
  width: z.number().min(1).max(400),
  height: z.number().min(1).max(400),
  rotation: z.number().min(-360).max(360).default(0).optional(),
  // Common styling
  color: z.string().max(40).optional(),
  backgroundColor: z.string().max(40).optional(),
  borderColor: z.string().max(40).optional(),
  borderWidth: z.number().min(0).max(20).optional(),
  borderRadius: z.number().min(0).max(100).optional(),
  fontSize: z.number().min(4).max(96).optional(),
  fontWeight: z.string().max(20).optional(), // 'normal' | 'bold' | '500' etc.
  fontFamily: z.string().max(80).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  // Type-specific payload
  field: z.string().max(80).optional(),       // dynamicField
  text: z.string().max(500).optional(),       // staticText
  prefix: z.string().max(80).optional(),
  suffix: z.string().max(80).optional(),
  imageSrc: z.string().max(50000).optional(), // image element (base64 or URL)
  shape: z.enum(['rect', 'circle']).optional(),
  opacity: z.number().min(0).max(1).optional(),
  zIndex: z.number().int().min(0).max(1000).optional(),
})

export const cardElementSchema = baseElement
export type CardElement = z.infer<typeof cardElementSchema>

export const layoutSchema = z.array(cardElementSchema).max(50)
export type CardLayout = z.infer<typeof layoutSchema>

export const templateInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  templateMode: z.enum(['html', 'element']).default('html'),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  widthMm: z.number().min(40).max(200).default(86),
  heightMm: z.number().min(40).max(200).default(54),
  backgroundColor: z.string().max(40).default('#ffffff'),
  frontBackground: z.string().max(2_000_000).optional().nullable(),
  backBackground: z.string().max(2_000_000).optional().nullable(),
  frontLayout: layoutSchema.default([]),
  backLayout: layoutSchema.optional().nullable(),
  frontHtml: z.string().max(200_000).optional().nullable(),
  backHtml: z.string().max(200_000).optional().nullable(),
  frontCss: z.string().max(200_000).optional().nullable(),
  backCss: z.string().max(200_000).optional().nullable(),
  hasBackSide: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

export type TemplateInput = z.infer<typeof templateInputSchema>

// Friendly labels for the field palette in the designer
export const DYNAMIC_FIELD_LABELS: Record<DynamicFieldKey, string> = {
  'student.name': 'Student Name',
  'student.admissionNumber': 'Admission No.',
  'student.rollNumber': 'Roll No.',
  'student.class': 'Class',
  'student.section': 'Section',
  'student.classSection': 'Class & Section',
  'student.dateOfBirth': 'Date of Birth',
  'student.bloodGroup': 'Blood Group',
  'student.gender': 'Gender',
  'student.address': 'Address',
  'student.parentName': 'Parent / Guardian',
  'student.fatherName': "Father's Name",
  'student.motherName': "Mother's Name",
  'student.parentPhone': 'Parent Phone',
  'student.academicYear': 'Academic Year',
  'student.registrationNumber': 'Student Registration No.',
  'student.udiseId': 'Student UDISE ID',
  'school.name': 'School Name',
  'school.address': 'School Address',
  'school.phone': 'School Phone',
  'school.email': 'School Email',
  'school.website': 'School Website',
  'school.registrationNumber': 'School Registration No.',
  'school.udiseNumber': 'School UDISE',
  'school.affiliationNumber': 'Affiliation No.',
  'school.establishedYear': 'ESTD',
  'school.principalSignature': 'Principal Signature',
}
