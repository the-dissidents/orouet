<script lang="ts">
  import DocumentView from '$lib/component/DocumentView.svelte';
  import { DocumentState } from '$lib/Document.svelte';
  import { Resizer } from '@the_dissidents/svelte-ui';
  import text from '../data/kleist.txt?raw';

  let doc = DocumentState.fromSourceStrings(text.split('\n\n'));

  let rightPane: HTMLElement | undefined = $state();

  let view: DocumentView | undefined = $state(undefined);
</script>

<div class="container">
  <header id="titlebar" data-tauri-drag-region>
  </header>
  <main class="page">
    <DocumentView document={doc} bind:this={view} />
    <Resizer first={rightPane!} reverse vertical useViewportFraction/>
    <div bind:this={rightPane} style:width="25vw">
      right panel
    </div>
  </main>
  <footer>
    {#if view?.selection()}
    {@const sel = view.selection()!}
      {sel.from.block.id}.{sel.from.pos}-{sel.to.block.id}.{sel.to.pos} {sel.ongoing ? 'ongoing' : 'ok'}
    {/if}
  </footer>
</div>

<style lang="scss">

#titlebar {
  min-height: 30px;
}

header, footer {
  padding: 0;
  flex: 0 0 auto;
}

main {
  display: flex;
  flex-direction: row;
  padding: 0 10px 10px 10px;
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

