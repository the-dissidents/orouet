<script lang="ts">
  import TextInitialIcon from '@lucide/svelte/icons/text-initial';
  import GitGraphIcon from '@lucide/svelte/icons/git-graph';
  import MessagesSquareIcon from '@lucide/svelte/icons/messages-square';
  import { ButtonStrip, Resizer, StripRadioItem, Tooltip } from '@the_dissidents/svelte-ui';

  import { DocumentContext } from '$lib/DocumentContext.svelte';
  import { blockIndex, clusterIndex, clusterOf, columnPosition } from '$lib/Schema';
  import { Backend } from '$lib/Backend';

  import { Memorized } from '$lib/details/Memorized.svelte';

  import Editor from '$lib/component/documentview/Editor.svelte';
  import DisplayOptions from '$lib/component/DisplayOptions.svelte';
  import CommitGraph from '$lib/component/graph/CommitGraph.svelte';
  import LocaleSelect from '$lib/component/LocaleSelect.svelte';
  import ChatPanel from '$lib/component/chat/ChatPanel.svelte';

  import { setLocale } from '$lib/paraglide/runtime';
  import { m } from "$lib/paraglide/messages.js";

  import { basename } from '@tauri-apps/api/path';
  import * as dialog from '@tauri-apps/plugin-dialog';
  import { fly } from 'svelte/transition';
  import * as z from "zod/v4-mini";

  setLocale('zh');

  import { onDestroy } from 'svelte';
  import { wait } from '$lib/details/Util';

  import text from '../data/kafka.txt?raw';
  let ctx = $state(DocumentContext.fromTestClusters(text.trim().split('\n\n')));
  ctx.source.language = ['de', null, null];

  let rightPane: HTMLElement | undefined = $state();
  let page: 'format' | 'graph' | 'chat' = $state('format');

  let chosen: 'source' | 'target' = $state('source');
  let editor = $state<Editor>();

  const rightSize = Memorized.$('right-size', z.string(), '33vw');
  const activeSide = $derived(editor?.activeSide());
  const selection = $derived(activeSide ? editor!.selection(activeSide) : undefined);

  let status = $state('ok');
  let path = $state('');

  async function init() {
    await Promise.all([
      wait(750),
      Memorized.init(),
    ]);
  }

  onDestroy(async () => {
    Memorized.save();
  });

  async function load() {
    const filename = await dialog.open(
      { filters: [{ name: 'compressed orouët document', extensions: ['orz', 'oro'] }] });
    if (!filename) return;

    try {
      await readFrom(filename);
      path = filename;
    } catch (e) {
      status = `读取存档出错：${e}`;
      console.warn(e);
    }
  }

  async function save() {
    if (!path) saveAs();
    await writeTo(path);
  }

  async function saveAs() {
    const filename = await dialog.save(
      { filters: [{ name: 'compressed orouët document', extensions: ['orz'] }] });
    if (!filename) return;
    await writeTo(filename);
    path = filename;
  }

  async function readFrom(file: string) {
    const data = await Backend.readCompressed(file);
    ctx = DocumentContext.deserialize(JSON.parse(data));
    status = `已读取：${file}`;
  }

  async function writeTo(file: string) {
    const data = JSON.stringify(ctx.serialize());
    await Backend.saveCompressed(file, data);
    status = `已保存：${file}`;
    ctx.versionControl.addAttr({ fileSaved: true });
  }
</script>

