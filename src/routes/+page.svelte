<script lang="ts">
  import TextInitialIcon from '@lucide/svelte/icons/text-initial';
  import GitGraphIcon from '@lucide/svelte/icons/git-graph';
  import MessagesSquareIcon from '@lucide/svelte/icons/messages-square';
  import { ButtonStrip, Resizer, StripRadioItem } from '@the_dissidents/svelte-ui';

  import { DocumentContext } from '$lib/DocumentContext.svelte';
  import { blockIndex, clusterIndex, clusterOf, columnPosition } from '$lib/Schema';
  import { Memorized } from '$lib/details/Memorized.svelte';

  import Editor from '$lib/component/documentview/Editor.svelte';
  import DisplayOptions from '$lib/component/DisplayOptions.svelte';
  import CommitGraph from '$lib/component/graph/CommitGraph.svelte';

  import { setLocale } from '$lib/paraglide/runtime';
  import { m } from "$lib/paraglide/messages.js";

  import { basename } from '@tauri-apps/api/path';
  import * as dialog from '@tauri-apps/plugin-dialog';
  import * as z from "zod/v4-mini";
  import { Backend } from '$lib/Backend';

  setLocale('zh');

  let cxt = $state(DocumentContext.fromTestClusters(`
Aus einem elenden Zustand sich zu erheben, muß selbst mit gewollter Energie leicht sein. Ich reiße mich vom Sessel los, umlaufe den Tisch, mache Kopf und Hals beweglich, bringe Feuer in die Augen, spanne die Muskeln um sie herum. Arbeite jedem Gefühl entgegen, begrüße A. stürmisch, wenn er jetzt kommen wird, dulde B. freundlich in meinem Zimmer, ziehe bei C. alles, was gesagt wird, trotz Schmerz und Mühe mit langen Zügen in mich hinein.

Aber selbst wenn es so geht, wird mit jedem Fehler, der nicht ausbleiben kann, das Ganze, das Leichte und das Schwere, stocken, und ich werde mich im Kreise zurückdrehen müssen.

Deshalb bleibt doch der beste Rat, alles hinzunehmen, als schwere Masse sich verhalten, und fühle man sich selbst fortgeblasen, keinen unnötigen Schritt sich ablocken lassen, den anderen mit Tierblick anschaun, keine Reue fühlen, kurz, das, was vom Leben als Gespenst noch übrig ist, mit eigener Hand niederdrücken, das heißt, die letzte grabmäßige Ruhe noch vermehren und nichts außer ihr mehr bestehen lassen.

Eine charakteristische Bewegung eines solchen Zustandes ist das Hinfahren des kleinen Fingers über die Augenbrauen.
`.trim().split('\n\n')));

  // let cxt = $state(DocumentContext.fromTestClusters(text.trim().split('\n\n')));
  let rightPane: HTMLElement | undefined = $state();
  let page: 'format' | 'graph' | 'chat' = $state('format');

  let chosen: 'source' | 'target' = $state('source');
  let editor = $state<Editor>();

  const rightSize = Memorized.$('right-size', z.string(), '33vw');
  const activeSide = $derived(editor?.activeSide());
  const selection = $derived(activeSide ? editor!.selection(activeSide) : undefined);

  let status = $state('ok');
  let path = $state('');

  Memorized.init();

  async function load() {
    const filename = await dialog.open(
      { filters: [{ name: 'compressed orouët document', extensions: ['orz'] }] });
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
    cxt = DocumentContext.deserialize(JSON.parse(data));
    status = `已读取：${file}`;
  }

  async function writeTo(file: string) {
    const data = JSON.stringify(cxt.serialize());
    await Backend.saveCompressed(file, data);
    status = `已保存：${file}`;
  }
</script>

<div class="container">
  <header id="titlebar">
    <div class="spacer" data-tauri-drag-region></div>
    <button onclick={load}>open</button>
    <button onclick={save}>save</button>
    <button onclick={saveAs}>save as</button>
    <button onclick={() => console.log(cxt.serialize())}>test</button>
    <button>import</button>

    <span class="path" data-tauri-drag-region>
      {path !== '' ? await basename(path) : '未命名文档'}
    </span>
    <div class="end" data-tauri-drag-region>
    </div>
  </header>
  <main class="page">
    <Editor context={cxt} bind:this={editor} />
    <Resizer first={rightPane!} bind:value={$rightSize} reverse vertical useViewportFraction/>
    <div class="pane" bind:this={rightPane}>
      <ButtonStrip bind:selectValue={page} id='pageselector'>
        <StripRadioItem value='chat'><MessagesSquareIcon /></StripRadioItem>
        <StripRadioItem value='graph'><GitGraphIcon /></StripRadioItem>
        <StripRadioItem value='format'><TextInitialIcon /></StripRadioItem>
      </ButtonStrip>

      {#key cxt}
      {#if page == 'format'}
        <ButtonStrip bind:selectValue={chosen}>
          <StripRadioItem value='source'>{m.source()}</StripRadioItem>
          <StripRadioItem value='target'>{m.target()}</StripRadioItem>
        </ButtonStrip>
        <DisplayOptions bind:value={cxt[chosen].options} />
        <textarea readonly class="code"
          >{JSON.stringify(cxt[chosen].content.toJSON(), undefined, 2)}</textarea>
      {:else if page == 'graph'}
        <CommitGraph context={cxt}/>
      {/if}
      {/key}
    </div>
  </main>
  <footer>
    <div class="grow">{status}</div>
    {#if selection}
    {@const { $head: r, from, to } = selection}
      <div class="border">
        <span class="label">段落：</span>{clusterIndex(r)+1} / {r.node(0).childCount}
      </div>
      {#if clusterOf(r).childCount > 1}
        <div class="border">
          <span class="label">子段落：</span>{blockIndex(r)+1} / {clusterOf(r).childCount}
        </div>
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
  background-color: uchu.$pink-2;

  @media (prefers-color-scheme: dark) {
    background-color: uchu.$pink-9;
  }

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
    opacity: 0.5;
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

  label {
    .lucide {
      width: 2.5em;
      height: 2.5em;
    }
  }
}

textarea.code {
  flex-grow: 1;
  font-family: var(--mono-font-family);
  font-size: 90%;
}
</style>

