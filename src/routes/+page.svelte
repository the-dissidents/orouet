<script lang="ts">
  import DocumentView from '$lib/component/DocumentView.svelte';
  import { DocumentState } from '$lib/Document.svelte';
  import { Resizer } from '@the_dissidents/svelte-ui';
  import text from '../data/kleist.txt?raw';

  const doc = DocumentState.fromSourceStrings(text.split('\n\n'));

  let rightPane: HTMLElement | undefined = $state();
</script>

<div class="container">
  <header id="titlebar" data-tauri-drag-region>
  </header>
  <main class="page">
    <DocumentView document={doc} />
    <Resizer first={rightPane!} reverse vertical useViewportFraction/>
    <div bind:this={rightPane} style:width="33vw">
      right panel
    </div>
  </main>
  <footer>
    haha
  </footer>
</div>

<style lang="scss">
@use "../../node_modules/@the_dissidents/svelte-ui/dist/main";

@include main.configure(

);

:root {
  margin: 0;
  padding: 0;
}

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

