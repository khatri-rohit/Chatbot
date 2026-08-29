import { ChatOllama } from '@langchain/ollama';

export function getOllamaModel(modelName = 'gemma4:cloud') {
    return new ChatOllama({
        baseUrl: process.env.OLLAMA_HOST ?? 'https://ollama.com',
        model: modelName,
        headers: {
            Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
        },
        repeatPenalty: 1.1,
        temperature: 0.3,
        keepAlive: '25m',
    });
}
