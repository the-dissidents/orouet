// TODO: move to backend in the future to improve safety

import OpenAI from "openai";
import type { ChatProvider, Message } from "./ChatProvider";
import { Secrets } from "$lib/Backend";
import { Debug } from "$lib/details/Util";
import * as z from 'zod/v4-mini';

export const OpenAIModelTraits = z.object({
  name: z.string(),
  reasoning: z.optional(z.array(z.enum(["none", "low", "medium", "high", "xhigh"]))),
  toolCall: z.optional(z.boolean())
});

export const OpenAIProviderInfo = z.object({
  baseUrl: z.string(),
  models: z.array(OpenAIModelTraits)
});

export type OpenAIModelTraits = z.infer<typeof OpenAIModelTraits>;
export type OpenAIProviderInfo = z.infer<typeof OpenAIProviderInfo>;

export class OpenAIGenericProvider implements ChatProvider {
    private openai: OpenAI;
    modelName: string;

    get info() {
        return { type: 'openai-generic' as const, ...this._info };
    }

    private constructor(private _info: OpenAIProviderInfo, secret: string) {
        Debug.assert(_info.models.length > 0);
        this.modelName = _info.models[0].name;
        this.openai = new OpenAI({
            apiKey: secret,
            baseURL: _info.baseUrl,
            dangerouslyAllowBrowser: true
        });
    }

    static async create(info: OpenAIProviderInfo) {
        const key = await Secrets.get('llm-key');
        Debug.assert(!!key);
        return new OpenAIGenericProvider(info, key);
    }

    async streamCompletion(
        messages: Message[],
        onChunk: (text: string) => boolean | void
    ): Promise<void> {
        const stream = await this.openai.chat.completions.create({
            model: this.modelName,
            messages: messages,
            stream: true,
        });

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || '';
            if (delta) {
                const result = onChunk(delta);
                if (result !== undefined && !result)
                    stream.controller.abort();
            }
        }
    }
}
