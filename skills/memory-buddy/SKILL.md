---
name: memory-buddy
description: Use MemoryBuddy long-term memory. Load memory at the start of a conversation, search it before answering questions about the user's past preferences, decisions or context, and store new durable facts the user shares. Use when the user mentions remembering, preferences, past decisions, or shared memory across agents.
---

# MemoryBuddy

MemoryBuddy gives every connected agent the same long-term memory through five MCP tools.

## When to call each tool

| Tool | When |
|------|------|
| `recall_memory` | Once at the start of a conversation, to load context. |
| `search_memory` | Before answering anything that depends on past preferences, decisions or context. |
| `store_memory` | When the user shares a durable fact: a preference, a decision, personal info, an important event. |
| `list_memory_users` | Only when the user asks which memory spaces exist. |
| `forget_memory` | Only when the user explicitly asks to erase memory. It deletes everything for that ID and cannot be undone. Confirm the ID with the user first, then pass `confirm: true`. |

## userId

- Leave `userId` at its default unless the user names one.
- Use `hermes-shared` for memory every agent should see.

## Writing good memories

- One fact per `store_memory` call.
- Be specific and self-contained: "User prefers dark mode in all editors", not "dark mode".
- Pick the closest `category`: `personal_info`, `preference`, `event`, `knowledge`, or `general`.
- Don't store secrets (passwords, API keys, tokens) or one-off chatter.
- Don't store a fact that `search_memory` shows is already there.
