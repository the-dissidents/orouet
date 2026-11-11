<script lang="ts">
  import { Debug, wait } from "$lib/details/Util";
  import type { ChatProvider } from "$lib/llm/ChatProvider";
  import { ChatSession, MessageWithMetadata } from "$lib/llm/ChatSession.svelte";
  import type { Attachment } from "svelte/attachments";

  import { SendIcon, SquareIcon } from '@lucide/svelte';

  import { getSystemPrompt, parseFencedCommands } from "./SystemPrompt";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { LoremIpsum } from "lorem-ipsum";
  import { _ } from "svelte-i18n";

  import MessageView from "./MessageView.svelte";

  const { dc, chat, provider, beforeSubmit }: {
    dc: DocumentContext,
    chat: ChatSession,
    provider?: ChatProvider,
    beforeSubmit?: () => void
  } = $props();

  let input = $state('');
  const lorem = new LoremIpsum();

  async function mockMessage(messageToSend: string) {
    chat.messages.push({ role: 'user', content: messageToSend });

    const msg = $state({
      role: 'assistant',
      modelName: 'mock',
      content: '',
      reasoning: '',
      originalContent: '',
      state: 'ok',
      thinkingTime: 0,
      totalTime: 0
    }) satisfies MessageWithMetadata;
    chat.isStreaming = true;
    chat.messages.push(msg);

    const nr = Math.floor(Math.random() * 10 + 5);
    const nc = Math.floor(Math.random() * Math.random() * 40 + 10);
    console.log(nr, nc);
    for (let i = 0; i < nr; i++) {
        await wait(Math.random() * 100);
        console.log('11')
        const r = lorem.generateWords(Math.floor(Math.random() * 4 + 1)) + ' ';
        msg.reasoning += r;
    }
    for (let i = 0; i < nc; i++) {
        await wait(Math.random() * 100);
        const r = lorem.generateWords(Math.floor(Math.random() * 4 + 1)) + ' ';
        msg.content += r;
    }

    msg.content += '\n```replace_clusters' + `
<oro-cluster id="${dc.target.content.child(1).attrs.id}" kind="text">
<oro-target>
<p>${lorem.generateParagraphs(1)}</p>
</oro-target>
</oro-cluster>
<oro-cluster id="${dc.target.content.maybeChild(Math.floor(Math.random() * 10))?.attrs?.id ?? 'hho'}" kind="text">
<oro-target>
<p>${lorem.generateParagraphs(1)}</p>
</oro-target>
</oro-cluster>
` + '```\n';

    chat.isStreaming = false;
    return msg;
  }

  async function handleSubmit(event: SubmitEvent, mock: boolean) {
    event.preventDefault();
    if (!input.trim() || chat.isStreaming) return;

    beforeSubmit?.();

    Debug.assert(!!provider);
    const messageToSend = input;
    input = '';

    const msg = mock
      ? await mockMessage(messageToSend)
      : await chat.sendMessage(provider, messageToSend, {
        systemPrompt: getSystemPrompt(dc),
      });
    if (!msg) return;

    const ret = parseFencedCommands(msg.content, dc);
    console.log(ret);
    msg.content = ret.cleanedMessage;

    if (ret.system) chat.messages.push({
      role: 'system', data: ret,
      message: ret.system
    });

    if (ret.transforms) {
      const commit = dc.currentCommitId;
      dc.addTransform(ret.transforms);
      dc.versionControl.addAttr({ label: $_('commitlabel.agentic-edit') });
      dc.currentDiffCommit = commit;
    }
  }

  export const autoscroll: Attachment = (node) => {
    chat;

    let isNearBottom = true;
    const threshold = 50;

    const evaluateScrollPosition = () => {
      const distanceToBottom = node.scrollHeight - node.clientHeight - node.scrollTop;
      isNearBottom = distanceToBottom <= threshold;
    };

    const scrollToBottom = () => {
      if (isNearBottom) {
        node.scrollTo({ top: node.scrollHeight, behavior: 'instant' });
      }
    };

    evaluateScrollPosition();
    node.addEventListener('scroll', evaluateScrollPosition);

    const observer = new ResizeObserver(scrollToBottom);
    observer.observe(node.firstChild as Element);

    return () => {
      node.removeEventListener('scroll', evaluateScrollPosition);
      observer.disconnect();
    };
  };
</script>

{#if chat.messages.length == 0}
<div class="no-message">
  <div>
    {$_('chat.type-below-to-start-a-conversation')}
  </div>
</div>
{/if}

<div class="message-log" {@attach autoscroll}>
  <div>
    {#each chat.messages as message}
      <MessageView {message} />
    {/each}
  </div>
</div>

<hr>

<form onsubmit={(e) => handleSubmit(e, /* mock: */ false)} class="input-form">
  <input type="text" bind:value={input} disabled={chat.isStreaming} />
  {#if chat.isStreaming}
    <button type="button" disabled={!provider}>
      <SquareIcon />
    </button>
  {:else}
    <button type="submit" disabled={chat.isStreaming || !input.trim() || !provider}>
      <SendIcon />
    </button>
  {/if}
</form>

<style lang="scss">
  .message-log {
    flex-grow: 1;
    overflow-y: auto;
    padding: 5px;
    display: flex;
    flex-direction: column;
  }

  .no-message {
    height: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;

    div {
      flex-grow: 1;
      text-align: center;
      font-weight: bold;
      color: gray;
    }
  }

  .input-form {
    display: flex;
    padding: 4px 0 0 0;
  }

  .input-form input {
    flex-grow: 1;
  }
</style>
