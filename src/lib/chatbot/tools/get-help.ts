import type { ChatTool, ToolResult } from '../types'

/**
 * get_help — answers "how do I…" / navigation questions from a small, curated
 * knowledge base. No database access. This is intentionally a hand-written KB
 * (the corpus is tiny); it can later be upgraded to retrieval over the docs/
 * folder with embeddings if it grows.
 */
interface HelpArticle {
  topic: string
  keywords: string[]
  answer: string
}

const HELP_ARTICLES: HelpArticle[] = [
  {
    topic: 'Collect a fee / partial payment',
    keywords: ['collect fee', 'pay fee', 'partial', 'fee payment', 'receipt', 'collection'],
    answer:
      "Go to Fees → Collect Fee, search the student, tick the fee particulars, enter the amount (a partial amount is allowed) and choose the payment method, then Save to generate a receipt.",
  },
  {
    topic: 'Sell store/inventory item & store dues',
    keywords: ['inventory', 'store', 'sell', 'uniform', 'book sale', 'store due', 'collect due'],
    answer:
      "Inventory → Sell to Student: pick the student and items, then choose Collect now, Partial, or On due. Unpaid amounts become a store due collected from Inventory → Sales (use the Collect Due button). If enabled in Settings → Store/Inventory, store dues also appear on the Collect Fee page.",
  },
  {
    topic: 'Mark / finalize attendance',
    keywords: ['attendance', 'mark present', 'absent', 'finalize attendance'],
    answer:
      "Attendance → Mark Attendance: select class/section and date, mark each student, then Save. Class teachers/admins can finalize the day; finalized attendance can be reopened by an admin if a correction is needed.",
  },
  {
    topic: 'Add a hostel / room',
    keywords: ['hostel', 'room', 'warden', 'bed', 'add hostel'],
    answer:
      "Hostel → Hostels → Add Hostel: enter the hostel name, type and warden, pick the fee months, then add rooms (room no, beds, fare). To edit later, open the hostel and use Add New Rooms or update fares.",
  },
  {
    topic: 'View fee dues / reports',
    keywords: ['dues', 'pending fee', 'outstanding', 'fee report', 'demand slip'],
    answer:
      "Fees → Collect Fee shows a student's outstanding particulars; Fees → Reports has collection and dues reports. Monthly demand slips are generated from Fees → Demand Slips.",
  },
]

export const getHelpTool: ChatTool = {
  name: 'get_help',
  description:
    "Answer 'how do I…' or 'where do I…' questions about USING the school app (navigation and steps). Use this for any usage/how-to question. Returns relevant help articles.",
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The user’s how-to question or keywords.' },
    },
    required: ['query'],
  },
  isAvailable: () => true,
  handler: async (input): Promise<ToolResult> => {
    const query = (typeof input.query === 'string' ? input.query : '').toLowerCase()
    if (!query.trim()) {
      return { ok: true, data: { articles: HELP_ARTICLES.map((a) => ({ topic: a.topic })) } }
    }
    const scored = HELP_ARTICLES.map((a) => {
      const hay = `${a.topic} ${a.keywords.join(' ')}`.toLowerCase()
      const score = a.keywords.reduce((n, kw) => (query.includes(kw) ? n + 2 : 0) + n, 0) +
        (query.split(/\s+/).some((w) => w.length > 2 && hay.includes(w)) ? 1 : 0)
      return { a, score }
    })
      .filter((s) => s.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 3)
      .map((s) => ({ topic: s.a.topic, answer: s.a.answer }))

    return {
      ok: true,
      data: scored.length > 0
        ? { articles: scored }
        : { articles: [], note: 'No exact match. Suggest the user check the relevant module in the left sidebar.' },
    }
  },
}
