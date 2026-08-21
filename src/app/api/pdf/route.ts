import { OllamaEmbeddings } from "@langchain/ollama";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { Document } from "@langchain/core/documents";
import { PDFParse } from "pdf-parse";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { StateBackend, createDeepAgent } from "deepagents";
import { providerStrategy, tool } from "langchain";
import z from "zod";
import { HumanMessage } from "@langchain/core/messages";

PDFParse.setWorker(
  pathToFileURL(
    path.join(
      process.cwd(),
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ),
  ).href,
);

export async function POST(request: NextRequest) {
  const body = await request.json();
  const query = body.query;

  if (!query) {
    return NextResponse.json(
      {
        status: "error",
        message: "Query is required.",
      },
      { status: 400 },
    );
  }

  console.log("Request received");

  const embeddings = new OllamaEmbeddings({
    model: "mxbai-embed-large:latest",
    baseUrl: "http://localhost:11434",
    requestOptions: {
      useMmap: true, // use_mmap 1
      numThread: 6, // num_thread 6
      numGpu: 1, // num_gpu 1
    },
  });
  console.log("embeddings created");

  const vectorStore = new MemoryVectorStore(embeddings);
  console.log("vectorStore created");

  // Below is a minimal helper for demonstration purposes.
  async function loadPdfPages(filePath: string): Promise<Document[]> {
    const parser = new PDFParse({
      data: new Uint8Array(readFileSync(filePath)),
    });
    try {
      const { pages } = await parser.getText();
      return pages.map(
        (page) =>
          new Document({
            pageContent: page.text,
            metadata: { source: filePath, page: page.num - 1 },
          }),
      );
    } finally {
      await parser.destroy();
    }
  }

  console.log("loadPdfPages started");
  const filePath = path.join(
    process.cwd(),
    "lib",
    "RohitKhatri_Resume_SoftwareEngineer.pdf",
  );
  // console.log("filePath", filePath);

  const docs = await loadPdfPages(filePath);
  // console.log(docs);

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 128,
  });

  const allSplits = await textSplitter.splitDocuments(docs);
  //   console.log(allSplits);

  const backend = new StateBackend();

  await vectorStore.addDocuments(allSplits);
  //   console.log(`Indexed ${allSplits.length} chunks.`);

  // search the vector store
  // const results1 = await vectorStore.similaritySearch("Logic UI/UX");

  // console.log(results1[0]);

  const model = new ChatOpenAI({
    model: "gpt-oss:120b-cloud",
    apiKey: process.env.OLLAMA_API_KEY,
    configuration: {
      baseURL: "https://ollama.com/v1",
    },
  });

  const CHUNK_ANALYST_INSTRUCTIONS = `You are a helpful assistant that can answer questions about the document. You can use the tools provided to you to answer the questions. You can also use the information in the document to answer the questions. 

  You are given a chunk of the document and you need to analyze the chunk and return the summary of the chunk.
  You can use the tools provided to you to answer the questions.
  You can also use the information in the document to answer the questions.
  You can use the information in the document to answer the questions.
  You can use the information in the document to answer the questions.

  The summary should be in the following format:
  {
    summary: "The summary of the chunk.",
    sources: ["The sources of the summary."],
  }
  `;

  const chunkAnalystSubagent = {
    name: "chunk-analyst",
    description:
      "Analyze the chunk of the document and return the summary of the chunk.",
    systemPrompt: CHUNK_ANALYST_INSTRUCTIONS,
  };

  const searchDocumentation = tool(
    async ({ query }) => {
      const retrievedDocs = await vectorStore.similaritySearch(query, 2);
      const uploads: Array<[string, Uint8Array]> = [];
      const encoder = new TextEncoder();

      retrievedDocs.forEach((doc) => {
        const content = `# Source: ${doc.metadata.source ?? "unknown"}\n\n${doc.pageContent}`;
        const text = encoder.encode(content);
        const data = new Uint8Array(text);
        uploads.push([`/${doc.metadata.source.split("/").pop()}`, data]);
      });
      // console.log("uploads", uploads);
      backend.uploadFiles(uploads);

      return `Uploaded ${uploads.length} files to the agent filesystem.`;
    },
    {
      name: "searchDocumentation",
      description:
        "Search the information in the document and save the chunks to the agent filesystem.",
      schema: z.object({
        query: z.string().describe("Natural language search query."),
      }),
    },
  );

  const agent = createDeepAgent({
    model: model,
    tools: [searchDocumentation],
    backend,
    systemPrompt:
      "You are a helpful assistant that can answer questions about the document. You can use the tools provided to you to answer the questions. You can also use the information in the document to answer the questions.",
    subagents: [chunkAnalystSubagent],
    // responseFormat: providerStrategy(
    //   z.object({
    //     answer: z.string().describe("The answer to the question."),
    //     sources: z.array(z.string()).describe("The sources of the answer."),
    //   }),
    // ),
  });

  const result = await agent.invoke({
    messages: [new HumanMessage(query)],
  });
  // console.log(result);

  return NextResponse.json({
    status: "success",
    message: "Answer retrieved from the document successfully.",
    data: [result],
  });
}
