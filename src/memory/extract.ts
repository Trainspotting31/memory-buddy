import { ChatMessage, LLM } from '../llm'

export interface ExtractedFact {
  content: string
  category: string
}

export async function extractFacts(llm: LLM, messages: ChatMessage[]): Promise<ExtractedFact[]> {
  const systemPrompt = `You are a memory extraction assistant. Extract key facts from the conversation that should be remembered long-term.
  
  Output ONLY a JSON array with objects containing "content" (the fact) and "category" (one of: personal_info, preference, event, knowledge, general).
  
  Example: [{"content": "User likes coffee", "category": "preference"}, {"content": "User's birthday is June 15", "category": "personal_info"}]
  
  Only extract facts that are new and worth remembering. Skip trivial or temporary information.`

  const userMessages = messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n\n')
  const userPrompt = `Extract key facts from this conversation:\n\n${userMessages}`

  const response = await llm.chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ])

  try {
    const jsonStr = response.toString().replace(/```json/g, '').replace(/```/g, '').trim()
    return JSON.parse(jsonStr)
  } catch {
    return []
  }
}

export async function deduplicateFacts(existingFacts: string[], newFacts: ExtractedFact[]): Promise<ExtractedFact[]> {
  const existingSet = new Set(existingFacts.map(f => f.toLowerCase().trim()))
  return newFacts.filter(fact => {
    const normalized = fact.content.toLowerCase().trim()
    return !existingSet.has(normalized) && normalized.length > 5
  })
}