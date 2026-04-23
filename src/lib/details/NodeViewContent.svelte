<script lang="ts">
  import type { Snippet } from "svelte";

  const { children }: {
    children?: Snippet
  } = $props();
</script>

<div data-node-view-content>
  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  div {
    display: contents;
  }
</style>
