import { range } from '$lib/details/Util';
import { createChatProvider, Message, ProviderInfo, type ChatProvider } from './ChatProvider';
import * as z from 'zod/v4-mini';
import { LoremIpsum } from "lorem-ipsum";

export const SerializedChatSession = z.object({
    messages: z.array(Message),
    // providerInfo: ProviderInfo
});

export type SerializedChatSession = z.infer<typeof SerializedChatSession>;

const ipsum = new LoremIpsum();

export class ChatSession {
    title = $state<string>('');
    messages = $state<Message[]>([]);
    isStreaming = $state<boolean>(false);

    constructor() {}

    serialize(): SerializedChatSession {
        return {
            messages: this.messages,
            // providerInfo: this.provider.info
        };
    }

    static deserialize(s: SerializedChatSession) {
        const session = new ChatSession();
        session.messages = s.messages;
        return session;
    }

    static lorem() {
        const session = new ChatSession();
        range(1, Math.random() * Math.random() * 15).forEach(() => session.messages.push(
            { role: 'user', content: ipsum.generateParagraphs(1) },
            {
                role: 'assistant',
                modelName: ipsum.generateWords(Math.floor(1 + Math.random() * 3)),
                reasoning: range(0, Math.random() * Math.random() * 6)
                    .map(() => ipsum.generateParagraphs(1)).toArray().join('\n\n'),
                content: range(0, Math.random() * 4)
                    .map(() => ipsum.generateParagraphs(1)).toArray().join('\n\n')
            }
        ));
        session.title = ipsum.generateSentences(1)
        return session;
    }

    async sendMessage(provider: ChatProvider, content: string, abort?: AbortController) {
        if (!content.trim() || this.isStreaming) return;

        this.messages.push({ role: 'user', content });
        this.isStreaming = true;

        const assistantIndex = this.messages.length;
        const message: Message = {
            role: 'assistant',
            modelName: provider.modelName,
            content: '', reasoning: ''
        };
        this.messages.push(message);

        try {
            const history = this.messages.slice(0, assistantIndex);

            await provider.streamCompletion(history, (chunk, type) => {
                if (type == 'reasoning')
                    message.reasoning += chunk;
                else
                    message.content += chunk;
                return abort ? !abort.signal.aborted : true;
            });
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
