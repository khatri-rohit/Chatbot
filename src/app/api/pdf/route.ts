import { OllamaEmbeddings } from "@langchain/ollama";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

import path from "node:path";
import { readFileSync } from "node:fs";
import { Document } from "@langchain/core/documents";
import { PDFParse } from "pdf-parse";

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { NextResponse } from "next/server";

const embeddings = new OllamaEmbeddings({
  model: "gemma4:cloud",
  //   baseUrl: "http://localhost:11434", // Default value
  baseUrl: process.env.OLLAMA_BASE_URL, // Default value
});

export async function GET() {
  const vectorStore = new MemoryVectorStore(embeddings);

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

  const filePath = path.join(
    process.cwd(),
    "lib",
    "RohitKhatri_Resume_SoftwareEngineer.pdf",
  );
  //   const filePath =
  //     "/d/02 Rohit/Rohit Work/repos/RAG's/chatbot-and-rag/lib/RohitKhatri_Resume_SoftwareEngineer.pdf";
  const docs = await loadPdfPages(filePath);
  // console.log(docs);

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const allSplits = await textSplitter.splitDocuments(docs);
  console.log(allSplits);

  await vectorStore.addDocuments(allSplits);
  console.log(await vectorStore.similaritySearch("Rohit Khatri"));

  const results1 = await vectorStore.similaritySearch("");

  console.log(results1[0]);

  return NextResponse.json({
    data: "Success",
  });
}
