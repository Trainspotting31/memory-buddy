# CLAUDE.md

MemoryBuddy：基于 Cloudflare Workers 的多 Agent 共享记忆服务，通过 MCP 对外提供记忆工具。

## 项目结构

- `src/index.ts`：Worker 入口（Hono 路由）
- `src/mcp.ts`：MCP 服务，5 个记忆工具（recall / search / store / forget / list）
- `src/agent-do.ts`：Durable Object，每个 Agent 一个实例
- `src/llm.ts`：LLM 调用封装（默认 Workers AI，模型由 `LLM_MODEL` 配置）
- `src/memory/`：记忆提取、检索、摘要
- `schema.sql`：D1 表结构
- `test/`：vitest 单测

## 常用命令

- 安装依赖：`npm install`
- 跑测试：`npm run test:ci`
- 类型检查：`npx tsc --noEmit`
- 本地开发：`npm run dev`

## 完成标准

改完代码后，`npm run test:ci` 和 `npx tsc --noEmit` 都要通过才算完成。

## 何时继续、何时停下

- 某一步不需要我拍板时，直接继续。状态说明和下一步操作写在同一条消息里。
- 只有两种情况停下来问我：离开我就没法继续，或者要做破坏性操作（删数据、force-push、`wrangler deploy`、改本仓库以外的东西）。
- 耗时较长的任务，把任务清单记在 `TASKS.md`，做完一项勾一项，新发现的事项也加进去。

## 结尾汇报格式

每次任务结束，用三个标题汇报：

1. **需要我处理**：待我决定或确认的事项（放最前面）
2. **改了什么**
3. **发现的问题**

没能确认的内容要标出来，并说明查过哪里。

## 代码审查

审查 diff 时只列会阻止合并的问题。每条写清文件和行号、错在哪里、怎么复现。

## 写代码时

- 风格与周围代码保持一致（TypeScript、ES Module）。
- 不要把密钥写进代码或配置，`wrangler.toml`、`.env` 已被 git 忽略。
