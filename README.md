# MemoryBuddy 🧠

[中文版](README.zh-CN.md)

> **Give your AI agents a shared memory that lasts.** Deploy once, connect any MCP-compatible AI tool — Hermes, Trae, Cursor, Claude Desktop — they all share the same memory.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-blue)](https://modelcontextprotocol.io/)
[![Free Tier](https://img.shields.io/badge/Cost-$0-success)](#-why-cloudflare-free-tier)

## 🌟 What is this?

Most AI tools suffer from "goldfish memory" — refresh the page, start a new session, switch to another app, and everything's gone. You keep reintroducing yourself, re-explaining your preferences, re-stating context.

**MemoryBuddy** fixes this with a **shared memory layer** that any AI tool can read from and write to:

- 🧠 **Long-term memory** — facts, preferences, decisions persist across sessions
- 🔍 **Semantic search** — find relevant memories by meaning, not just keywords
- 🤖 **Auto fact extraction** — LLM automatically distills what's worth remembering
- 📝 **Smart summarization** — long conversations get compressed, key points retained
- 🗑️ **One-click forget** — `DELETE` wipes everything, GDPR compliant
- 🔌 **MCP protocol** — any MCP-compatible client can connect, zero integration code
- 💸 **$0/month** — runs entirely on Cloudflare's free tier

## 💡 What problem does it solve?

| 😣 Without MemoryBuddy | ✅ With MemoryBuddy |
|------------------------|---------------------|
| Every AI tool starts fresh — you re-explain yourself constantly | All your AI tools share one memory — tell one, they all know |
| Switching from Hermes to Trae means losing all context | Switch freely — memory lives in the cloud, not in the tool |
| AI forgets your preferences between sessions | Preferences persist forever, across all sessions and all tools |
| Long conversations hit context limits | Auto-summarization keeps things compact |
| Privacy concerns — can't delete what it remembers | One API call wipes everything, fully GDPR compliant |

## 🏗️ Architecture

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│ Hermes  │   │  Trae   │   │ Cursor  │   │ Claude  │
└────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘
     │ MCP         │ MCP         │ MCP         │ MCP
     ▼             ▼             ▼             ▼
┌──────────────────────────────────────────────────┐
│           MemoryBuddy Worker (Cloudflare)         │
│                                                  │
│   /mcp  → MCP Server (5 tools, Streamable HTTP)  │
│   /chat → HTTP API (SSE streaming + auto-extract)│
│   /memory/:userId → REST API                     │
└──────────┬──────────────────┬────────────────────┘
           │                  │
     ┌─────▼─────┐    ┌──────▼──────┐
     │ D1 (facts)│    │ Vectorize   │
     │ SQLite DB │    │ (embeddings)│
     └───────────┘    └─────────────┘
```

**Three-tier memory:**
1. **Short-term** (Durable Object) — current conversation context
2. **Long-term** (D1 database) — structured facts: name, preferences, key entities
3. **Semantic** (Vectorize) — vector embeddings for meaning-based recall

## 🚀 Quick Start (3 steps, ~5 minutes)

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free is fine)
- Node.js 18+

### 1. Clone & Install

```bash
git clone https://github.com/Trainspotting31/memory-buddy.git
cd memory-buddy
npm install
```

### 2. Create Cloudflare Resources

```bash
npx wrangler login

# Create D1 database
npx wrangler d1 create memory-buddy-db

# Create Vectorize index
npx wrangler vectorize create memory-buddy-index --dimensions 768 --metric cosine

# Initialize database schema
npx wrangler d1 execute memory-buddy-db --remote --file=schema.sql
```

Copy the generated `database_id` into `wrangler.toml` (rename from `wrangler.toml.example`).

### 3. Deploy

```bash
npx wrangler deploy
```

Done! Your memory server is live at `https://memory-buddy.<your-subdomain>.workers.dev` 🎉

## 🔌 Connect Your AI Tools

MemoryBuddy speaks MCP (Model Context Protocol). Any MCP-compatible tool can connect — they all share the same memory.

### Hermes Agent

```bash
hermes mcp add memory-buddy --url https://memory-buddy.<your-subdomain>.workers.dev/mcp
```

### Trae IDE

1. **Settings → MCP → Add Manually**
2. Type: **Streamable HTTP**
3. URL: `https://memory-buddy.<your-subdomain>.workers.dev/mcp`

Or create `.trae/mcp.json` in your project:

```json
{
  "mcpServers": {
    "memory-buddy": {
      "type": "streamable-http",
      "url": "https://memory-buddy.<your-subdomain>.workers.dev/mcp"
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "memory-buddy": {
      "url": "https://memory-buddy.<your-subdomain>.workers.dev/mcp"
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "memory-buddy": {
      "type": "streamable-http",
      "url": "https://memory-buddy.<your-subdomain>.workers.dev/mcp"
    }
  }
}
```

### Any MCP Client (raw config)

```
Endpoint: https://memory-buddy.<your-subdomain>.workers.dev/mcp
Transport: Streamable HTTP
Auth: None (or add your own)
```

## 🛠️ MCP Tools

Once connected, the AI gets 5 tools:

| Tool | What it does | When AI calls it |
|------|-------------|------------------|
| `recall_memory` | Load all memory for a user | Start of conversation |
| `search_memory` | Semantic search by meaning | "What did I say about X?" |
| `store_memory` | Save a new fact | User shares preferences, decisions |
| `forget_memory` | Delete all memory | User says "forget everything" |
| `list_memory_users` | List all memory spaces | Checking what exists |

**Shared memory:** All tools default to `userId: "hermes-shared"`. Use different userIds to isolate memory per project/persona.

## 📡 HTTP API (no MCP needed)

### `POST /chat` — Chat with memory

```bash
curl -N -X POST https://your-worker.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{"userId":"user123","message":"Hi! I'm John and I love espresso."}'
```

### `GET /memory/:userId` — Get all memory

```bash
curl https://your-worker.workers.dev/memory/user123
```

### `DELETE /memory/:userId` — Wipe memory

```bash
curl -X DELETE https://your-worker.workers.dev/memory/user123
```

### `GET /health` — Health check

```bash
curl https://your-worker.workers.dev/health
```

## ⚙️ Configuration

Edit `wrangler.toml`:

```toml
[vars]
LLM_MODEL = "@cf/meta/llama-3.2-3b-instruct"  # Default: Workers AI (free)

# Optional: use external LLM instead of Workers AI
LLM_API_KEY = "sk-your-key"
LLM_API_BASE = "https://api.openai.com/v1"
LLM_MODEL = "gpt-4o-mini"
```

## 💸 Why Cloudflare Free Tier?

| Component | Free Tier | Self-Hosted Equivalent |
|-----------|-----------|----------------------|
| Compute (Workers) | 100K req/day | $5–$50/mo (VPS) |
| Database (D1) | 1GB storage | $10–$100/mo (Postgres) |
| Vector DB (Vectorize) | 256K vectors | $70+/mo (Pinecone) |
| LLM (Workers AI) | 10K neurons/day | $10+/mo (API) |
| **Total** | **$0** | **~$100+/mo** |

## 📁 Project Structure

```
memory-buddy/
├── src/
│   ├── index.ts          # Hono router: /mcp + /chat + /memory + /health
│   ├── mcp.ts            # MCP Server factory (5 tools, stateless)
│   ├── agent-do.ts       # Durable Object: chat session + memory orchestration
│   ├── llm.ts            # LLM abstraction (Workers AI / OpenAI-compatible)
│   └── memory/
│       ├── extract.ts    # LLM-powered fact extraction
│       ├── retrieve.ts   # Hybrid retrieval (D1 + Vectorize)
│       └── summarize.ts  # Conversation summarization
├── public/index.html     # Built-in demo chat UI
├── schema.sql            # D1 database schema
├── wrangler.toml.example # Cloudflare config template
└── package.json
```

## 🎮 Try the Demo

Open your Worker URL in a browser — you'll see a built-in chat interface.

1. Tell the agent your name and a preference ("I'm Sarah, I'm allergic to peanuts")
2. Refresh the page
3. Ask: "What do you know about me?"

It remembers everything. That's MemoryBuddy.

## 🗺️ Roadmap

- [x] MCP Server (Streamable HTTP)
- [x] Multi-agent shared memory
- [x] Semantic search
- [x] Auto fact extraction
- [ ] Memory categories & filtering
- [ ] User authentication
- [ ] Batch memory import/export
- [ ] Multi-language support
- [ ] Hermes plugin (auto-inject memory at conversation start)

## 🤝 Contributing

1. Fork → 2. Branch → 3. Commit → 4. Push → 5. PR

## 📄 License

MIT — see [LICENSE](LICENSE)
