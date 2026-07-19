import type { D1Database, VectorizeIndex } from '@cloudflare/workers-types'
import { LLM } from '../llm'

export interface RetrievedMemory {
  facts: Array<{ content: string; category: string }>
  semanticMatches: Array<{ content: string; score: number }>
}

export async function retrieveMemory(
  llm: LLM,
  db: D1Database,
  vectorize: VectorizeIndex,
  userId: string,
  query: string
): Promise<RetrievedMemory> {
  const [facts, embedding] = await Promise.all([
    fetchFacts(db, userId),
    llm.generateEmbedding(query)
  ])

  const semanticMatches = await fetchSemanticMatches(vectorize, userId, embedding)

  return {
    facts,
    semanticMatches
  }
}

async function fetchFacts(db: D1Database, userId: string): Promise<Array<{ content: string; category: string }>> {
  const result = await db.prepare('SELECT content, category FROM facts WHERE user_id = ?')
    .bind(userId)
    .all()
  
  return (result.results || []).map(row => ({
    content: row.content,
    category: row.category
  }))
}

async function fetchSemanticMatches(
  vectorize: VectorizeIndex,
  userId: string,
  embedding: number[]
): Promise<Array<{ content: string; score: number }>> {
  const results = await vectorize.query(embedding, {
    topK: 5,
    filter: { user_id: userId }
  })

  return results.matches.map(match => ({
    content: match.metadata?.content || '',
    score: match.score
  })).filter(m => m.content)
}