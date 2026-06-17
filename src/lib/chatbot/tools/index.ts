import type { JWTPayload } from '@/lib/auth'
import type { ChatTool } from '../types'
import { getFeeDuesTool } from './get-fee-dues'
import { getHelpTool } from './get-help'

// The full read-only tool catalogue. Add new tools here.
export const ALL_TOOLS: ChatTool[] = [getHelpTool, getFeeDuesTool]

/**
 * Resolve the subset of tools a specific user is allowed to use. Tools whose
 * `isAvailable` check fails (missing permission / wrong role) are never exposed
 * to the model, so the chatbot can't even attempt data the user can't see.
 */
export async function getAvailableTools(user: JWTPayload): Promise<ChatTool[]> {
  const checks = await Promise.all(
    ALL_TOOLS.map(async (tool) => ({ tool, ok: await tool.isAvailable(user) }))
  )
  return checks.filter((c) => c.ok).map((c) => c.tool)
}

export function getToolByName(tools: ChatTool[], name: string): ChatTool | undefined {
  return tools.find((t) => t.name === name)
}
