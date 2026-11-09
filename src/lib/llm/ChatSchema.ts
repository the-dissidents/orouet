import * as z from "zod/v4-mini";

export const AssistantMessage = z.object({
    role: z.literal('assistant'),
    modelName: z.string(),
    reasoning: z.optional(z.string()),
    content: z.string(),
    originalContent: z.optional(z.string()),
});

export const UserMessage = z.object({
    role: z.enum(['user']),
    content: z.string(),
});

export const SystemMessage = z.object({
    role: z.literal('system'),
    data: z.optional(z.unknown()),
    message: z.string(),
});

export const Message = z.union([
    AssistantMessage,
    UserMessage,
    SystemMessage
]);

export type Message = z.infer<typeof Message>;

export const ResponseState = z.enum(['connecting', 'reasoning', 'responding', 'ok', 'error']);
export type ResponseState = z.infer<typeof ResponseState>;

export const ResponseMetadata = z.object({
    state: z._default(ResponseState, 'ok'),
    thinkingTime: z._default(z.number(), 0),
    totalTime: z._default(z.number(), 0),
});

export const MessageWithMetadata = z.union([
    z.extend(AssistantMessage, ResponseMetadata.shape),
    UserMessage,
    SystemMessage
]);

export type MessageWithMetadata = z.infer<typeof MessageWithMetadata>;

export const SerializedChatSession = z.object({
    title: z.string(),
    messages: z.array(MessageWithMetadata),
});

export type SerializedChatSession = z.infer<typeof SerializedChatSession>;
