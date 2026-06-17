import OpenAI from 'openai'

/**
 * LLM client for the AI chatbot. Uses the OpenAI-compatible API so it works with
 * OpenRouter (default), OpenAI, or any compatible gateway. The key lives ONLY on
 * the server — all chat traffic goes through /api/school/chatbot.
 */

const globalForLLM = globalThis as unknown as { __llm?: OpenAI }

export function isChatbotConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY)
}

export function getLLM(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY (or LLM_API_KEY) is not configured.')
  }
  if (!globalForLLM.__llm) {
    globalForLLM.__llm = new OpenAI({
      apiKey,
      baseURL: process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1',
      // Optional OpenRouter attribution headers (used for their dashboards).
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'https://vidhyalayam.com',
        'X-Title': 'Vidhyalayam School Assistant',
      },
    })
  }
  return globalForLLM.__llm
}

// Default model is a fast/cheap tier. On OpenRouter use slugs like
// `anthropic/claude-haiku-4.5` or `anthropic/claude-sonnet-4.5`.
export const CHATBOT_MODEL = process.env.CHATBOT_MODEL || 'anthropic/claude-haiku-4.5'

// Hard ceiling on tokens generated per assistant turn.
export const CHATBOT_MAX_TOKENS = parseInt(process.env.CHATBOT_MAX_TOKENS || '1024')

// Safety cap on the tool-use loop so a misbehaving turn can't spin forever.
export const CHATBOT_MAX_TOOL_ITERATIONS = parseInt(process.env.CHATBOT_MAX_TOOL_ITERATIONS || '5')
