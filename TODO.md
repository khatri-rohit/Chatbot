## Chatbot -> RAG's Agent

- Create a Chatbot with tools (like tell today's weather, search web browser using firecrawl etc.)
- Weather + web search run on the **parent** thread (follow-ups keep context)
- Pin = enable Firecrawl; off returns a structured error (no nested HITL)
- RAG ingest / retriever still not implemented
