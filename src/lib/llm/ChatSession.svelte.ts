import { Message, type ChatProvider } from './ChatProvider';
import * as z from 'zod/v4-mini';

export const SerializedChatSession = z.object({
    title: z.string(),
    messages: z.array(Message),
    // providerInfo: ProviderInfo
});

export type SerializedChatSession = z.infer<typeof SerializedChatSession>;

export class ChatSession {
    title = $state<string>('');
    messages = $state<Message[]>([]);
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
            // tools?: Tool[]
        }
    ) {
        if (!content.trim() || this.isStreaming) return null;

        this.messages.push({ role: 'user', content });
        this.isStreaming = true;

        if (opt?.systemPrompt)
            provider.systemPrompt = opt.systemPrompt;

        const assistantIndex = this.messages.length;
        const message: Message = $state({
            role: 'assistant',
            modelName: provider.modelName,
            content: '', reasoning: '', original: null
        });
        this.messages.push(message);

        try {
            const history = this.messages.slice(0, assistantIndex);

            const ret = await provider.streamCompletion(history, (chunk, type) => {
                if (type == 'reasoning')
                    message.reasoning += chunk;
                else
                    message.content += chunk;
                return opt?.abort ? !opt.abort.signal.aborted : true;
            });
            if (ret) Object.assign(message, ret);
            return message;
        } catch (error) {
            console.error('Session error during execution:', error);
            message.content = 'Error: Failed to finalize stream interaction.';
        } finally {
            this.isStreaming = false;
        }
    }

    clearSession() {
        this.messages = [];
        this.isStreaming = false;
    }
}
