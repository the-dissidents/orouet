<script lang="ts">
  import { Resizer } from '@the_dissidents/svelte-ui';
  import DocView from '$lib/component/documentview/DocView.svelte';
  import { DocumentContext } from '$lib/DocumentContext.svelte';
  import Editor from '$lib/component/documentview/Editor.svelte';

  let cxt = $state(DocumentContext.fromTestClusters(`
Aus einem elenden Zustand sich zu erheben, muß selbst mit gewollter Energie leicht sein. Ich reiße mich vom Sessel los, umlaufe den Tisch, mache Kopf und Hals beweglich, bringe Feuer in die Augen, spanne die Muskeln um sie herum. Arbeite jedem Gefühl entgegen, begrüße A. stürmisch, wenn er jetzt kommen wird, dulde B. freundlich in meinem Zimmer, ziehe bei C. alles, was gesagt wird, trotz Schmerz und Mühe mit langen Zügen in mich hinein.

Aber selbst wenn es so geht, wird mit jedem Fehler, der nicht ausbleiben kann, das Ganze, das Leichte und das Schwere, stocken, und ich werde mich im Kreise zurückdrehen müssen.

Deshalb bleibt doch der beste Rat, alles hinzunehmen, als schwere Masse sich verhalten, und fühle man sich selbst fortgeblasen, keinen unnötigen Schritt sich ablocken lassen, den anderen mit Tierblick anschaun, keine Reue fühlen, kurz, das, was vom Leben als Gespenst noch übrig ist, mit eigener Hand niederdrücken, das heißt, die letzte grabmäßige Ruhe noch vermehren und nichts außer ihr mehr bestehen lassen.

Eine charakteristische Bewegung eines solchen Zustandes ist das Hinfahren des kleinen Fingers über die Augenbrauen.
`.trim().split('\n\n')));

  let rightPane: HTMLElement | undefined = $state();
</script>

<div class="container">
  <header id="titlebar" data-tauri-drag-region>
  </header>
  <main class="page">

    <Editor context={cxt} />

    <Resizer first={rightPane!} reverse vertical useViewportFraction/>
    <div bind:this={rightPane} style:width="25vw">
      <button onclick={() => {
        console.log(cxt.target);
      }}>replace p2</button>
    </div>
  </main>
  <footer>
    <div class="grow">ok</div>
    <!-- <div>
      {#if view?.selection('source')}
      {@const sel = view.selection('source')!}
      {@const e = `${sel.from.block.id}.${sel.from.pos}-${sel.to.block.id}.${sel.to.pos}`}
        {#if sel.ongoing}
          <b>{e}</b>
        {:else}
          {e}
        {/if}
      {/if}
    </div>
    <div>
      {#if view?.selection('target')}
      {@const sel = view.selection('target')!}
      {@const e = `${sel.from.block.id}.${sel.from.pos}-${sel.to.block.id}.${sel.to.pos}`}
        {#if sel.ongoing}
          <b>{e}</b>
        {:else}
          {e}
        {/if}
      {/if}
    </div> -->
  </footer>
</div>

<style lang="scss">
@use "../../node_modules/@the_dissidents/svelte-ui/dist/uchu";

#titlebar {
  min-height: 30px;
}

header, footer {
  padding: 0;
  flex: 0 0 auto;
}

footer {
  display: flex;
  flex-direction: row;
  background-color: uchu.$pink-2;

  @media (prefers-color-scheme: dark) {
    background-color: uchu.$pink-9;
  }

  div {
    padding: 2px 10px;
    font-family: monospace;
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
</style>

