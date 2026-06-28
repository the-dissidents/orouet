// TODO: move to backend in the future to improve safety

import OpenAI from "openai";
import type { ChatProvider, Message } from "./ChatProvider";
import { Secrets } from "$lib/Backend";
import { Debug } from "$lib/details/Util";

type OpenAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function toMsg(m: Message): OpenAIMessage {
    switch (m.role) {
    case "assistant":
        return {
            role: m.role,
            content: m.originalContent ?? m.content,
            reasoning_content: m.reasoning
        } as OpenAIMessage;
    case "user":
        return m;
    // case "tool":
    //     return {
    //         role: m.role,
    //         tool_call_id: m.id,
    //         content: m.content
    //     };
    case "system":
        return {
            role: 'system',
            content: m.message
        };
    default:
        return m satisfies never;
    }
}

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
        // tools: Tool[] = []
    ): Promise<Message> {
        const stream = await this.openai.chat.completions.create({
            model: this.modelName,
            messages: [
                ...(this.systemPrompt ? [{
                    role: 'system',
                    content: this.systemPrompt
                }] as const : []),
                ...messages.map(toMsg)
            ],
            stream: true,
            // tool_choice: 'auto',
            // tools: tools.map((x) => ({
            //     type: 'function',
            //     function: {
            //         name: x.name,
            //         description: x.description,
            //         parameters: z.toJSONSchema(x.parameters)
            //     }
            // } as const))
        });

        // const toolCalls = [];
        let content = '', reasoning = '';

        for await (const chunk of stream) {
            const choice = chunk.choices[0]?.delta;
            if (!choice) continue;

            // if (choice.tool_calls)
            //     toolCalls.push(choice.tool_calls[0]);

            const rdelta: string = (choice as any).reasoning_content;
            if (rdelta) {
                reasoning += rdelta;
                const result = onChunk(rdelta, 'reasoning');
                if (result !== undefined && !result)
                    stream.controller.abort();
            }

            const delta = choice.content;
            if (delta) {
                content += delta;
                const result = onChunk(delta, 'content');
                if (result !== undefined && !result)
                    stream.controller.abort();
            }
        }

        return {
            role: 'assistant' as const,
            modelName: this.modelName,
            content, reasoning,
            originalContent: content
        }
    }
}
