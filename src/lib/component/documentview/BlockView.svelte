<script lang="ts">
  import { DocumentSchema } from "$lib/Schema";
  import type { NodeViewProps } from "$lib/details/NodeView.svelte";
  import NodeViewContent from "$lib/details/NodeViewContent.svelte";
  import { Debug } from "$lib/details/Util";

  const { node, view: _ }: NodeViewProps = $props();
  $effect(() => Debug.assert(node.type == DocumentSchema.nodes.block));

  let content: HTMLElement | undefined = $state();

  export function contentDOM() {
    return content;
  }
</script>

<div class="block">
  {#if node.textContent.length == 0}
    <div class="placeholder">enter text here</div>
  {/if}
  <NodeViewContent>
  </NodeViewContent>
</div>

<style lang="scss">
  @use "../../../../node_modules/@the_dissidents/svelte-ui/dist/uchu";

  .block {
    font-family: serif;
    line-height: normal;

    background-color: transparent;
    outline: none !important;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 5px 10px;

    transition: border 0.1s;

    position: relative;

    user-select: text;
    -webkit-user-select: text;

    &:hover {
      border: 1px solid var(--accent1-border-light);
    }

    & .placeholder {
      position: absolute;
      top: 0;
      pointer-events: none;
      font-family: var(--ui-font-family);
      color: gray;
    }
  }
</style>
