<script lang="ts">
  import { Debug } from "$lib/details/Util";
  import type { ChatProvider } from "$lib/llm/ChatProvider";
  import { ChatSession } from "$lib/llm/ChatSession.svelte";

  const { chat, provider }: { chat: ChatSession, provider?: ChatProvider } = $props();

  let input = $state('');

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!input.trim() || chat.isStreaming) return;

    Debug.assert(!!provider);
    const messageToSend = input;
    input = '';
    await chat.sendMessage(provider, messageToSend);
  }
</script>

<div class="message-log">
  {#each chat.messages as message}
    <div class="message-wrapper {message.role}">
      {#if message.role == 'assistant'}
        <span class="sender">{message.modelName}</span>
      {/if}
      <div class="content">{message.content}</div>
    </div>
  {/each}
</div>

<form onsubmit={handleSubmit} class="input-form">
  <input type="text" bind:value={input} disabled={chat.isStreaming} />
  <button type="submit" disabled={chat.isStreaming || !input.trim() || !provider}>发送</button>
</form>

<style>
  .message-log {
    flex-grow: 1;
    overflow-y: auto;
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .message-wrapper {
    display: flex;
    flex-direction: column;
    padding: 8px 10px;
    border-radius: 6px;
    max-width: 80%;
  }

  .message-wrapper.user {
    align-self: flex-end;
    background-color: #007acc;
    color: white;
  }

  .message-wrapper.assistant {
    align-self: flex-start;
    background-color: #f0f0f0;
    color: #333;
  }

  .sender {
    font-size: 0.75rem;
    text-transform: uppercase;
    font-weight: bold;
    margin-bottom: 0.25rem;
    opacity: 0.8;
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
