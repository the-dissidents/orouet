<script lang="ts">
  import { PaneSchema } from "$lib/Schema";
  import type { NodeViewProps } from "$lib/details/NodeView.svelte";
  import NodeViewContent from "$lib/details/NodeViewContent.svelte";
  import { Debug } from "$lib/details/Util";

  const { node, view: _ }: NodeViewProps = $props();
  $effect(() => Debug.assert(node.type == PaneSchema.nodes.block));

  $inspect(node).with((t, v) => console.log(t, v));
</script>

<NodeViewContent data-block contentsOnly={false}>
</NodeViewContent>

<style lang="scss">
  @use "../../../../node_modules/@the_dissidents/svelte-ui/dist/uchu";

  :global([data-block]) {
    display: block;

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
  }
</style>
