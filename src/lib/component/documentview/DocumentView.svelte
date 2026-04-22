<script lang="ts" module>
  interface Context {
    source: DocumentViewContext,
    target: DocumentViewContext
  }

  const key = Symbol('DocumentViewContext');

  export function getDocumentViewContext(type: 'source' | 'target') {
    const ctx = getContext<Context>(key);
    Debug.assert(!!ctx);
    return ctx[type];
  }
</script>

<!-- svelte-ignore state_referenced_locally -->
<script lang="ts">
  import { DocumentState } from "$lib/Document.svelte";
  import { Resizer } from "@the_dissidents/svelte-ui";
  import BlockEditor from "../blockeditor/BlockEditor.svelte";
  import { getContext, setContext } from "svelte";
  import { Debug } from "$lib/details/Util";
  import { DocumentViewContext } from "./ViewContext.svelte";

  interface Props {
    document: DocumentState;
  }

  const { document }: Props = $props();

  let leftPane: HTMLElement | undefined = $state();

  const context: Context = {
    source: new DocumentViewContext(document, 'source'),
    target: new DocumentViewContext(document, 'target'),
  };
  setContext<Context>(key, context);

  export function selection(type: 'source' | 'target') {
    return context![type].selection;
  }
</script>

<div class="container">
  <div class="gutter">
    {#each document.clusters as _, i}
      <div>
        <div class="number">{i}</div>
      </div>
    {/each}
  </div>
  <div class="source" bind:this={leftPane} style:width="33vw">
    {#each document.clusters as cluster}
      <div class="cluster">
        {#each cluster.source as source}
          <BlockEditor block={source} type='source' />
        {/each}
      </div>
    {/each}
  </div>

  <div class="resizer">
    <Resizer first={leftPane} vertical useViewportFraction/>
  </div>

  <div class="target">
    {#each document.clusters as cluster}
      <div class="cluster">
        {#each cluster.target as target}
          <BlockEditor block={target} type='target' />
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .container {
    display: grid;
    /* Left Pane | Resizer | Right Pane */
    grid-template-columns: auto auto min-content 1fr;
    grid-template-rows: repeat(100, auto);
    overflow-y: auto;

    flex-grow: 1;
  }

  .source, .target {
    padding: 10px;
    display: grid;
    grid-template-rows: subgrid;
    grid-row: 1 / -1;
    /* background: #ddd; */

    border: 1px solid #ddd;
    border-radius: 4px;
  }

  .gutter {
    padding: 10px 15px 0 5px;
    display: grid;
    grid-template-rows: subgrid;
    grid-row: 1 / -1;

    grid-column: 1;
  }

  .source {
    grid-column: 2;
  }

  .resizer {
    grid-column: 3;
    grid-row: 1 / -1;
    cursor: col-resize;
    z-index: 10;
  }

  .target {
    grid-column: 4;
    overflow-y: auto;
  }
  .number {
    padding-top: 5px;
    color: gray;
    position: sticky;
    align-self: start;
    top: 0;

    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
