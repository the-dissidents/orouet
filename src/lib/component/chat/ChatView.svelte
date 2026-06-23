<script lang="ts">
  import { Debug } from "$lib/details/Util";
  import type { ChatProvider } from "$lib/llm/ChatProvider";
  import { ChatSession } from "$lib/llm/ChatSession.svelte";
  import type { Attachment } from "svelte/attachments";
  import SvelteMarkdown from '@humanspeak/svelte-markdown';

  import SendIcon from '@lucide/svelte/icons/send';
  import SquareIcon from '@lucide/svelte/icons/square';

  const { chat, provider, beforeSubmit }: {
    chat: ChatSession,
    provider?: ChatProvider,
    beforeSubmit?: () => void
  } = $props();

  let input = $state('');

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!input.trim() || chat.isStreaming) return;

    beforeSubmit?.();

    Debug.assert(!!provider);
    const messageToSend = input;
    input = '';
    await chat.sendMessage(provider, messageToSend);
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

<div class="message-log" {@attach autoscroll}>
  <div>
    {#each chat.messages as message, i}
      <div class="message-wrapper {message.role}">
        {#if message.role == 'assistant'}
          <span class="sender">{message.modelName}</span>
          {#if message.reasoning}
            <details open={true}>
              <summary>显示思考过程</summary>
              <div class="reasoning">
                <SvelteMarkdown source={message.reasoning} />
              </div>
            </details>
          {/if}
        {/if}

        <div class="content">
          <SvelteMarkdown source={message.content} />
        </div>
      </div>
    {/each}
  </div>
</div>

<form onsubmit={handleSubmit} class="input-form">
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

  .message-log {
    flex-grow: 1;
    overflow-y: auto;
    padding: 5px;
    display: flex;
    flex-direction: column;
  }

  .message-wrapper {
    display: flex;
    flex-direction: column;
    padding: 10px;
    margin: 0;

    line-height: 1.4;
    font-family: system-ui, -apple-system;
    font-size: 95%;
    // text-align: justify;

    &.user {
      // border-bottom: 1px solid skyblue;
      background-color: #eee;
      border-radius: 6px;
      color: #333;

      @media (prefers-color-scheme: dark) {
        background-color: #444;
        color: #eee;
      }
    }
    &.assistant:not(:last-child) {
      margin-bottom: 20px;
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

    summary {
      list-style: none;
      font-size: 80%;

      &:hover {
        color: #007acc;
      }
    }

    &[open]::details-content {
      padding: 0 0 0 10px;
      margin: 5px 5px 5px 0;
      border-left: 2px solid #bbb;
    }
  }

  :is(.reasoning, .content) :global {
    @include markdown();
  }

  .reasoning {
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
    text-align: center;
    color: #888;
    margin: auto;
  }

  .input-form {
    display: flex;
    border-top: 1px solid gray;
    padding: 8px 0 0 0;
  }

  .input-form input {
    flex-grow: 1;
  }
</style>
