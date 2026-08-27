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
  import { _ } from "svelte-i18n";

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
  <fieldset>
    <label>
      <span>{$_('chat.current-session')}</span>
      <select bind:value={chat} onselect={() => {
        if (!chat) temporaryChat = new ChatSession();
      }}>
        <option value={undefined}>{$_('chat.create-new-session')}</option>
        <hr>
      {#each context.chats as c}
        <option value={c}>{c.title || $_('chat.untitled-session')}</option>
      {/each}
      </select>
    </label>
    <label>
      <span>{$_('chat.model')}</span>
      <code>{provider?.modelName}</code>
      <button onclick={() => view = 'settings'}>{$_('chat.settings')}</button>
    </label>
  </fieldset>
  <hr>

  <ChatView chat={chat ?? temporaryChat} {provider} dc={context}
    beforeSubmit={() => {
      if (!chat) {
        context.chats.push(temporaryChat);
        chat = temporaryChat;
        temporaryChat = new ChatSession();
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

<style lang="scss">
  @use "../../../util.scss" as *;

  select {
    width: 100%;
  }

  fieldset {
    display: flex;
    flex-direction: column;

    label {
      width: 100%;
      display: flex;
      flex-direction: row;
      align-items: baseline;
      margin-bottom: 5px;
    }

    span {
      font-weight: bold;
      @include colorvars(color, disabled-text);
      white-space: pre;
      padding-right: 5px;
    }

    code {
      padding-right: 5px;
    }
  }
</style>
