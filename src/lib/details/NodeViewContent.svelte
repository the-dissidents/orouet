<script lang="ts">
  import type { Snippet } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";

  const { children, contentsOnly = true, ...rest }: {
    children?: Snippet,
    contentsOnly?: boolean
  } & SvelteHTMLElements['div'] = $props();
</script>

<div data-node-view-content class:contents={contentsOnly} {...rest}>
  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  .contents {
    display: contents;
  }
</style>
