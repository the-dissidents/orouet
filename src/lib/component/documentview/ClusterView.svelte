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
</script>

<NodeViewContent contentsOnly={false} data-cluster-kind={node.attrs.kind} />

<style lang='scss'>
  :global [data-cluster-kind] {
    position: relative;
  }
</style>
