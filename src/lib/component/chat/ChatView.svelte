<script lang="ts">
  import { Debug, wait } from "$lib/details/Util";
  import type { ChatProvider } from "$lib/llm/ChatProvider";
  import { ChatSession, MessageWithMetadata } from "$lib/llm/ChatSession.svelte";
  import type { Attachment } from "svelte/attachments";

  import SvelteMarkdown from '@humanspeak/svelte-markdown';
  import { SendIcon, SquareIcon, AstroidIcon } from '@lucide/svelte';

  import { getSystemPrompt, parseFencedCommands, type FencedCommandResult } from "./SystemPrompt";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { LoremIpsum } from "lorem-ipsum";
  import { scrollShadows, ScrollShadows } from "@the_dissidents/svelte-ui";
  import { Timer } from "$lib/details/Timer.svelte";
  import { _ } from "svelte-i18n";

  const { dc, chat, provider, beforeSubmit }: {
    dc: DocumentContext,
    chat: ChatSession,
    provider?: ChatProvider,
    beforeSubmit?: () => void
  } = $props();

  let input = $state('');
  const messageTimer = new Timer(100);
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
        onStateChanged(s) {
          if (s == 'connecting') return;
          if (s == 'reasoning') messageTimer.start();
          else messageTimer.stop();
        }
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
      <div class="message-wrapper {message.role}">
        {#if message.role == 'assistant'}
          <span class="sender">{message.modelName}</span>

          {#if message.state == 'connecting'}
            <header>
              {$_('chat.connecting')}
            </header>
          {/if}

          {#if message.reasoning}
            <details class="reasoning" open={true}>
              <summary>
                {#if message.state == 'reasoning'}
                  {$_('chat.thinking-seconds', { values:
                    {s: Math.floor(messageTimer.time / 1000)} })}
                {:else}
                  {$_('chat.thought-for-seconds', { values:
                    {s: Math.floor(message.thinkingTime / 1000)} })}
                {/if}
              </summary>
              <ScrollShadows>
                <div class="markdown" {@attach scrollShadows}>
                  {message.reasoning}
                  <!-- <SvelteMarkdown source={message.reasoning} /> -->
                </div>
              </ScrollShadows>
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
          {@const ok = cmd.errors.length == 0}
            <details class="command">
              <summary class:fail={!ok}>
                <AstroidIcon/>
                <code>{cmd.name}</code>
                <span>{ok ? $_('chat.success') : $_('chat.error')}</span>
              </summary>

              <ScrollShadows>
                <pre {@attach scrollShadows}>{cmd.code}</pre>
              </ScrollShadows>
            </details>
          {/each}
        {/if}

        {#if message.role == 'assistant'}
          {#if message.state == 'ok'}
            <footer class="result">
              {$_('chat.done-in-seconds', { values:
                {s: Math.floor(message.totalTime / 1000)} })}
            </footer>
          {/if}
        {/if}
      </div>
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

    footer {
      font-size: 90%;
      text-align: right;
      @include colorvars(color, disabled-text);
    }
  }

  .sender {
    font-size: 75%;
    text-transform: uppercase;
    font-weight: bold;
    opacity: 0.8;
  }

  details {
    margin-block: 5px;
    interpolate-size: allow-keywords;

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

    .markdown, pre {
      max-height: 300px;
      overflow-y: scroll;
    }

    summary {
      list-style: none;

      display: flex;
      align-items: center;

      :global(.lucide) {
        margin: 0 5px 0 0;
        height: 0.8lh;
        stroke-width: 2px;
        @include colorvars(color, disabled-text);
      }
    }
  }

  details.reasoning {
    summary {
      font-size: 80%;

      &:hover {
        @include colors(color, #007acc, #bde);
      }
    }
  }

  details.command {
    summary {
      code {
        font-family: monospace;
        font-weight: bold;
      }

      span {
        font-size: 90%;
        margin-left: 10px;
        @include colorvars(color, disabled-text);
      }

      &:hover {
        @include colors(color, #007acc, #bde);
      }

      &.fail span {
        @include colors(color, darkred, lightcoral);
      }
    }

    pre {
      white-space: pre-wrap;
      margin: 0;
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

    contain: layout paint;
  }

  .content {
    white-space: pre-wrap;
    user-select: text;
    -webkit-user-select: text;
    text-align: justify;
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
