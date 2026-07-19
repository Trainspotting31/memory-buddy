import { AI } from '@cloudflare/ai'

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
  private ai: AI | null = null
  private config: LLMConfig

  constructor(config: LLMConfig, aiBinding?: AI) {
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
    return result as number[]
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
      return new ReadableStream({
        async start(controller) {
          for await (const chunk of response as AsyncIterable<string>) {
            controller.enqueue(chunk)
          }
          controller.close()
        }
      })
    }

    const result = await this.ai.run(this.config.model, { messages })
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