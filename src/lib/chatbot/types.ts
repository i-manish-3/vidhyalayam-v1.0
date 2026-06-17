import type { JWTPayload } from '@/lib/auth'

/**
 * Per-request context handed to every tool. It is derived ONLY from the
 * authenticated JWT (never from client input), so a tool physically cannot read
 * another tenant's or another family's data.
 */
export interface ChatContext {
  userId: string
  schoolId: string
  role: string
  email: string
  // For PARENT/STUDENT: the student IDs this user may see. For school-wide roles
  // (admin/staff/teacher) this is null = "not restricted to specific wards"
  // (tools still enforce schoolId + permissions).
  wardStudentIds: string[] | null
}

export type ToolResult = {
  // A compact, model-friendly payload. Keep it small — it is fed back to Claude.
  ok: boolean
  data?: unknown
  error?: string
}

/**
 * A single read-only capability the chatbot can invoke. Each tool reuses the
 * same permission-checked data access the rest of the app uses.
 */
export interface ChatTool {
  name: string
  description: string
  // JSON Schema object describing the tool input (Anthropic tool format).
  inputSchema: Record<string, unknown>
  // Decides whether this tool is exposed to a given user. Runs the real
  // permission checks so Claude only ever sees tools the user is allowed to use.
  isAvailable: (user: JWTPayload) => boolean | Promise<boolean>
  handler: (input: Record<string, unknown>, ctx: ChatContext) => Promise<ToolResult>
}

// Events streamed from the chat run loop to the SSE writer.
export type ChatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'done'; finalText: string; toolNames: string[]; inputTokens: number; outputTokens: number }
  | { type: 'error'; message: string }
