import { db } from '@/lib/db'

/**
 * Whether the chatbot is enabled for a given school. This is the AUTHORITATIVE
 * access gate — the super admin grants it per-school (School.chatbotEnabled) and
 * it defaults to OFF. The widget also hides itself when disabled, but that is a
 * convenience only: every chatbot API route must call this so a crafted request
 * can never reach the LLM for a school that hasn't been granted access.
 */
export async function isChatbotEnabledForSchool(schoolId: string | null | undefined): Promise<boolean> {
  if (!schoolId) return false
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { chatbotEnabled: true, deletedAt: true },
  })
  return Boolean(school && !school.deletedAt && school.chatbotEnabled)
}
