import { db } from '@/lib/db'
import { renderTemplate, type TemplateVars } from './templates'
import { notifyParentOfStudent } from './parent-ward'
import { notifyRole, notifyClassSection, sendBulk, type NotificationTarget } from './service'
import type { NotificationChannel } from './channels'
import type { CreateNotificationInput } from './service'

/**
 * Central trigger registry. Modules call `triggerEvent({...})` at their commit
 * points; this maps a domain event to a template + audience and fans it out.
 * Every call is fire-and-forget safe (never throws into the caller).
 */

type Audience = 'parent_of_student' | 'role' | 'class_section' | 'tenant'

interface EventConfig {
  module: string
  templateKey: string
  audience: Audience
  type: string
  priority: NonNullable<CreateNotificationInput['priority']>
  fallback: { title: string; body: string }
  /** Default channels; metadata.channels overrides per call. */
  channels?: NotificationChannel[]
}

const EVENTS: Record<string, EventConfig> = {
  FEE_SUBMITTED: {
    module: 'fees',
    templateKey: 'FEE_SUBMITTED',
    audience: 'parent_of_student',
    type: 'fee',
    priority: 'normal',
    fallback: { title: 'Fee Payment Received', body: 'A fee payment of Rs. {{amount}} has been received for {{studentName}}. Receipt No: {{receiptNo}}.' },
  },
  FEE_DUE_REMINDER: {
    module: 'fees',
    templateKey: 'FEE_DUE_REMINDER',
    audience: 'parent_of_student',
    type: 'fee',
    priority: 'high',
    fallback: { title: 'Fee Payment Due', body: 'An amount of Rs. {{amount}} is due for {{studentName}}.' },
  },
  ATTENDANCE_MARKED: {
    module: 'attendance',
    templateKey: 'ATTENDANCE_MARKED',
    audience: 'parent_of_student',
    type: 'attendance',
    priority: 'normal',
    fallback: { title: 'Attendance Update', body: '{{studentName}} has been marked {{status}} on {{date}}.' },
  },
  ATTENDANCE_ABSENT: {
    module: 'attendance',
    templateKey: 'ATTENDANCE_ABSENT',
    audience: 'parent_of_student',
    type: 'attendance',
    priority: 'high',
    fallback: { title: 'Absence Alert', body: '{{studentName}} was marked absent on {{date}}.' },
  },
  RESULT_PUBLISHED: {
    module: 'exam',
    templateKey: 'RESULT_PUBLISHED',
    audience: 'parent_of_student',
    type: 'exam',
    priority: 'normal',
    fallback: { title: 'Result Published', body: 'Result for {{examName}} has been published for {{studentName}}.' },
  },
  EXAM_SCHEDULE_PUBLISHED: {
    module: 'exam',
    templateKey: 'EXAM_SCHEDULE_PUBLISHED',
    audience: 'class_section',
    type: 'exam',
    priority: 'normal',
    fallback: { title: 'Exam Timetable Published', body: 'The timetable for {{examName}} has been published.' },
  },
}

export interface TriggerEventArgs {
  schoolId: string
  eventType: string
  /** Required for parent_of_student audience. */
  studentId?: string
  /** For class_section audience. */
  classId?: string
  sectionId?: string
  /** For role audience. */
  role?: string
  /** Explicit target override (advanced). */
  target?: NotificationTarget
  /** Variables for template interpolation + stored as metadata. */
  metadata?: TemplateVars
  channels?: NotificationChannel[]
  createdBy?: string | null
  actionUrl?: string | null
  mandatory?: boolean
}

export interface TriggerEventResult {
  ok: boolean
  sent: number
}

export async function triggerEvent(args: TriggerEventArgs): Promise<TriggerEventResult> {
  try {
    const config = EVENTS[args.eventType]
    if (!config) {
      console.warn(`[notif] unknown event type: ${args.eventType}`)
      return { ok: false, sent: 0 }
    }

    // For parent_of_student events, resolve the student's name up-front and feed
    // it into the template vars so `{{studentName}}` renders in the title/body
    // (the template is rendered here, before notifyParentOfStudent runs). The
    // caller can still override it by passing studentName in metadata.
    const vars: TemplateVars = { ...(args.metadata ?? {}) }
    if (config.audience === 'parent_of_student' && args.studentId && !vars.studentName) {
      const student = await db.student.findFirst({
        where: { id: args.studentId, schoolId: args.schoolId, deletedAt: null },
        select: { firstName: true, lastName: true },
      })
      if (student) vars.studentName = `${student.firstName} ${student.lastName}`.trim()
    }

    const channel = (args.channels?.[0] ?? 'IN_APP') as string
    const rendered = await renderTemplate({
      schoolId: args.schoolId,
      key: config.templateKey,
      channel: 'IN_APP', // template text is channel-agnostic for foundation
      vars,
      fallback: config.fallback,
    })
    void channel

    const common = {
      title: rendered.title,
      message: rendered.body,
      type: config.type,
      priority: config.priority,
      module: config.module,
      actionUrl: args.actionUrl ?? null,
      channels: args.channels ?? config.channels ?? (['IN_APP'] as NotificationChannel[]),
      metadata: vars as Record<string, unknown>,
      mandatory: args.mandatory,
      createdBy: args.createdBy ?? null,
    }

    const audience = args.target ? 'custom' : config.audience

    if (audience === 'custom' && args.target) {
      const res = await sendBulk({ schoolId: args.schoolId, target: args.target, ...common })
      return { ok: true, sent: res.createdCount }
    }

    if (audience === 'parent_of_student') {
      if (!args.studentId) {
        console.warn(`[notif] ${args.eventType} requires studentId`)
        return { ok: false, sent: 0 }
      }
      const res = await notifyParentOfStudent({
        schoolId: args.schoolId,
        studentId: args.studentId,
        entityId: args.studentId,
        ...common,
      })
      return { ok: true, sent: res.sent }
    }

    if (audience === 'class_section') {
      const res = await notifyClassSection(
        args.schoolId,
        { classId: args.classId, sectionId: args.sectionId },
        common,
      )
      return { ok: true, sent: res.createdCount }
    }

    if (audience === 'role') {
      const res = await notifyRole(args.schoolId, args.role ?? 'PARENT', common)
      return { ok: true, sent: res.createdCount }
    }

    if (audience === 'tenant') {
      const res = await sendBulk({ schoolId: args.schoolId, target: { all: true }, ...common })
      return { ok: true, sent: res.createdCount }
    }

    return { ok: false, sent: 0 }
  } catch (err) {
    console.error('[notif] triggerEvent failed:', err instanceof Error ? err.message : err)
    return { ok: false, sent: 0 }
  }
}
