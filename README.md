# Atelier

A streaming **psychology research desk**. Ask about emotion, memory, cognition, methods, and related findings. Answers render live in Markdown. Optional live web search stays on the same thread so follow-ups can reuse what was just found.

Atelier is a [Next.js](https://nextjs.org) app with a [LangChain Deep Agent](https://github.com/langchain-ai/deepagents) backend. It is **not a general chatbot**: it declines coding, weather, and other off-scope tasks. It is also **not a clinician** — it discusses published evidence and should not diagnose or treat.

> Document retrieval (RAG ingest / retriever) is not implemented yet. Live literature comes from Firecrawl search and page fetch.

## Features

- **Streaming desk UI** — AI SDK `useChat` over `/api/chat`. Replies render as they arrive (Markdown, math, code, Mermaid).
- **Psychology-scoped agent** — Deep Agent named `atelier` with identity in `lib/ai/harness/AGENTS.md`. Middleware blocks programming and weather requests before the model runs.
- **Parent-thread search** — `internet_search` and `firecrawl_fetch_url_tool` run on the parent graph, so later turns still see hit lists and page JSON.
- **Research subagent** — Multi-source literature briefs (comparisons, evidence reviews, methods) go to `research-agent`. Single lookups stay on the parent.
- **Web search pin** — Off by default. When off, search tools return a structured error and the model answers from the thread (or memory) instead of crashing. When on, tool-approval chrome is hidden so search can run in the same turn.
- **Human-in-the-loop** — If LangGraph interrupts for tool approval, the UI shows an approve/reject card and resumes the same thread.
- **LangSmith tracing** — Optional. Each HTTP turn is a root run; LangGraph LLM and tool spans nest under it.

## Architecture

```
Browser (ChatSession / useChat)
        │  POST /api/chat  { id, messages, webSearchEnabled, resume? }
        ▼
  app/api/chat/route.ts
        │  LangGraph thread_id = chat id
        │  streamMode: values, messages, tools, custom
        ▼
  Deep Agent (MemorySaver checkpointer)
        ├── parent tools: internet_search, firecrawl_fetch_url_tool
        ├── subagent: research-agent (same tools, flash model)
        └── middleware: psychology scope, retries, call limits, model fallback
                │
                ▼
        Ollama cloud models  +  Firecrawl (search / scrape)
```

**Thread state** lives in two places:

| Store | What it holds | Lifetime |
| --- | --- | --- |
| LangGraph `MemorySaver` | Agent messages, tool JSON, interrupts | Process memory (lost on restart) |
| `sessionStorage` (`atelier-thread`) | UI messages, pin state, thread id | Current browser tab |

Existing threads send only the last user message; the checkpointer already has the rest.

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Chat UI | `@ai-sdk/react`, Streamdown |
| Agent | `deepagents`, LangGraph, LangChain |
| Models | Ollama Cloud (`ChatOllama`) — parent `deepseek-v4-pro:cloud`, research subagent `deepseek-v4-flash:cloud` |
| Web | Firecrawl search + batch scrape |
| Observability | LangSmith |

## Getting started

**Prerequisites:** Node.js 20+, an [Ollama Cloud](https://ollama.com) API key. Firecrawl and LangSmith are optional but search and tracing need their keys.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`, then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Serve an existing build |
| `npm run serve` | Build, then start |
| `npm run lint` | ESLint |

## Environment

Copy `.env.example` to `.env.local`. Do not commit secrets.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OLLAMA_HOST` | No (defaults to `https://ollama.com`) | ChatOllama base URL |
| `OLLAMA_API_KEY` | Yes | Bearer token for Ollama Cloud |
| `FIRECRAWL_API_KEY` | For live search | `internet_search` and page fetch. Missing key → structured tool error |
| `LANGSMITH_TRACING` | No | Set `true` to record traces |
| `LANGSMITH_API_KEY` | For tracing | [smith.langchain.com](https://smith.langchain.com) API key |
| `LANGSMITH_PROJECT` | No (defaults to `atelier`) | Project traces land in |
| `LANGSMITH_WORKSPACE_ID` | Org-scoped keys only | LangSmith workspace |
| `LANGSMITH_TRACING_BACKGROUND` | Recommended `false` on serverless | Flush batches before the isolate freezes |
| `NEXT_PUBLIC_SITE_URL` | Production | Canonical origin for metadata, sitemap, JSON-LD |

`LANGCHAIN_TRACING_V2` / `LANGCHAIN_API_KEY` / `LANGCHAIN_PROJECT` are still accepted as aliases.

## How a turn works

1. The composer posts to `/api/chat` with the LangGraph `thread_id` and the web-search pin.
2. Scope middleware may end the turn immediately (coding / weather).
3. The parent either answers in prose, calls search/fetch itself, or delegates a brief to `research-agent`.
4. Search queries are rewritten (constructs, authors, years) — the user’s sentence is not passed through as a query.
5. The route pipes LangGraph output into an AI SDK UI message stream. Progress events from tools show in the desk.
6. If the graph pauses for HITL, the snapshot is sent as `data-hitl`; approve/reject calls `regenerate()` with `resume.decisions`.

The chat route uses the Node.js runtime and `maxDuration = 300` so long research turns can finish.

## Project layout

```
app/api/chat/route.ts     Stream Deep Agent output as UI messages
lib/ai/agent.ts           createDeepAgent, tools, subagents, checkpointer
lib/ai/prompts.ts         Parent + research-agent context
lib/ai/harness/AGENTS.md  Identity and scope (Deep Agent memory)
lib/ai/tools/             Firecrawl search and URL fetch
lib/ai/middleware/        Psychology scope + tool-call id / interrupt handling
lib/ai/tracing.ts         LangSmith root run, flush, tags
lib/model.ts              ChatOllama client
components/               Desk UI (session, composer, HITL, markdown)
```

## Limits

- Checkpoints are in-process. Redeploy or `npm run serve` starts a new graph; the browser may still show old UI messages.
- Web search is scholarly psychology only. The agent is instructed not to invent URLs or statistics.
- RAG over a private corpus is still to do — this repo name is ahead of that work.
