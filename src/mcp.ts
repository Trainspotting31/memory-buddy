import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Env } from './agent-do'
import { LLM } from './llm'
import { retrieveMemory } from './memory/retrieve'
import { extractFacts, deduplicateFacts } from './memory/extract'
import type { D1Database, VectorizeIndex } from '@cloudflare/workers-types'

const DEFAULT_USER_ID = 'hermes-shared'

// ─── Memory operations (shared with chat DO) ───────────────────

export async function fetchMemory(db: D1Database, userId: string) {
  const [facts, summaries] = await Promise.all([
    db.prepare('SELECT content, category, created_at FROM facts WHERE user_id = ?').bind(userId).all(),
    db.prepare('SELECT content, turn_range, created_at FROM summaries WHERE user_id = ?').bind(userId).all()
  ])
  return { facts: (facts.results || []) as any[], summaries: (summaries.results || []) as any[] }
}

export async function queryMemory(
  llm: LLM, db: D1Database, vectorize: VectorizeIndex, userId: string, query: string
) {
  return retrieveMemory(llm, db, vectorize, userId, query)
}

export async function storeFact(
  llm: LLM, db: D1Database, vectorize: VectorizeIndex,
  userId: string, content: string, category: string = 'general'
): Promise<void> {
  const existing = await db.prepare('SELECT content FROM facts WHERE user_id = ?').bind(userId).all()
  const existingFacts = (existing.results || []).map((r: any) => r.content as string)

  const newFacts = await extractFacts(llm, [
    { role: 'user', content: `Remember: ${content}` },
    { role: 'assistant', content: 'Got it.' }
  ])
  const uniqueFacts = await deduplicateFacts(existingFacts, newFacts)

  if (uniqueFacts.length === 0) {
    await saveFactDirect(db, vectorize, llm, userId, content, category)
  } else {
    for (const fact of uniqueFacts) {
      await saveFactDirect(db, vectorize, llm, userId, fact.content, fact.category)
    }
  }
}

async function saveFactDirect(
  db: D1Database, vectorize: VectorizeIndex, llm: LLM,
  userId: string, content: string, category: string
): Promise<void> {
  await Promise.all([
    db.prepare('INSERT INTO facts (user_id, content, category) VALUES (?, ?, ?)')
      .bind(userId, content, category).run(),
    (async () => {
      try {
        const embedding = await llm.generateEmbedding(content)
        await vectorize.upsert([{
          id: `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          values: embedding,
          metadata: { user_id: userId, content, category }
        }])
      } catch (e) {
        console.error('Vectorize upsert failed:', e)
      }
    })()
  ])
}

export async function clearMemory(db: D1Database, userId: string): Promise<void> {
  await Promise.all([
    db.prepare('DELETE FROM facts WHERE user_id = ?').bind(userId).run(),
    db.prepare('DELETE FROM summaries WHERE user_id = ?').bind(userId).run()
  ])
}

// ─── MCP Server factory (stateless, per-request) ────────────────

export function createMemoryMcpServer(env: Env): McpServer {
  const server = new McpServer({
    name: 'memory-buddy',
    version: '1.0.0'
  })

  const llm = new LLM(
    {
      apiKey: env.LLM_API_KEY,
      apiBase: env.LLM_API_BASE,
      model: env.LLM_MODEL || '@cf/meta/llama-3.2-3b-instruct'
    },
    env.AI
  )

  // Tool 1: recall_memory
  server.tool(
    'recall_memory',
    'Retrieve all stored long-term memory for a user/agent. Call this at the start of a conversation to load context. Returns facts and summaries.',
    {
      userId: z.string().default(DEFAULT_USER_ID).describe('User/agent ID. Use "hermes-shared" for shared memory across all agents.')
    },
    async ({ userId }: { userId: string }) => {
      const { facts, summaries } = await fetchMemory(env.MEMORY_DB, userId)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            userId,
            facts: facts.map((f: any) => ({ content: f.content, category: f.category, created_at: f.created_at })),
            summaries: summaries.map((s: any) => ({ content: s.content, turn_range: s.turn_range })),
            factCount: facts.length,
            summaryCount: summaries.length
          }, null, 2)
        }]
      }
    }
  )

  // Tool 2: search_memory
  server.tool(
    'search_memory',
    'Semantic search across stored memories. Returns most relevant memories ranked by similarity.',
    {
      query: z.string().describe('Natural language query to search.'),
      userId: z.string().default(DEFAULT_USER_ID).describe('User/agent ID.')
    },
    async ({ query, userId }: { query: string; userId: string }) => {
      try {
        const result = await queryMemory(llm, env.MEMORY_DB, env.MEMORY_VECTORIZE, userId, query)
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              query, userId,
              facts: result.facts.map((f: any) => ({ content: f.content, category: f.category })),
              semanticMatches: result.semanticMatches.map((m: any) => ({ content: m.content, score: Number(m.score.toFixed(3)) })),
              totalFound: result.facts.length + result.semanticMatches.length
            }, null, 2)
          }]
        }
      } catch (e: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Search failed: ' + e.message }) }],
          isError: true
        }
      }
    }
  )

  // Tool 3: store_memory
  server.tool(
    'store_memory',
    'Store a fact into long-term memory. Remembered across sessions and shared with other agents. Use when user shares preferences, decisions, or important context.',
    {
      content: z.string().describe('The info to remember. Be specific: "User prefers dark mode" not just "dark mode".'),
      category: z.enum(['personal_info', 'preference', 'event', 'knowledge', 'general']).default('general'),
      userId: z.string().default(DEFAULT_USER_ID).describe('User/agent ID. Use "hermes-shared" for shared.')
    },
    async ({ content, category, userId }: { content: string; category: string; userId: string }) => {
      try {
        await storeFact(llm, env.MEMORY_DB, env.MEMORY_VECTORIZE, userId, content, category)
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: `Memory stored for "${userId}"`, content, category })
          }]
        }
      } catch (e: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Store failed: ' + e.message }) }],
          isError: true
        }
      }
    }
  )

  // Tool 4: forget_memory
  server.tool(
    'forget_memory',
    'Permanently delete all memory for a user/agent. Cannot be undone.',
    {
      userId: z.string().default(DEFAULT_USER_ID).describe('User/agent ID.'),
      confirm: z.boolean().describe('Must be true to confirm deletion.')
    },
    async ({ userId, confirm }: { userId: string; confirm: boolean }) => {
      if (!confirm) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Set confirm=true to proceed.' }) }],
          isError: true
        }
      }
      await clearMemory(env.MEMORY_DB, userId)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, message: `All memory cleared for "${userId}"` })
        }]
      }
    }
  )

  // Tool 5: list_memory_users
  server.tool(
    'list_memory_users',
    'List all user/agent IDs that have stored memories.',
    {},
    async () => {
      const result = await env.MEMORY_DB.prepare('SELECT DISTINCT user_id FROM facts ORDER BY user_id').all()
      const users = (result.results || []).map((r: any) => r.user_id)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ users, count: users.length }, null, 2)
        }]
      }
    }
  )

  return server
}
