<script lang="ts">
  import { DocumentState } from "$lib/Document.svelte";
  import { Resizer } from "@the_dissidents/svelte-ui";

  interface Props {
    document: DocumentState;
  }

  const { document }: Props = $props();

  let leftPane: HTMLElement | undefined = $state();
</script>

<div class="container">
  <div class="source" bind:this={leftPane} style:width="33vw">
    {#each document.clusters as cluster}
      <div class="cluster">
        {#each cluster.source as source}
          <div class="block">
            {source.content}
          </div>
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
          {#if target.content}
            <div class='block'>
              {target.content}
            </div>
          {:else}
            <div class='empty'>
              add translation
            </div>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .container {
    display: grid;
    /* Left Pane | Resizer | Right Pane */
    grid-template-columns: auto 10px 1fr;
    grid-template-rows: repeat(10000, auto);
    overflow-y: auto;

    flex-grow: 1;
  }

  .resizer {
    grid-column: 2;
    grid-row: 1 / -1;
    cursor: col-resize;
    z-index: 10;
  }

  .source, .target {
    display: grid;
    grid-template-rows: subgrid;
    grid-row: 1 / -1;
    background: #f9f9f9;
  }

  .source {
    grid-column: 1;
  }
  .target {
    grid-column: 3; border-left: 1px solid #ddd;
    overflow-y: auto;
  }

  .block, .empty {
    margin: 0 0 5px 0;
    padding: 10px;
    border-radius: 3px;
    border: 1px solid transparent;

    &:hover {
      background-color: #fff;
      border-color: #eee;
    }
  }

  .block {
    font-family: serif;
    font-size: 125%;
  }

  .empty {
    color: gray;
    font-style: italic;
  }
</style>
