<script lang="ts">
  import { Memorized } from "$lib/details/Memorized.svelte";
  import { createChatProvider, ProviderInfo, type ChatProvider } from "$lib/llm/ChatProvider";
  import { ChatSession } from "$lib/llm/ChatSession.svelte";
  import { onMount } from "svelte";
  import ChatView from "./ChatView.svelte";
  import { Debug } from "$lib/details/Util";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";

  const { context }: { context: DocumentContext } = $props();

  const providerInfo = Memorized.$('chat-provider', ProviderInfo, { type: 'deepseek' });

  let provider = $state<ChatProvider>();

  // svelte-ignore state_referenced_locally
  let chat = $state<ChatSession | undefined>(context.chats.at(0));

  onMount(async () => {
    const p = await createChatProvider($providerInfo);
    Debug.assert(!!p);
    provider = p;
  });
</script>

<select bind:value={chat}>
  <option value={undefined}>新建聊天</option>
  <hr>
{#each context.chats as c}
  <option value={c}>{c.title || '未命名聊天'}</option>
{/each}
</select>

{#if chat}
  <ChatView {chat} {provider}/>
{:else}

{/if}

<style>
  select {
    width: 100%;
  }
</style>
