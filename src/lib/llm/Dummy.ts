import { wait } from "$lib/details/Util";
import { LoremIpsum } from "lorem-ipsum";
import type { ChatProvider, Message } from "./ChatProvider";

const lorem = new LoremIpsum();

export class DummyProvider implements ChatProvider {
    readonly info = { type: 'dummy' } as const;
    readonly modelName = 'dummy';

    reasoning = true;
    systemPrompt: string = '';

    async streamCompletion(
        _messages: Message[],
        onChunk: (text: string, type?: "reasoning" | "content") => boolean | void
    ) {
        const nr = Math.floor(Math.random() * 10 + 5);
        const nc = Math.floor(Math.random() * Math.random() * 40 + 10);
        console.log(nr, nc);
        for (let i = 0; i < nr; i++) {
            await wait(Math.random() * 100);
            console.log('11')
            const r = onChunk(
                lorem.generateWords(Math.floor(Math.random() * 4 + 1)) + ' ', 'reasoning');
            if (r === false) return;
        }
        for (let i = 0; i < nc; i++) {
            await wait(Math.random() * 100);
            const r = onChunk(
                lorem.generateWords(Math.floor(Math.random() * 4 + 1)) + ' ', 'content');
            if (r === false) return;
        }
    }
}
