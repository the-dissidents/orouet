import * as z from 'zod/v4-mini';
import { AssistantMessage, SystemMessage, UserMessage, type ChatProvider } from './ChatProvider';

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
    // providerInfo: ProviderInfo
});

export type SerializedChatSession = z.infer<typeof SerializedChatSession>;

export class ChatSession {
    title = $state<string>('');
    messages = $state<MessageWithMetadata[]>([]);
    isStreaming = $state<boolean>(false);

    constructor() {}

    serialize(): SerializedChatSession {
        return {
            title: this.title,
            messages: this.messages,
            // providerInfo: this.provider.info
        };
    }

    static deserialize(s: SerializedChatSession) {
        const session = new ChatSession();
        session.title = s.title;
        session.messages = s.messages;
        return session;
    }

    async sendMessage(
        provider: ChatProvider,
        content: string,
        opt?: {
            abort?: AbortController,
            systemPrompt?: string,
            onChunk?: (text: string, type?: 'reasoning' | 'content') => void,
            onStateChanged?: (state: ResponseState) => void,
        }
    ) {
        if (!content.trim() || this.isStreaming) return null;

        this.messages.push({ role: 'user', content });
        this.isStreaming = true;

        if (opt?.systemPrompt)
            provider.systemPrompt = opt.systemPrompt;

        const assistantIndex = this.messages.length;
        const message: MessageWithMetadata = $state({
            role: 'assistant',
            modelName: provider.modelName,
            content: '', reasoning: '', original: null,
            state: 'connecting',
            thinkingTime: 0,
            totalTime: 0,
        });
        this.messages.push(message);
        opt?.onStateChanged?.('connecting');

        let start = performance.now();
        let responseStart: number | undefined;

        try {
            const history = this.messages.slice(0, assistantIndex);

            const ret = await provider.streamCompletion(history, (chunk, type) => {
                if (!responseStart)
                    responseStart = performance.now();

                if (type == 'reasoning') {
                    message.reasoning += chunk;
                    if (message.state !== 'reasoning') {
                        message.state = 'reasoning';
                        opt?.onStateChanged?.('reasoning');
                    }
                    message.thinkingTime = performance.now() - responseStart;
                } else {
                    message.content += chunk;

                    if (message.state !== 'responding') {
                        message.state = 'responding';
                        opt?.onStateChanged?.('responding');
                    }
                }
                message.totalTime = performance.now() - start;
                return !(opt?.abort?.signal.aborted ?? false);
            });
            if (ret) Object.assign(message, ret);

            message.state = 'ok';
            opt?.onStateChanged?.('ok');
            return message;
        } catch (error) {
            console.error('Session error during execution:', error);
            message.state = 'error';
            opt?.onStateChanged?.('error');
        } finally {
            this.isStreaming = false;
        }
    }

    clearSession() {
        this.messages = [];
        this.isStreaming = false;
    }
}
