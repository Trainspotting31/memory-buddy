import { describe, it, expect } from 'vitest'
import { deduplicateFacts, ExtractedFact } from '../src/memory/extract'

describe('extract', () => {
  describe('deduplicateFacts', () => {
    it('should remove duplicate facts', () => {
      const existingFacts = ['User likes coffee', 'User lives in NYC']
      const newFacts: ExtractedFact[] = [
        { content: 'User likes coffee', category: 'preference' },
        { content: 'User enjoys hiking', category: 'preference' }
      ]

      return deduplicateFacts(existingFacts, newFacts).then(result => {
        expect(result).toHaveLength(1)
        expect(result[0].content).toBe('User enjoys hiking')
      })
    })

    it('should be case-insensitive', () => {
      const existingFacts = ['User likes Coffee']
      const newFacts: ExtractedFact[] = [
        { content: 'user likes coffee', category: 'preference' }
      ]

      return deduplicateFacts(existingFacts, newFacts).then(result => {
        expect(result).toHaveLength(0)
      })
    })

    it('should filter out very short facts', () => {
      const existingFacts: string[] = []
      const newFacts: ExtractedFact[] = [
        { content: 'Hi', category: 'general' },
        { content: 'User likes coffee', category: 'preference' }
      ]

      return deduplicateFacts(existingFacts, newFacts).then(result => {
        expect(result).toHaveLength(1)
        expect(result[0].content).toBe('User likes coffee')
      })
    })

    it('should preserve unique facts', () => {
      const existingFacts = ['User likes coffee']
      const newFacts: ExtractedFact[] = [
        { content: 'User likes tea', category: 'preference' },
        { content: 'User works at Google', category: 'personal_info' }
      ]

      return deduplicateFacts(existingFacts, newFacts).then(result => {
        expect(result).toHaveLength(2)
      })
    })
  })
})