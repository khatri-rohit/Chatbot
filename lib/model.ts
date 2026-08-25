import { ChatOllama } from '@langchain/ollama';

export function getOllamaModel(modelName = 'gemma4:cloud') {
    const model = new ChatOllama({
        baseUrl: process.env.OLLAMA_HOST ?? 'https"//ollama.com',
        model: modelName,
        headers: {
            Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
        },
        repeatPenalty: 3,
        temperature: 0.3,
        keepAlive: '25m',
        // seed: 2
    });

    return model;
}
