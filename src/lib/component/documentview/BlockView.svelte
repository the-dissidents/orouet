<script lang="ts">
  import { PaneSchema } from "$lib/Schema";
  import type { NodeViewProps } from "$lib/details/NodeView.svelte";
  import NodeViewContent from "$lib/details/NodeViewContent.svelte";
  import { Debug } from "$lib/details/Util";
  import type { PaneContext } from "./DocView.svelte";

  interface Props extends NodeViewProps {
    context: PaneContext;
  }

  const { node, context, getPos }: Props = $props();
  $effect(() => Debug.assert(node.type == PaneSchema.nodes.block));

  let selected = $derived.by(() => {
    if (!context.selection || !context.focused) return false;
    const pos = getPos();
    if (!pos) return false;
    return context.selection.from <= pos + node.nodeSize && context.selection.to >= pos;
  });
</script>

<NodeViewContent data-block data-selected={selected} contentsOnly={false}>
</NodeViewContent>

<style lang="scss">
  @use "../../../../node_modules/@the_dissidents/svelte-ui/dist/uchu";

  :global [data-block] {
    position: relative;
    display: block;

    font-family: 'Text', 'Text-Chinese', 'Times New Roman', serif;
    font-weight: 400;
    font-variant-numeric: lining-nums;
    text-autospace: normal;
    text-align: justify;

    line-height: normal;

    background-color: transparent;
    outline: none !important;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 5px 10px;

    &[data-selected=true] {
      border-color: var(--accent1-border-light);
    }

    u {
      text-decoration-thickness: 1.5px;
      text-underline-offset: 0.2em;
    }
  }

  :global .placeholder [data-block]::before {
    position: absolute;
    content: 'enter text here';
    color: gray;
    font-family: var(--ui-font-family);
  }
</style>
