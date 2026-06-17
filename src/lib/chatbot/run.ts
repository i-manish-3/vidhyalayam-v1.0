import type OpenAI from 'openai'
import type { JWTPayload } from '@/lib/auth'
import { getLLM, CHATBOT_MODEL, CHATBOT_MAX_TOKENS, CHATBOT_MAX_TOOL_ITERATIONS } from './client'
import { buildSystemPrompt } from './prompt'
import { getAvailableTools, getToolByName } from './tools'
import type { ChatContext, ChatStreamEvent, ChatTool } from './types'

export interface PriorTurn {
  role: 'user' | 'assistant'
  content: string
}

function toOpenAITools(tools: ChatTool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }))
}

// Run a tool by name. Errors are returned as data (not thrown) so the model can
// recover and tell the user gracefully.
async function runTool(tools: ChatTool[], name: string, input: unknown, ctx: ChatContext): Promise<string> {
  const tool = getToolByName(tools, name)
  if (!tool) return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` })
  try {
    const result = await tool.handler((input ?? {}) as Record<string, unknown>, ctx)
    return JSON.stringify(result)
  } catch (err) {
    console.error(`[chatbot] tool ${name} failed:`, err)
    return JSON.stringify({ ok: false, error: 'The tool failed to run.' })
  }
}

interface AccumulatedToolCall {
  id: string
  name: string
  args: string
}

/**
 * Run one user turn: stream the model's response, executing tools as requested,
 * until it produces a final answer. Yields incremental text + tool events and a
 * final 'done' (or 'error') event with usage totals.
 */
export async function* runChatTurn(opts: {
  user: JWTPayload
  ctx: ChatContext
  history: PriorTurn[]
  userMessage: string
}): AsyncGenerator<ChatStreamEvent> {
  const { user, ctx, history, userMessage } = opts

  const tools = await getAvailableTools(user)
  const openaiTools = toOpenAITools(tools)
  const system = buildSystemPrompt(ctx)

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: userMessage },
  ]

  let inputTokens = 0
  let outputTokens = 0
  let finalText = ''
  const toolNames: string[] = []

  try {
    const client = getLLM()

    for (let iteration = 0; iteration < CHATBOT_MAX_TOOL_ITERATIONS; iteration++) {
      const stream = await client.chat.completions.create({
        model: CHATBOT_MODEL,
        max_tokens: CHATBOT_MAX_TOKENS,
        messages,
        ...(openaiTools.length > 0 ? { tools: openaiTools } : {}),
        stream: true,
        stream_options: { include_usage: true },
      })

      let textThisRound = ''
      let finishReason: string | null = null
      const toolAcc = new Map<number, AccumulatedToolCall>()

      for await (const chunk of stream) {
        // Usage arrives on the final chunk (include_usage).
        if (chunk.usage) {
          inputTokens += chunk.usage.prompt_tokens ?? 0
          outputTokens += chunk.usage.completion_tokens ?? 0
        }
        const choice = chunk.choices[0]
        if (!choice) continue

        if (choice.delta?.content) {
          textThisRound += choice.delta.content
          finalText += choice.delta.content
          yield { type: 'text', text: choice.delta.content }
        }

        // Tool calls stream in fragments keyed by index — accumulate them.
        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index ?? 0
            const cur = toolAcc.get(idx) ?? { id: '', name: '', args: '' }
            if (tc.id) cur.id = tc.id
            if (tc.function?.name) cur.name = tc.function.name
            if (tc.function?.arguments) cur.args += tc.function.arguments
            toolAcc.set(idx, cur)
          }
        }

        if (choice.finish_reason) finishReason = choice.finish_reason
      }

      const calls = Array.from(toolAcc.values()).filter((c) => c.name)
      if (finishReason !== 'tool_calls' || calls.length === 0) {
        break
      }

      // Append the assistant turn (text + tool_calls) then run each tool.
      messages.push({
        role: 'assistant',
        content: textThisRound || null,
        tool_calls: calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.args || '{}' },
        })),
      })

      for (const c of calls) {
        toolNames.push(c.name)
        yield { type: 'tool', name: c.name }
        let input: unknown = {}
        try {
          input = c.args ? JSON.parse(c.args) : {}
        } catch {
          input = {}
        }
        const resultJson = await runTool(tools, c.name, input, ctx)
        messages.push({ role: 'tool', tool_call_id: c.id, content: resultJson })
      }
      // Loop again so the model can read the tool results and answer.
    }

    yield { type: 'done', finalText: finalText.trim(), toolNames, inputTokens, outputTokens }
  } catch (err) {
    console.error('[chatbot] run failed:', err)
    yield { type: 'error', message: 'The assistant ran into a problem. Please try again.' }
  }
}
