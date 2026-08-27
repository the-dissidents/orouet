<script lang="ts">
  import { TextInitialIcon, GitGraphIcon, MessagesSquareIcon, FlaskConicalIcon, SearchIcon } from '@lucide/svelte';
  import { ButtonStrip, Resizer, StripItem, StripRadioItem, Tooltip } from '@the_dissidents/svelte-ui';

  import { DocumentContext } from '$lib/DocumentContext.svelte';
  import { Block, Cluster, columnPosition } from '$lib/Schema';
  import { Backend } from '$lib/Backend';

  import { Memorized } from '$lib/details/Memorized.svelte';

  import Editor from '$lib/component/documentview/Editor.svelte';
  import DisplayOptions from '$lib/component/DisplayOptions.svelte';
  import CommitGraph from '$lib/component/graph/CommitGraph.svelte';
  import LocaleSelect from '$lib/component/LocaleSelect.svelte';
  import ChatPanel from '$lib/component/chat/ChatPanel.svelte';

  import { _ } from 'svelte-i18n';
  import { locale, getTextDirection } from '$lib/I18n.js';

  import { basename } from '@tauri-apps/api/path';
  import * as dialog from '@tauri-apps/plugin-dialog';
  import { fly } from 'svelte/transition';
  import * as z from "zod/v4-mini";

  locale.set('zh');

  $effect(() => {
    const lang = $locale ?? 'en';
    document.documentElement.lang = lang;
    document.documentElement.dir = getTextDirection(lang);
  });

  import { onDestroy } from 'svelte';
  import { wait } from '$lib/details/Util';

  import text from '../data/kafka.txt?raw';
  import { getSystemPrompt, parseFencedCommands } from '$lib/component/chat/SystemPrompt';
  import Search from '$lib/component/Search.svelte';

  let ctx = $state(DocumentContext.fromTestClusters(text.trim().split('\n\n')));
  ctx.source.language = ['de', null, null];

  let rightPane: HTMLElement | undefined = $state();
  let page: 'format' | 'graph' | 'chat' | 'test' | 'search' = $state('graph');

  let chosen: 'source' | 'target' = $state('source');
  let editor = $state<Editor>();

  const rightSize = Memorized.$('right-size', z.string(), '33vw');
  const activeSide = $derived(editor?.activeSide());
  const selection = $derived(activeSide ? editor!.selection(activeSide) : undefined);

  let status = $state('ok');
  let path = $state('');

  async function init() {
    await Promise.all([
      wait(500),
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

  let testArea = $state('');
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
    <ButtonStrip>
      <StripItem onclick={load}>打开</StripItem>
      <StripItem onclick={save}>保存</StripItem>
      <StripItem onclick={saveAs}>另存为</StripItem>
      <StripItem onclick={() => console.log(ctx.serialize())}>test</StripItem>
    </ButtonStrip>

    <span class="path" data-tauri-drag-region>
      {path !== '' ? await basename(path) : '未命名文档'}
    </span>
    <div class="grow" data-tauri-drag-region>
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
        <Tooltip text='查找与替换' position='bottom'>
          <StripRadioItem value='search'><SearchIcon /></StripRadioItem>
        </Tooltip>
        <Tooltip text='测试' position='bottom'>
          <StripRadioItem value='test'><FlaskConicalIcon /></StripRadioItem>
        </Tooltip>
      </ButtonStrip>

      {#key ctx}
      <div class="tool" class:show={page == 'graph'}>
        <CommitGraph context={ctx}/>
      </div>
      <div class="tool" class:show={page == 'search'}>
        <Search context={ctx} {editor} />
      </div>
      <div class="tool" class:show={page == 'chat'}>
        <ChatPanel context={ctx} />
      </div>
      <div class="tool" class:show={page == 'format'}>
        <ButtonStrip bind:selectValue={chosen}>
          <StripRadioItem value='source'>{$_('source')}</StripRadioItem>
          <StripRadioItem value='target'>{$_('target')}</StripRadioItem>
        </ButtonStrip>

        <h5>语言</h5>
        <LocaleSelect bind:locale={ctx[chosen].language} />

        <DisplayOptions bind:value={ctx[chosen].options} />
        <textarea class="code"
          >{JSON.stringify(ctx[chosen].content.toJSON(), undefined, 2)}</textarea>
      </div>
      <div class="tool" class:show={page == 'test'}>
        <button onclick={() => console.log(getSystemPrompt(ctx))}>system prompt</button>
        <textarea style="width: 100%; height: 15em" bind:value={testArea}></textarea>
        <button onclick={() => {
          console.log(parseFencedCommands(testArea, ctx));
        }}>parseFencedCommands</button>
      </div>
      {/key}
    </div>
  </main>
  <footer>
    <div class="grow">{status}</div>
    {#if selection}
    {@const { $head: r, from, to } = selection}
    {@const cluster = Cluster.fromPos(r)}

    <div class="border">
      <span class="label">IDX:</span> {r.pos}
    </div>

    {#if cluster}
      <div class="border">
        <span class="label">段落：</span>{Cluster.indexFromPos(r)!+1} / {r.node(0).childCount}
      </div>
      {#if cluster.childCount > 1}
        <div class="border">
          <span class="label">子段落：</span>{Block.indexFromPos(r)!+1} / {cluster.childCount}
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
@use "@the_dissidents/svelte-ui/uchu.scss";
@use "../util.scss" as *;

.tool {
  display: none;

  &.show {
    display: contents;
  }
}

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
    width: 1.75em;
    height: 1.75em;
    padding: 0.25em;
  }
}

textarea.code {
  flex-grow: 1;
  font-family: var(--mono-font-family);
  font-size: 90%;
}
</style>

