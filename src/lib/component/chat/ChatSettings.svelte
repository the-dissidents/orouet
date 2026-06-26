<script lang="ts">
  import { Secrets } from "$lib/Backend";
  import type { ProviderInfo } from "$lib/llm/ChatProvider";
  import { ConfigRow, ConfigTable } from "@the_dissidents/svelte-ui";

  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  let { provider = $bindable(), onExit }: {
    provider: ProviderInfo,
    onExit?: () => void
  } = $props();

  let inputValue = $state('');
  let working = $state(false);
  let preview = $state((await Secrets.get('llm-key'))?.slice(0, 6));
</script>

<h5>凭证</h5>

{#if !preview}
<div class="warning">
  <TriangleAlertIcon/>
  <div>
    未设置API密钥，将无法使用AI功能
  </div>
</div>
{/if}

<ConfigTable>
  <ConfigRow name={'提供商'}>
    <select bind:value={provider.type}>
      <option value="deepseek">DeepSeek</option>
      <!-- <option value="openai">OpenAI</option>
      <option value="gemini">Gemini</option>
      <option value="openai-generic">自定义（OpenAI API）</option> -->
      <option value="dummy">Dummy</option>
    </select>
  </ConfigRow>
  <ConfigRow name={'密钥'}>
    {#if preview}
      <code>{preview}...</code>
      <button onclick={async () => {
        working = true;
        await Secrets.delete('llm-key');
        working = false;
        preview = undefined;
      }} disabled={working}>{working ? '删除中' : '删除'}</button>
    {:else}
      <input type="text" bind:value={inputValue} />
      <button onclick={async () => {
        working = true;
        await Secrets.set('llm-key', inputValue);
        working = false;
        preview = inputValue.slice(0, 5);
        inputValue = '';
      }} disabled={working}>{working ? '保存中' : '保存'}</button>
    {/if}
  </ConfigRow>
</ConfigTable>

<div>
  <button onclick={onExit} class="hlayout">
    <ArrowLeftIcon />
    返回
  </button>
</div>

<style lang='scss'>
  @use "../../../util.scss" as *;

  .warning {
    padding: 10px;
    margin: 5px;
    border-radius: 10px;
    @include colorvars(background-color, accent1-back);

    display: flex;
    flex-direction: row;

    :global(.lucide) {
      padding: 5px 5px 5px 0;
      @include colorvars(color, accent2-border);
    }

    div {
      font-size: 90%;
      line-height: normal;
      flex-grow: 1;
    }
  }

  .hlayout {
    display: flex;
    flex-direction: row;
  }
</style>

