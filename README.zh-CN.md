# MemoryBuddy 🧠

[English](README.md)

> **给你的 AI 装上共享记忆大脑。** 部署一次，所有 AI 工具——Hermes、Trae、Cursor、Claude Desktop——共享同一份记忆。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-blue)](https://modelcontextprotocol.io/)
[![Free Tier](https://img.shields.io/badge/Cost-$0-success)](#-为什么选择-cloudflare-免费额度)

## 🌟 这是什么？

你有没有遇到过这种情况：

- 在 Hermes 里告诉 AI 你的偏好，切到 Trae 又得重新说一遍
- 每次开新对话，AI 都像失忆了一样不记得你
- 好不容易养成的上下文，换个工具就全丢了

**MemoryBuddy** 就是为了解决这个。它是一个**共享记忆层**，任何支持 MCP 的 AI 工具都能读写：

- 🧠 **长期记忆** — 你的偏好、决定、重要事实，跨会话跨工具保留
- 🔍 **语义搜索** — 按意思找记忆，不是简单关键词匹配
- 🤖 **自动提取** — LLM 自动从对话中抽取值得记住的信息
- 📝 **智能总结** — 长对话自动压缩，保留关键信息
- 🗑️ **一键遗忘** — `DELETE` 接口清除全部记忆，符合 GDPR
- 🔌 **MCP 协议** — 任何 MCP 客户端都能连，零集成代码
- 💸 **0 元/月** — 全部跑在 Cloudflare 免费额度上

## 💡 解决了什么问题？

| 😣 没有 MemoryBuddy | ✅ 有了 MemoryBuddy |
|---------------------|---------------------|
| 每个 AI 工具都是独立的，你得反复自我介绍 | 所有 AI 工具共享一份记忆，告诉一个等于告诉全部 |
| 从 Hermes 切到 Trae，上下文全丢了 | 随便切——记忆在云端，不在工具里 |
| AI 忘记你的偏好，每次对话都要重新说 | 偏好永久保留，跨会话跨工具 |
| 长对话撑爆上下文窗口 | 自动总结压缩，关键信息不丢 |
| 隐私担忧——删不掉它记住的东西 | 一个 API 调用清除全部，完全 GDPR 合规 |

## 🏗️ 工作原理

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│ Hermes  │   │  Trae   │   │ Cursor  │   │ Claude  │
└────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘
     │ MCP         │ MCP         │ MCP         │ MCP
     ▼             ▼             ▼             ▼
┌──────────────────────────────────────────────────┐
│           MemoryBuddy Worker (Cloudflare)         │
│                                                  │
│   /mcp  → MCP 服务（5 个工具，Streamable HTTP）   │
│   /chat → HTTP API（SSE 流式 + 自动提取记忆）     │
│   /memory/:userId → REST API                     │
└──────────┬──────────────────┬────────────────────┘
           │                  │
     ┌─────▼─────┐    ┌──────▼──────┐
     │ D1 (事实) │    │ Vectorize   │
     │ SQLite库  │    │ (向量索引)  │
     └───────────┘    └─────────────┘
```

**三层记忆模型：**
1. **短期记忆**（Durable Object）— 当前对话上下文
2. **长期记忆**（D1 数据库）— 结构化事实：姓名、喜好、关键信息
3. **语义记忆**（Vectorize）— 向量嵌入，按"意思"而非"关键词"检索

## 🚀 快速开始（3 步，约 5 分钟）

### 准备工作

- [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费即可）
- Node.js 18+

### 第一步：克隆安装

```bash
git clone https://github.com/Trainspotting31/memory-buddy.git
cd memory-buddy
npm install
```

### 第二步：创建云端资源

```bash
npx wrangler login

# 创建 D1 数据库（存储结构化记忆）
npx wrangler d1 create memory-buddy-db

# 创建 Vectorize 向量索引（语义搜索）
npx wrangler vectorize create memory-buddy-index --dimensions 768 --metric cosine

# 初始化数据库表结构
npx wrangler d1 execute memory-buddy-db --remote --file=schema.sql
```

把生成的 `database_id` 填入 `wrangler.toml`（从 `wrangler.toml.example` 复制改名）。

### 第三步：部署

```bash
npx wrangler deploy
```

完成！访问 `https://memory-buddy.<你的子域名>.workers.dev` 即可 🎉

## 🔌 连接你的 AI 工具

MemoryBuddy 说 MCP 协议。任何支持 MCP 的工具都能连——它们共享同一份记忆。

### Hermes Agent

```bash
hermes mcp add memory-buddy --url https://memory-buddy.<你的子域名>.workers.dev/mcp
```

### Trae IDE

1. **设置 → MCP → 手动添加**
2. 类型选 **Streamable HTTP**
3. URL 填 `https://memory-buddy.<你的子域名>.workers.dev/mcp`

或者在项目根目录创建 `.trae/mcp.json`：

```json
{
  "mcpServers": {
    "memory-buddy": {
      "type": "streamable-http",
      "url": "https://memory-buddy.<你的子域名>.workers.dev/mcp"
    }
  }
}
```

### Cursor

在 `~/.cursor/mcp.json` 添加：

```json
{
  "mcpServers": {
    "memory-buddy": {
      "url": "https://memory-buddy.<你的子域名>.workers.dev/mcp"
    }
  }
}
```

### Claude Desktop

在 `claude_desktop_config.json` 添加：

```json
{
  "mcpServers": {
    "memory-buddy": {
      "type": "streamable-http",
      "url": "https://memory-buddy.<你的子域名>.workers.dev/mcp"
    }
  }
}
```

### 任何 MCP 客户端

```
端点：https://memory-buddy.<你的子域名>.workers.dev/mcp
协议：Streamable HTTP
认证：无（可自行添加）
```

## 🛠️ MCP 工具一览

连接后，AI 会获得 5 个工具：

| 工具 | 作用 | AI 什么时候调 |
|------|------|--------------|
| `recall_memory` | 加载所有记忆 | 对话开始时 |
| `search_memory` | 语义搜索记忆 | 用户问"我之前说过什么" |
| `store_memory` | 存入新记忆 | 用户分享偏好、决定、重要信息 |
| `forget_memory` | 删除所有记忆 | 用户说"忘掉一切" |
| `list_memory_users` | 列出所有记忆空间 | 查看有哪些记忆 |

**共享记忆：** 所有工具默认用 `userId: "hermes-shared"`。用不同 userId 可以按项目/角色隔离记忆。

## 📡 HTTP API（不用 MCP 也能用）

### `POST /chat` — 带记忆的对话

```bash
curl -N -X POST https://你的-worker地址.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{"userId":"user123","message":"你好！我叫小明，我喜欢喝咖啡。"}'
```

### `GET /memory/:userId` — 查看全部记忆

```bash
curl https://你的-worker地址.workers.dev/memory/user123
```

### `DELETE /memory/:userId` — 清除记忆

```bash
curl -X DELETE https://你的-worker地址.workers.dev/memory/user123
```

## ⚙️ 配置

编辑 `wrangler.toml`：

```toml
[vars]
LLM_MODEL = "@cf/meta/llama-3.2-3b-instruct"  # 默认用 Workers AI（免费）

# 可选：用外部 LLM 替代 Workers AI
LLM_API_KEY = "sk-你的密钥"
LLM_API_BASE = "https://api.openai.com/v1"
LLM_MODEL = "gpt-4o-mini"
```

## 💸 为什么选择 Cloudflare 免费额度？

| 服务 | 免费额度 | 自建方案 |
|------|---------|---------|
| 计算能力（Workers） | 10万次/天 | $5-$50/月 |
| 数据库（D1） | 1GB 存储 | $10-$100/月 |
| 向量搜索（Vectorize） | 25.6万向量 | $70+/月 |
| AI 服务（Workers AI） | 1万次/天 | $10+/月 |
| **总计** | **$0** | **~$100+/月** |

## 📁 项目结构

```
memory-buddy/
├── src/
│   ├── index.ts          # 入口：/mcp + /chat + /memory + /health 路由
│   ├── mcp.ts            # MCP 服务工厂（5 个工具，无状态）
│   ├── agent-do.ts       # 记忆管家（对话 + 记忆调度）
│   ├── llm.ts            # AI 大脑（Workers AI / OpenAI 兼容）
│   └── memory/
│       ├── extract.ts    # 记忆提取器
│       ├── retrieve.ts   # 混合检索（D1 + Vectorize）
│       └── summarize.ts  # 对话总结
├── public/index.html     # 内置 Demo 聊天界面
├── schema.sql            # D1 数据库表结构
├── wrangler.toml.example # Cloudflare 配置模板
└── package.json
```

## 🎮 体验 Demo

部署后打开 Worker URL，你会看到一个内置的聊天界面。

1. 告诉 AI 你的名字和一个偏好（"我叫小美，我对花生过敏"）
2. 刷新页面
3. 问它："你知道我是谁吗？"

它会记住你说的每一件事。

## 🗺️ 发展路线

- [x] MCP 服务（Streamable HTTP）
- [x] 多 Agent 共享记忆
- [x] 语义搜索
- [x] 自动记忆提取
- [ ] 记忆分类与过滤
- [ ] 用户认证
- [ ] 批量记忆导入/导出
- [ ] 多语言支持
- [ ] Hermes 插件（对话开始时自动注入记忆）

## 🤝 贡献指南

1. Fork → 2. 创建分支 → 3. 提交 → 4. 推送 → 5. 发起 PR

## 📄 许可证

MIT — 详见 [LICENSE](LICENSE)
