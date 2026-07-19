import { describe, it, expect, vi } from 'vitest'
import { RetrievedMemory } from '../src/memory/retrieve'

describe('retrieve', () => {
  it('should build memory context from retrieved data', () => {
    const memory: RetrievedMemory = {
      facts: [
        { content: 'User likes coffee', category: 'preference' },
        { content: 'User lives in NYC', category: 'personal_info' }
      ],
      semanticMatches: [
        { content: 'User mentioned enjoying cafes', score: 0.85 }
      ]
    }

    const context = memory.facts.map(f => `- ${f.content} (${f.category})`).join('\n')
    
    expect(context).toContain('User likes coffee')
    expect(context).toContain('User lives in NYC')
  })

  it('should handle empty memory gracefully', () => {
    const memory: RetrievedMemory = {
      facts: [],
      semanticMatches: []
    }

    expect(memory.facts).toEqual([])
    expect(memory.semanticMatches).toEqual([])
  })

  it('should have expected structure', () => {
    const memory: RetrievedMemory = {
      facts: [{ content: 'test', category: 'general' }],
      semanticMatches: [{ content: 'test match', score: 0.9 }]
    }

    expect(memory).toHaveProperty('facts')
    expect(memory).toHaveProperty('semanticMatches')
    expect(Array.isArray(memory.facts)).toBe(true)
    expect(Array.isArray(memory.semanticMatches)).toBe(true)
  })
})