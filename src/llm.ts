import type { Ai } from '@cloudflare/workers-types'

export interface LLMConfig {
  apiKey?: string
  apiBase?: string
  model: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class LLM {
  private ai: Ai | null = null
  private config: LLMConfig

  constructor(config: LLMConfig, aiBinding?: Ai) {
    this.config = config
    if (aiBinding) {
      this.ai = aiBinding
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.ai) {
      throw new Error('AI binding not available for embedding')
    }
    const result = await this.ai.run('@cf/baai/bge-base-en-v1.5', { text })
    return result as unknown as number[]
  }

  async chatCompletion(messages: ChatMessage[], stream: boolean = false): Promise<string | ReadableStream<string>> {
    if (this.config.apiBase && this.config.apiKey) {
      return this.callExternalLLM(messages, stream)
    }

    if (!this.ai) {
      throw new Error('AI binding not available')
    }

    if (stream) {
      const response = await this.ai.run(this.config.model, {
        messages,
        stream: true
      })
      // Workers AI returns SSE chunks like: data: {"choices":[{"delta":{"content":"text"}}]}
      return new ReadableStream({
        async start(controller) {
          const textStream = (response as ReadableStream).pipeThrough(new TextDecoderStream())
          const reader = textStream.getReader()
          let buffer = ''
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += value
              // Process lines
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim()
                  if (data && data !== '[DONE]') {
                    try {
                      const json = JSON.parse(data)
                      const content = json.choices?.[0]?.delta?.content || json.response || ''
                      if (content) controller.enqueue(content)
                    } catch { /* skip malformed JSON */ }
                  }
                }
              }
            }
          } finally {
            controller.close()
          }
        }
      })
    }

    const result = await this.ai.run(this.config.model, { messages })
    // Workers AI returns { response: "text" } object
    if (result && typeof result === 'object' && 'response' in result) {
      return (result as any).response as string
    }
    return typeof result === 'string' ? result : JSON.stringify(result)
  }

  private async callExternalLLM(messages: ChatMessage[], stream: boolean): Promise<string | ReadableStream<string>> {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    })

    const body = JSON.stringify({
      model: this.config.model,
      messages,
      stream
    })

    const response = await fetch(`${this.config.apiBase}/chat/completions`, {
      method: 'POST',
      headers,
      body
    })

    if (!response.ok) {
      throw new Error(`External LLM error: ${response.status} ${response.statusText}`)
    }

    if (stream) {
      return response.body!.pipeThrough(new TextDecoderStream()).pipeThrough(new TransformStream({
        transform(chunk, controller) {
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data !== '[DONE]') {
                try {
                  const json = JSON.parse(data)
                  const content = json.choices?.[0]?.delta?.content
                  if (content) {
                    controller.enqueue(content)
                  }
                } catch {
                  controller.enqueue(chunk)
                }
              }
            }
          }
        }
      }))
    }

    const json = await response.json()
    return json.choices?.[0]?.message?.content || ''
  }
}
