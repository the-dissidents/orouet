<script lang="ts">
  import { Resizer } from "@the_dissidents/svelte-ui";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import DocView from "./DocView.svelte";
  import { Memorized } from "$lib/details/Memorized.svelte";
  import * as z from "zod/v4-mini";
  import ClusterKindSelector from "./ClusterKindSelector.svelte";

  interface Props {
    context: DocumentContext,
  }

  let { context: dc }: Props = $props();

  let leftPane: HTMLElement | undefined = $state();
  let source = $state<DocView>(), target = $state<DocView>();
  let diffDocs = $derived(dc.currentDiffCommit
    ? dc.getDocsAtCommit(dc.currentDiffCommit)
    : { source: undefined, target: undefined });

  const leftSize = Memorized.$('left-size', z.string(), '33vw');

  export function selection(side: 'source' | 'target') {
    source; target;
    return side == 'source' ? source?.selection() : target?.selection();
  }

  export function activeSide(): 'source' | 'target' | null {
    source; target;
    return source?.focused() ? 'source'
         : target?.focused() ? 'target'
         : null;
  }

  export function pane(side: 'source' | 'target') {
    return side == 'source' ? source : target;
  }
</script>

<div class="container">

{#key dc}
<div class="grid" style="grid-template-rows: min-content repeat({dc.source.content.childCount}, min-content) auto;">
  <div class="dummy-row">
    <div class="dummy-left" bind:this={leftPane} style:width="33vw"></div>
    <!-- <div class="dummy-right" bind:this={rightPane} style:width="33vw"></div> -->
  </div>

  <div class="resizer">
    <Resizer first={leftPane} bind:value={$leftSize} vertical useViewportFraction/>
  </div>

  {#each dc.source.content.children as cl, i}
    <div class='number-container' class:current={cl.attrs.id == dc.currentCluster}>
      <div class='number'>
        <span>{i+1}</span>
        <ClusterKindSelector index={i} {dc} />
      </div>
    </div>
  {/each}

  <div class="left">
    <DocView role='source' {dc} diffTarget={diffDocs.source} bind:this={source} />
  </div>

  <div class="right">
    <DocView role='target' {dc} diffTarget={diffDocs.target} bind:this={target} />
  </div>
</div>
{/key}

</div>

<style lang="scss">
  @use "../../../util.scss" as *;

  .container {
    width: 100%;
    overflow-y: auto;
  }

  .grid {
    display: grid;
    grid-template-columns: min-content min-content min-content minmax(0, 1fr);
    grid-auto-flow: column;

    flex-grow: 1;
    white-space: pre-wrap;
  }

  .dummy-row {
    height: 1px;

    display: grid;
    grid-template-columns: subgrid;
    grid-row: 1;
    grid-column: 1 / -1;

    .dummy-left {
      grid-column: 2;
    }
  }

  .number-container {
    grid-column: 1;
    margin: 3px 0 3px 0;

    border-right: 2px solid transparent;
    &.current {
      border-right: 2px solid var(--accent1-border-light);
      // @include colorvars(border-color, accent1-border);
    }
  }

  .number {
    padding: 4px 3px 0 8px;
    position: sticky;
    align-self: start;
    top: 0;

    display: flex;
    flex-direction: row;

    span {
      padding-right: 3px;
      flex-grow: 1;
      color: gray;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
  }

  .resizer {
    grid-column: 3;
    grid-row: 1 / -1;
    cursor: col-resize;
    z-index: 10;
  }

  :global(.ProseMirror) {
    display: grid;
    grid-row: 2 / -1;
    grid-template-rows: subgrid;
  }

  .left {
    display: contents;
    & :global(.ProseMirror) {
      grid-column: 2;
    }
  }

  .right {
    display: contents;
    & :global(.ProseMirror) {
      grid-column: 4;
    }
  }
</style>
