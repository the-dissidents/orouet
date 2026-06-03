<script lang="ts">
  import { Resizer } from "@the_dissidents/svelte-ui";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import DocView from "./DocView.svelte";
  import { Memorized } from "$lib/details/Memorized.svelte";
  import * as z from "zod/v4-mini";

  interface Props {
    context: DocumentContext,
  }

  let { context }: Props = $props();

  let leftPane: HTMLElement | undefined = $state();
  let content: HTMLElement | undefined = $state();

  const leftSize = Memorized.$('left-size', z.string(), '33vw');
</script>

<div class="container">

<div class="grid" bind:this={content} style="grid-template-rows: min-content repeat({context.source.content.childCount}, min-content) auto;">
  <div class="dummy-row">
    <div class="dummy-left" bind:this={leftPane} style:width="33vw"></div>
    <!-- <div class="dummy-right" bind:this={rightPane} style:width="33vw"></div> -->
  </div>

  <div class="resizer">
    <Resizer first={leftPane} bind:value={$leftSize} vertical useViewportFraction/>
  </div>

  {#each context.source.content.children as _, i}
    <div class="number-container">
      <div class="number" contenteditable="false">
        {i}
      </div>
    </div>
  {/each}

  <div class="left">
    <DocView role='source' dc={context} />
  </div>

  <div class="right">
    <DocView role='target' dc={context} />
  </div>
</div>

</div>

<style lang="scss">
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

    row-gap: 5px;
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
  }

  .number {
    padding: 7px 5px 0 5px;
    color: gray;
    position: sticky;
    align-self: start;
    top: 0;

    font-variant-numeric: tabular-nums;
    text-align: right;
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
