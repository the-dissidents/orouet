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
  let chat = $state<ChatSession>(ChatSession.example());

  onMount(async () => {
    const p = await createChatProvider($providerInfo);
    Debug.assert(!!p);
    provider = p;
  });
</script>

{#if chat}
  <ChatView {chat} {provider}/>
{/if}
