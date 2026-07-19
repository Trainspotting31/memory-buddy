import type { D1Database, VectorizeIndex } from '@cloudflare/workers-types'
import { AI } from '@cloudflare/ai'
import { LLM, ChatMessage } from './llm'
import { extractFacts, deduplicateFacts, ExtractedFact } from './memory/extract'
import { retrieveMemory, RetrievedMemory } from './memory/retrieve'
import { shouldSummarize, summarizeConversation, saveSummary, clearOldMessages } from './memory/summarize'

export interface AgentDOState {
  messages: ChatMessage[]
}

export interface Env {
  MEMORY_DB: D1Database
  MEMORY_VECTORIZE: VectorizeIndex
  AI: AI
  LLM_API_KEY?: string
  LLM_API_BASE?: string
  LLM_MODEL?: string
}

export class AgentDO implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private llm: LLM

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.llm = new LLM(
      {
        apiKey: env.LLM_API_KEY,
        apiBase: env.LLM_API_BASE,
        model: env.LLM_MODEL || '@cf/meta/llama-3.1-8b-instruct'
      },
      env.AI
    )

    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<AgentDOState>('state')
      if (!stored) {
        await this.state.storage.put('state', { messages: [] })
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    switch (path) {
      case '/chat':
        return this.handleChat(request)
      case '/memory':
        return this.handleGetMemory(request)
      case '/memory/clear':
        return this.handleClearMemory(request)
      default:
        return new Response('Not found', { status: 404 })
    }
  }

  private async handleChat(request: Request): Promise<Response> {
    const { userId, message } = await request.json<{ userId: string; message: string }>()
    
    if (!userId || !message) {
      return new Response('Missing userId or message', { status: 400 })
    }

    const state = await this.state.storage.get<AgentDOState>('state') || { messages: [] }
    const userMessage: ChatMessage = { role: 'user', content: message }
    state.messages.push(userMessage)

    const memory = await retrieveMemory(this.llm, this.env.MEMORY_DB, this.env.MEMORY_VECTORIZE, userId, message)
    const context = this.buildMemoryContext(memory)

    const systemPrompt = `You are an AI assistant with long-term memory. Use the following memory context to inform your responses:

${context}

If there's no relevant memory, just respond naturally. Always maintain the conversation flow.`

    const recentMessages = state.messages.slice(-10)
    const messagesWithSystem: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...recentMessages
    ]

    const stream = await this.llm.chatCompletion(messagesWithSystem, true)

    let fullResponse = ''
    const responseStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream as ReadableStream<string>) {
          fullResponse += chunk
          controller.enqueue(chunk)
        }
        controller.close()

        this.state.storage.put('state', {
          messages: [...state.messages, { role: 'assistant', content: fullResponse }]
        })

        await this.persistMemory(userId, [...state.messages, { role: 'assistant', content: fullResponse }])
      }.bind(this)
    })

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  }

  private async handleGetMemory(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')

    if (!userId) {
      return new Response('Missing userId', { status: 400 })
    }

    const [state, facts, summaries] = await Promise.all([
      this.state.storage.get<AgentDOState>('state'),
      this.env.MEMORY_DB.prepare('SELECT content, category, created_at FROM facts WHERE user_id = ?')
        .bind(userId)
        .all(),
      this.env.MEMORY_DB.prepare('SELECT content, turn_range, created_at FROM summaries WHERE user_id = ?')
        .bind(userId)
        .all()
    ])

    return new Response(JSON.stringify({
      short_term_memory: state?.messages.slice(-10) || [],
      facts: facts.results || [],
      summaries: summaries.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private async handleClearMemory(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')

    if (!userId) {
      return new Response('Missing userId', { status: 400 })
    }

    await Promise.all([
      this.state.storage.put('state', { messages: [] }),
      this.env.MEMORY_DB.prepare('DELETE FROM facts WHERE user_id = ?').bind(userId).run(),
      this.env.MEMORY_DB.prepare('DELETE FROM summaries WHERE user_id = ?').bind(userId).run()
    ])

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private buildMemoryContext(memory: RetrievedMemory): string {
    const parts: string[] = []

    if (memory.facts.length > 0) {
      parts.push('=== Known Facts ===')
      parts.push(memory.facts.map(f => `- ${f.content} (${f.category})`).join('\n'))
    }

    if (memory.semanticMatches.length > 0) {
      parts.push('\n=== Related Memories ===')
      parts.push(memory.semanticMatches.map(m => `- ${m.content} (score: ${m.score.toFixed(2)})`).join('\n'))
    }

    return parts.length > 0 ? parts.join('\n') : 'No memory available.'
  }

  private async persistMemory(userId: string, messages: ChatMessage[]): Promise<void> {
    const [existingFactsResult, shouldDoSummary] = await Promise.all([
      this.env.MEMORY_DB.prepare('SELECT content FROM facts WHERE user_id = ?').bind(userId).all(),
      shouldSummarize(messages.length)
    ])

    const existingFacts = (existingFactsResult.results || []).map((r: { content: string }) => r.content)
    const newFacts = await extractFacts(this.llm, messages)
    const uniqueFacts = await deduplicateFacts(existingFacts, newFacts)

    for (const fact of uniqueFacts) {
      await this.saveFact(userId, fact)
    }

    if (shouldDoSummary) {
      const summary = await summarizeConversation(this.llm, messages)
      await saveSummary(this.env.MEMORY_DB, userId, summary)
      const cleared = await clearOldMessages(messages)
      await this.state.storage.put('state', { messages: cleared })
    }
  }

  private async saveFact(userId: string, fact: ExtractedFact): Promise<void> {
    await Promise.all([
      this.env.MEMORY_DB.prepare('INSERT INTO facts (user_id, content, category) VALUES (?, ?, ?)')
        .bind(userId, fact.content, fact.category)
        .run(),
      (async () => {
        const embedding = await this.llm.generateEmbedding(fact.content)
        await this.env.MEMORY_VECTORIZE.upsert([
          {
            id: `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            values: embedding,
            metadata: { user_id: userId, content: fact.content, category: fact.category }
          }
        ])
      })()
    ])
  }
}