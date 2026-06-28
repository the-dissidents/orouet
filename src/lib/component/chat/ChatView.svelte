<script lang="ts">
  import { Debug, wait } from "$lib/details/Util";
  import type { ChatProvider, Message } from "$lib/llm/ChatProvider";
  import { ChatSession } from "$lib/llm/ChatSession.svelte";
  import type { Attachment } from "svelte/attachments";
  import SvelteMarkdown from '@humanspeak/svelte-markdown';

  import SendIcon from '@lucide/svelte/icons/send';
  import SquareIcon from '@lucide/svelte/icons/square';

  import { getSystemPrompt, parseFencedCommands, type FencedCommandResult } from "./SystemPrompt";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { LoremIpsum } from "lorem-ipsum";

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
      originalContent: ''
    }) satisfies Message;
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
<oro-cluster id="${dc.target.content.child(0).attrs.id}" kind="text">
<oro-target>
<p>${lorem.generateParagraphs(1)}</p>
</oro-target>
</oro-cluster>
<oro-cluster id="${dc.target.content.child(2).attrs.id}" kind="text">
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
      : await chat.sendMessage(provider, messageToSend, { systemPrompt: getSystemPrompt(dc) });
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
      if (ret.transforms.source.steps.length > 0)
        dc.addTransform('source', ret.transforms.source);
      if (ret.transforms.target.steps.length > 0)
        dc.addTransform('target', ret.transforms.target);
      dc.versionControl.addAttr({ label: '智能体编辑' });
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
    在下方输入指令，开始新的对话
  </div>
</div>
{/if}

<div class="message-log" {@attach autoscroll}>
  <div>
    {#each chat.messages as message}
      <div class="message-wrapper {message.role}">
        {#if message.role == 'assistant'}
          <span class="sender">{message.modelName}</span>
          {#if message.reasoning}
            <details class="reasoning" open={true}>
              <summary>显示思考过程</summary>
              <div class="markdown">
                <SvelteMarkdown source={message.reasoning} />
              </div>
            </details>
          {/if}
        {/if}

        {#if message.role == 'assistant' || message.role == 'user'}
        <div class="content markdown">
          <SvelteMarkdown source={message.content} />
        </div>
        {:else if message.role == 'system'}
        {@const ret = message.data as FencedCommandResult}
          {#each ret.commands as cmd}
            <details class="command">
              <summary>{cmd.name}</summary>
              <pre>{cmd.code}</pre>
            </details>
          {/each}
        {/if}
      </div>
    {/each}
  </div>
</div>

<hr>

<form onsubmit={(e) => handleSubmit(e, true)} class="input-form">
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
  @use '../../../markdown.sass' as *;
  @use '../../../util.scss' as *;

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

  .message-wrapper {
    display: flex;
    flex-direction: column;
    padding: 10px;
    margin: 0;

    line-height: 1.4;
    font-family: system-ui, -apple-system;
    font-size: 95%;

    &.user {
      @include colors(background-color, #eee, #444);
      @include colors(color, #333, #eee);
      border-radius: 6px;

      &:not(:first-child) {
        margin-top: 20px;
      }
    }

    &.system {
      padding: 5px 5px 5px 10px;
      border-radius: 5px;
      border-left: 1px solid skyblue;
      summary {
        list-style: none;
        font-family: monospace;
        font-weight: bold;

        &:hover {
          @include colors(color, #007acc, #bde);
        }
      }
      pre {
        // margin: 0;
        white-space: pre-wrap;
      }
    }
  }

  .sender {
    font-size: 75%;
    text-transform: uppercase;
    font-weight: bold;
    opacity: 0.8;
  }

  details.reasoning {
    margin-block: 5px;
    interpolate-size: allow-keywords;

    summary {
      list-style: none;
      font-size: 80%;

      &:hover {
        @include colors(color, #007acc, #bde);
      }
    }

    &::details-content   {
      height: 0;
      overflow: clip;
      transition: height 0.3s ease, content-visibility 0.3s ease allow-discrete;
    }

    &[open]::details-content {
      padding: 0 0 0 10px;
      margin: 5px 5px 5px 0;
      border-left: 2px solid #bbb;

      height: auto;
    }
  }

  .markdown :global  {
    @include markdown();
  }

  .reasoning .markdown  {
    white-space: pre-wrap;
    user-select: text;
    -webkit-user-select: text;

    font-size: 80%;
    opacity: 80%;
    line-height: 1.3;
  }

  .content {
    white-space: pre-wrap;
    user-select: text;
    -webkit-user-select: text;
  }

  .empty-state {
    @include colorvars(color, disabled-text);
    text-align: center;
    margin: auto;
  }

  .input-form {
    display: flex;
    padding: 4px 0 0 0;
  }

  .input-form input {
    flex-grow: 1;
  }
</style>
