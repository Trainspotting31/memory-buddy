import { Hono } from 'hono'
import { AgentDO, Env } from './agent-do'
import { createMemoryMcpServer } from './mcp'
import { createMcpHandler } from 'agents/mcp'

type Bindings = Env & {
  AGENT_DO: DurableObjectNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// Export Durable Object class (for chat)
export { AgentDO }

// ─── MCP endpoint (stateless - new server per request) ───
app.all('/mcp', async (c) => {
  const server = createMemoryMcpServer(c.env)
  const handler = createMcpHandler(server)
  return handler(c.req.raw, c.env as any, c.executionCtx as any)
})

// ─── Original API endpoints ───

app.get('/', async (c) => {
  return c.file('/public/index.html')
})

app.get('/health', async (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() })
})

app.post('/chat', async (c) => {
  const { userId, message } = await c.req.json<{ userId: string; message: string }>()
  if (!userId || !message) {
    return c.json({ error: 'Missing userId or message' }, 400)
  }
  const id = c.env.AGENT_DO.idFromName(userId)
  const stub = c.env.AGENT_DO.get(id)
  const response = await stub.fetch(`${c.req.url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, message })
  })
  return new Response(response.body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  })
})

app.get('/memory/:userId', async (c) => {
  const userId = c.req.param('userId')
  const id = c.env.AGENT_DO.idFromName(userId)
  const stub = c.env.AGENT_DO.get(id)
  const response = await stub.fetch(`${c.req.url}`, { method: 'GET' })
  return new Response(response.body, { headers: { 'Content-Type': 'application/json' } })
})

app.delete('/memory/:userId', async (c) => {
  const userId = c.req.param('userId')
  const id = c.env.AGENT_DO.idFromName(userId)
  const stub = c.env.AGENT_DO.get(id)
  const clearUrl = c.req.url.replace(`/memory/${userId}`, '/memory/clear')
  const response = await stub.fetch(clearUrl, { method: 'GET' })
  return new Response(response.body, { headers: { 'Content-Type': 'application/json' } })
})

export default app
