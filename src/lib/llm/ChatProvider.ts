import { OpenAIGenericProvider, OpenAIProviderInfo } from './OpenAI';
import { Debug } from '$lib/details/Util';
import * as z from 'zod/v4-mini';
import { DeepSeekProvider } from './DeepSeek';

export const Message = z.union([
    z.object({
        role: z.literal('assistant'),
        modelName: z.string(),
        reasoning: z.optional(z.string()),
        content: z.string(),
        // finished: z.optional(z.boolean())
    }),
    z.object({
        role: z.enum(['user', 'system']),
        content: z.string(),
    })
])
;

export type Message = z.infer<typeof Message>;

export interface ChatProvider {
    readonly info: ProviderInfo;
    readonly modelName: string;

    streamCompletion(
        messages: Message[],
        onChunk: (text: string, type?: 'reasoning' | 'content') => void
    ): Promise<void>;
}

export const ProviderInfo = z.union([
  z.object({
    type: z.literal("openai-generic"),
    ...OpenAIProviderInfo.shape,
  }),
  z.object({
    type: z.literal("openai")
  }),
  z.object({
    type: z.literal("gemini")
  }),
  z.object({
    type: z.literal("deepseek")
  })
]);

export class ChatProviderCreationError extends Error {
    constructor(readonly reason: 'no-key' | 'get-models-failed' | 'other') {
        super(reason);
    }
}

export class ChatProviderError extends Error {
    constructor(readonly reason: string) {
        super(reason);
    }
}

export type ProviderInfo = z.infer<typeof ProviderInfo>;

export async function createChatProvider(info: ProviderInfo) {
    switch (info.type) {
        case 'openai-generic': return await OpenAIGenericProvider.create(info);
        case 'deepseek': return await DeepSeekProvider.create();
        case 'openai': Debug.assert(false);
        case 'gemini': Debug.assert(false);
        default:
            info satisfies never;
    }
}
