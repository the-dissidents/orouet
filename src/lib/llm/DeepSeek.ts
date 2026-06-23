// TODO: move to backend in the future to improve safety

import OpenAI from "openai";
import type { ChatProvider, Message, Tool } from "./ChatProvider";
import { Secrets } from "$lib/Backend";
import { Debug } from "$lib/details/Util";
import * as z from "zod/v4-mini";

export class DeepSeekProvider implements ChatProvider {
    private openai: OpenAI;

    modelName: 'deepseek-v4-flash' | 'deepseek-v4-pro' = 'deepseek-v4-pro';
    systemPrompt: string = '';

    get info() {
        return { type: 'deepseek' as const };
    }

    private constructor(secret: string) {
        this.openai = new OpenAI({
            apiKey: secret,
            baseURL: 'https://api.deepseek.com',
            dangerouslyAllowBrowser: true
        });
    }

    static async create() {
        const key = await Secrets.get('llm-key');
        Debug.assert(!!key);
        return new DeepSeekProvider(key);
    }

    async streamCompletion(
        messages: Message[],
        onChunk: (text: string, type: 'reasoning' | 'content') => boolean | void,
        tools: Tool[] = []
    ): Promise<void> {
        const stream = await this.openai.chat.completions.create({
            model: this.modelName,
            messages: [
                ...(this.systemPrompt ? [{
                    role: 'system',
                    content: this.systemPrompt
                }] as const : []),
                ...messages
            ],
            stream: true,
            tool_choice: 'auto',
            tools: tools.map((x) => ({
                type: 'function',
                function: {
                    name: x.name,
                    description: x.description,
                    parameters: z.toJSONSchema(x.parameters)
                }
            } as const))
        });

        for await (const chunk of stream) {
            const choice = chunk.choices[0]?.delta;
            if (!choice) continue;


            const reasoning: string = (choice as any).reasoning_content;
            if (reasoning) {
                const result = onChunk(reasoning, 'reasoning');
                if (result !== undefined && !result)
                    stream.controller.abort();
            }

            const delta = choice.content;
            if (delta) {
                const result = onChunk(delta, 'content');
                if (result !== undefined && !result)
                    stream.controller.abort();
            }
        }
    }
}
