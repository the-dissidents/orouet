import { createChatProvider, Message, ProviderInfo, type ChatProvider } from './ChatProvider';
import * as z from 'zod/v4-mini';

export const SerializedChatSession = z.object({
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
            messages: this.messages,
            // providerInfo: this.provider.info
        };
    }

    static deserialize(s: SerializedChatSession) {
        const session = new ChatSession();
        session.messages = s.messages;
        return session;
    }

    static example() {
        const session = new ChatSession();
        session.messages = [
            { role: 'user', content: 'hi' },
            { role: 'assistant', modelName: 'deepseek-v4-pro', reasoning: '1) If we don’t serialize the whole document at each commit we should store deltas. ProseMirror has serializable transform steps but I think this might difficult to use: I need stable compatibility for saved files so it’d better be something I control entirely on my side, independent with the editor library and with extra information perfectly typed. But on the other hand, emitting deltas manually from ProseMirror transactions (and re-applying them when reading) is also error-prone.\n\n2) Since we track paragraphs as something with a continue history we might give each one a UUID. But actions like merging two paragraphs and then splitting again destroys the continuity since one ID is discarded then a new one is assigned.', content: 'Es gibt noch freundliche Menschen, trotz des großen Elends. […] Besonders die wenig zu essen haben, geben gern ab. Wahrscheinlich zeigen die Menschen einfach gern, was sie können, und womit könnten sie es besser zeigen, als indem sie freundlich sind? Bosheit ist bloß eine Art Ungeschicklichkeit. Wenn jemand ein Lied singt oder eine Maschine baut oder Reis pflanzt, das ist eigentlich Freundlichkeit.' },
            { role: 'user', content: 'Write a Svelte 5 component showing a simple LLM chat interface. Use the OpenAI TypeScript API, but stay model-agnostic. Just text chat is enough, but you should support streaming.' },
            { role: 'assistant', modelName: 'deepseek-v4-pro', reasoning: 'Let’s start from one of them. There is a button that should open a <dialog> (not a system dialog!), which is a dynamically mounted Svelte component. When I click it the page reloads. In the logs there is a line', content: 'Note that this is a translation app and it’s natural to assume the translation mostly matches the original document’s structure, so paragraph might seem more like slots and merging/splitting is relatively rare: but it’s wrong to not consider that.' },
        ];
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
