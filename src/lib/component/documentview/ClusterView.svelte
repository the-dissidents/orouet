<script lang="ts">
  import type { NodeViewProps } from "$lib/details/NodeView.svelte";
  import NodeViewContent from "$lib/details/NodeViewContent.svelte";
  import { Debug } from "$lib/details/Util";
  import { PaneSchema } from "$lib/Schema";

  const { node }: NodeViewProps = $props();
  $effect(() => Debug.assert(node.type == PaneSchema.nodes.cluster));
</script>

<div class="cluster">
  <NodeViewContent />
</div>

<style lang="scss">
  @use "../../../../node_modules/@the_dissidents/svelte-ui/dist/uchu";


</style>
