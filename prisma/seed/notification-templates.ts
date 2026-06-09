import { db } from '../../src/lib/db'

/**
 * Seeds system (schoolId = null) notification templates used by the trigger
 * engine. Templates support {{variable}} interpolation. A school can override
 * any of these by creating a row with the same `key` + `channel` scoped to its
 * own schoolId. Idempotent: re-running upserts on (schoolId, key, channel).
 */

interface TemplateSeed {
  key: string
  module: string
  channel: string
  title: string
  body: string
}

const SYSTEM_TEMPLATES: ReadonlyArray<TemplateSeed> = [
  // --- Fees ---
  {
    key: 'FEE_SUBMITTED',
    module: 'fees',
    channel: 'IN_APP',
    title: 'Fee Payment Received',
    body: 'Dear {{parentName}}, fee payment of Rs. {{amount}} has been received for {{studentName}}. Receipt No: {{receiptNo}}.',
  },
  {
    key: 'FEE_DUE_REMINDER',
    module: 'fees',
    channel: 'IN_APP',
    title: 'Fee Payment Due',
    body: 'Dear {{parentName}}, an amount of Rs. {{amount}} is due for {{studentName}}. Please pay by {{dueDate}}.',
  },
  {
    key: 'FEE_OVERDUE',
    module: 'fees',
    channel: 'IN_APP',
    title: 'Fee Overdue',
    body: 'Dear {{parentName}}, the fee of Rs. {{amount}} for {{studentName}} is overdue. Kindly clear it at the earliest.',
  },
  // --- Attendance ---
  {
    key: 'ATTENDANCE_MARKED',
    module: 'attendance',
    channel: 'IN_APP',
    title: 'Attendance Update',
    body: '{{studentName}} has been marked {{status}} on {{date}}.',
  },
  {
    key: 'ATTENDANCE_ABSENT',
    module: 'attendance',
    channel: 'IN_APP',
    title: 'Absence Alert',
    body: 'Dear {{parentName}}, {{studentName}} was marked absent on {{date}}.',
  },
  // --- Exam / Result ---
  {
    key: 'RESULT_PUBLISHED',
    module: 'exam',
    channel: 'IN_APP',
    title: 'Result Published',
    body: 'Result for {{examName}} has been published for {{studentName}}.',
  },
  {
    key: 'EXAM_SCHEDULE_PUBLISHED',
    module: 'exam',
    channel: 'IN_APP',
    title: 'Exam Timetable Published',
    body: 'The timetable for {{examName}} has been published.',
  },
  {
    key: 'ADMIT_CARD_AVAILABLE',
    module: 'exam',
    channel: 'IN_APP',
    title: 'Admit Card Available',
    body: 'Admit card for {{examName}} is now available for {{studentName}}.',
  },
  // --- Announcement ---
  {
    key: 'ANNOUNCEMENT_PUBLISHED',
    module: 'announcement',
    channel: 'IN_APP',
    title: '{{announcementTitle}}',
    body: '{{announcementMessage}}',
  },
  // --- System ---
  {
    key: 'PASSWORD_RESET',
    module: 'system',
    channel: 'IN_APP',
    title: 'Password Changed',
    body: 'Your account password was changed on {{date}}. If this was not you, contact your administrator.',
  },
]

async function main() {
  let created = 0
  for (const t of SYSTEM_TEMPLATES) {
    // System templates have schoolId = null. Postgres treats NULLs as distinct
    // in a unique index, so we can't rely on upsert-by-null — find then write.
    const existing = await db.notificationTemplate.findFirst({
      where: { schoolId: null, key: t.key, channel: t.channel },
      select: { id: true },
    })
    if (existing) {
      await db.notificationTemplate.update({
        where: { id: existing.id },
        data: { title: t.title, body: t.body, module: t.module, isActive: true },
      })
    } else {
      await db.notificationTemplate.create({ data: { schoolId: null, ...t, isActive: true } })
      created++
    }
  }
  console.log(`✅ Seeded ${created} new system notification templates (existing ones updated).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