<div class="container">
{#await init()}
  <div class="loading" out:fly>
    <div class="text">
      <div class="logo">orouët</div>
      <div>正在加载用户设置</div>
    </div>
  </div>
{/await}
  <header id="titlebar">
    <div class="spacer" data-tauri-drag-region></div>
    <button onclick={load}>open</button>
    <button onclick={save}>save</button>
    <button onclick={saveAs}>save as</button>
    <button onclick={() => console.log(ctx.serialize())}>test</button>
    <button>import</button>

    <span class="path" data-tauri-drag-region>
      {path !== '' ? await basename(path) : '未命名文档'}
    </span>
    <div class="end" data-tauri-drag-region>
    </div>
  </header>
  <main class="page">
    <Editor context={ctx} bind:this={editor} />
    <Resizer first={rightPane!} bind:value={$rightSize} reverse vertical useViewportFraction/>
    <div class="pane" bind:this={rightPane}>
      <ButtonStrip bind:selectValue={page} id='pageselector'>
        <Tooltip text='智能体' position='bottom'>
          <StripRadioItem value='chat'><MessagesSquareIcon /></StripRadioItem>
        </Tooltip>
        <Tooltip text='编辑历史' position='bottom'>
          <StripRadioItem value='graph'><GitGraphIcon /></StripRadioItem>
        </Tooltip>
        <Tooltip text='文本设置' position='bottom'>
          <StripRadioItem value='format'><TextInitialIcon /></StripRadioItem>
        </Tooltip>
      </ButtonStrip>

      {#key ctx}
      {#if page == 'format'}
        <ButtonStrip bind:selectValue={chosen}>
          <StripRadioItem value='source'>{m.source()}</StripRadioItem>
          <StripRadioItem value='target'>{m.target()}</StripRadioItem>
        </ButtonStrip>

        <h5>语言</h5>
        <LocaleSelect bind:locale={ctx[chosen].language} />

        <DisplayOptions bind:value={ctx[chosen].options} />
        <textarea readonly class="code"
          >{JSON.stringify(ctx[chosen].content.toJSON(), undefined, 2)}</textarea>
      {:else if page == 'graph'}
        <CommitGraph context={ctx}/>
      {:else if page == 'chat'}
        <ChatPanel context={ctx} />
      {/if}
      {/key}
    </div>
  </main>
  <footer>
    <div class="grow">{status}</div>
    {#if selection}
    {@const { $head: r, from, to } = selection}
    {@const cluster = clusterOf(r)}
    {#if cluster}
      <div class="border">
        <span class="label">段落：</span>{clusterIndex(r)!+1} / {r.node(0).childCount}
      </div>
      {#if cluster.childCount > 1}
        <div class="border">
          <span class="label">子段落：</span>{blockIndex(r)!+1} / {cluster.childCount}
        </div>
      {/if}
    {/if}
      <div class={{border: from !== to}}>
        <span class="label">字符：</span>{columnPosition(r)}
      </div>
      {#if from !== to}
        <div>
          <span class="label">选中长度：</span>{r.doc.textBetween(from, to).length}
        </div>
      {/if}
    {/if}
  </footer>
</div>

<style lang="scss">
@use "../../node_modules/@the_dissidents/svelte-ui/dist/uchu";
@use "../util.scss" as *;

.loading {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  z-index: 999;

  @include colors(background-color, white, black);

  font-family: 'Mluvka';
  text-align: center;

  .text {
    flex-grow: 1;

    .logo {
      font-size: 10em;
      padding-bottom: 0.5em;
    }
  }
}

#titlebar {
  height: 1lh;
  padding: 5px;
  display: flex;
  flex-direction: row;
  align-items: stretch;

  // border-bottom: 1px solid gray;

  .spacer {
    width: 150px;
  }
  .end {
    flex-grow: 1;
  }
  .path {
    margin-left: 10px;
    font-weight: bold;
    font-size: 90%;
  }
}

header, footer {
  padding: 0;
  flex: 0 0 auto;
}

.pane {
  display: flex;
  flex-direction: column;
}

footer {
  display: flex;
  flex-direction: row;
  @include colors(background-color, uchu.$pink-2, uchu.$pink-9);

  div {
    padding: 0 10px;
    margin: 5px 0;
    line-height: 1.5;
    font-family: monospace;

    &.border {
      border-right: 1px solid palevioletred;
    }
  }

  span.label {
    opacity: 0.7;
  }
}

main {
  display: flex;
  flex-direction: row;
  padding: 0 10px 5px 10px;
  flex: 1;
  min-height: 0;

  & > div {
    min-height: 0;
  }
}

.container {
  display: flex;
  flex-direction: column;

  margin: 0;
  padding: 0;
  height: 100vh;
  max-height: 100vh;
  box-sizing: border-box;
}

:global #pageselector {
  margin: 0 0 0.5em 0;

  label .lucide {
    width: 2.5em;
    height: 2.5em;
  }
}

textarea.code {
  flex-grow: 1;
  font-family: var(--mono-font-family);
  font-size: 90%;
}
</style>

