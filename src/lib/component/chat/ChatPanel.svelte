<script lang="ts" module>
  const providerInfo = Memorized.$('chat-provider', ProviderInfo, { type: 'deepseek' });
</script>

<script lang="ts">
  import { Memorized } from "$lib/details/Memorized.svelte";
  import { createChatProvider, ProviderInfo, type ChatProvider } from "$lib/llm/ChatProvider";
  import { ChatSession } from "$lib/llm/ChatSession.svelte";
  import { onMount } from "svelte";
  import ChatView from "./ChatView.svelte";
  import { Debug } from "$lib/details/Util";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import ChatSettings from "./ChatSettings.svelte";

  const { context }: { context: DocumentContext } = $props();

  let providerInfoReactive = $state($providerInfo);
  providerInfo.subscribe((v) => providerInfoReactive = v);

  let provider = $state<ChatProvider>();

  // svelte-ignore state_referenced_locally
  let chat = $state<ChatSession | undefined>(context.chats.at(0));
  let temporaryChat = $state(new ChatSession());

  let view: 'chat' | 'settings' = $state('chat');

  onMount(updateProvider);

  async function updateProvider() {
    const p = await createChatProvider($providerInfo);
    Debug.assert(!!p);
    provider = p;
  }
</script>

{#if view == 'chat'}
  <select bind:value={chat} onselect={() => {
    if (!chat) temporaryChat = new ChatSession();
  }}>
    <option value={undefined}>新建聊天</option>
    <hr>
  {#each context.chats as c}
    <option value={c}>{c.title || '未命名聊天'}</option>
  {/each}
  </select>

  <div>
    当前模型：{provider?.modelName}
    <button onclick={() => view = 'settings'}>设置</button>
  </div>

  <ChatView chat={chat ?? temporaryChat} {provider}
    beforeSubmit={() => {
      if (!chat) {
        context.chats.push(temporaryChat);
        chat = temporaryChat;
      }
    }}/>
{:else}
  <ChatSettings bind:provider={providerInfoReactive}
    onExit={async () => {
      providerInfo.set(providerInfoReactive);
      view = 'chat';
      await updateProvider();
    }} />
{/if}

<style>
  select {
    width: 100%;
  }
</style>
