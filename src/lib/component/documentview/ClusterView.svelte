<script lang="ts">
  import { DocumentSchema } from "$lib/Schema";
  import type { NodeViewProps } from "$lib/details/NodeView.svelte";
  import NodeViewContent from "$lib/details/NodeViewContent.svelte";
  import { Debug } from "$lib/details/Util";

  const { node, getPos }: NodeViewProps = $props();
  $effect(() => Debug.assert(node.type == DocumentSchema.nodes.cluster));

  let content: HTMLElement | undefined = $state();
</script>

<div class="cluster">
  <div class="number-container">
    <div class="number" contenteditable="false">
      {node.attrs.index}
    </div>
  </div>
  <NodeViewContent />
</div>

<style lang="scss">
  @use "../../../../node_modules/@the_dissidents/svelte-ui/dist/uchu";

  .number-container {
    grid-column: 1;
  }

  .number {
    font-size: 0.8em;

    padding: 5px 10px 0 0;
    color: gray;
    position: sticky;
    align-self: start;
    top: 0;

    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .cluster {
    display: contents;
  }

  .source {
    grid-column: 2;
  }

  .target {
    grid-column: 4;
  }
</style>
