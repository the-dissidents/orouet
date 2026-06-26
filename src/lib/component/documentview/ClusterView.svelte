<script lang="ts">
  import type { NodeViewProps } from "$lib/details/NodeView.svelte";
  import NodeViewContent from "$lib/details/NodeViewContent.svelte";
  import { Debug } from "$lib/details/Util";
  import { PaneSchema, type Cluster } from "$lib/Schema";
  import type { PaneContext } from "./DocView.svelte";

  interface Props extends NodeViewProps {
    context: PaneContext;
    node: Cluster;
  }

  const { context, node }: Props = $props();
  $effect(() => Debug.assert(node.type == PaneSchema.nodes.cluster));

  let current = $derived(node.attrs.id == context.dc.currentCluster);
</script>

<div class="cluster" data-current={current}>
  <NodeViewContent />
</div>

<style lang='scss'>
  @use "../../../../node_modules/@the_dissidents/svelte-ui/dist/uchu";

  .cluster {
    position: relative;
    // &[data-current=true] {
    //   background-color: uchu.$gray-1;
    // }
  }
</style>
