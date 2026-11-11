<script lang="ts">
  import { Timer } from "$lib/details/Timer.svelte";
  import type { MessageWithMetadata } from "$lib/llm/ChatSession.svelte";

  import SvelteMarkdown from '@humanspeak/svelte-markdown';
  import { AstroidIcon } from '@lucide/svelte';
  import { scrollShadows, ScrollShadows } from "@the_dissidents/svelte-ui";
  import { _ } from "svelte-i18n";

  import type { AgenticResult } from "./SystemPrompt";

  const { message }: { message: MessageWithMetadata } = $props();

  const thinkingTimer = new Timer(100);
  $effect(() => {
    if (message.role != 'assistant' || message.state != 'reasoning') return;
    thinkingTimer.start();
    return () => thinkingTimer.stop();
  });
</script>

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
              {s: Math.floor(thinkingTimer.time / 1000)} })}
          {:else}
            {$_('chat.thought-for-seconds', { values:
              {s: Math.floor(message.thinkingTime / 1000)} })}
          {/if}
        </summary>
        <ScrollShadows>
          <div class="markdown" {@attach scrollShadows}>
            {message.reasoning}
          </div>
        </ScrollShadows>
      </details>
    {/if}
  {/if}

  {#if message.role == 'assistant' || message.role == 'user'}
  <div class="content markdown">
    <button onclick={() => console.log(message.content)}>dump</button>
    <SvelteMarkdown source={message.content} />
  </div>
  {:else if message.role == 'system'}
  {@const ret = message.data as AgenticResult}
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

<style lang="scss">
  @use '../../../markdown.sass' as *;
  @use '../../../util.scss' as *;

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
</style>
