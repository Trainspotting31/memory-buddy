import type { D1Database } from '@cloudflare/workers-types'
import { ChatMessage, LLM } from '../llm'

const MAX_SHORT_TERM_MEMORY = 20

export interface ConversationSummary {
  content: string
  turnRange: string
}

export async function shouldSummarize(messageCount: number): Promise<boolean> {
  return messageCount >= MAX_SHORT_TERM_MEMORY
}

export async function summarizeConversation(
  llm: LLM,
  messages: ChatMessage[]
): Promise<ConversationSummary> {
  const systemPrompt = `You are a conversation summarization assistant. Create a concise summary of the conversation that captures the key points, decisions, and important information.
  
  Output ONLY the summary text. Do not include any extra formatting or explanations.`

  const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n\n')
  const userPrompt = `Summarize this conversation:\n\n${conversationText}`

  const response = await llm.chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ])

  return {
    content: response.toString().trim(),
    turnRange: `1-${messages.length}`
  }
}

export async function saveSummary(
  db: D1Database,
  userId: string,
  summary: ConversationSummary
): Promise<void> {
  await db.prepare('INSERT INTO summaries (user_id, content, turn_range) VALUES (?, ?, ?)')
    .bind(userId, summary.content, summary.turnRange)
    .run()
}

export async function clearOldMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
  return messages.slice(-MAX_SHORT_TERM_MEMORY)
}