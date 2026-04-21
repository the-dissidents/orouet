<script lang="ts" module>
  export interface SelectionPoint {
    block: TextBlock,
    pos: number
  }

  export interface ViewSelection {
    from: SelectionPoint,
    to: SelectionPoint,
    ongoing: boolean
  }

  export interface DocumentViewContext {
    document: DocumentState,
    onSelectionChange: EventHost<[selection: ViewSelection]>,
    onDeleteSelection: EventHost<[selection: ViewSelection]>,
    activeBlock?: TextCluster,
    selection?: ViewSelection,
  }

  const key = Symbol('DocumentViewContext');

  export function getDocumentViewContext() {
    const ctx = getContext<DocumentViewContext>(key);
    assert(!!ctx);
    return ctx;
  }
</script>

<script lang="ts">
  import { DocumentState, type TextBlock, type TextCluster } from "$lib/Document.svelte";
  import { EventHost, Resizer } from "@the_dissidents/svelte-ui";
  import BlockEditor from "./blockeditor/BlockEditor.svelte";
  import { getContext, onMount, setContext } from "svelte";
  import { assert } from "$lib/details/Util";

  interface Props {
    document: DocumentState;
  }

  const { document }: Props = $props();

  let leftPane: HTMLElement | undefined = $state();

  let context: DocumentViewContext = $state({
    get document() {
      return document;
    },
    onSelectionChange: new EventHost(),
    onDeleteSelection: new EventHost(),
  });

  setContext<DocumentViewContext>(key, context);

  export function activeBlock() {
    return context.activeBlock;
  }

  export function selection(): Readonly<DocumentViewContext['selection']> {
    return context.selection;
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
