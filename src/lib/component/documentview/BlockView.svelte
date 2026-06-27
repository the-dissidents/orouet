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

<NodeViewContent data-block
  style="text-align: {context.opts?.justify ? 'justify' : 'start'};"
  data-selected={selected} contentsOnly={false}>
</NodeViewContent>

<style lang="scss">
  @use "../../../../node_modules/@the_dissidents/svelte-ui/dist/uchu";
  @use "../../../util.scss" as *;

  $round: 4px;

  :global [data-block] {
    display: block;

    font-family: 'Text', 'Text-Chinese', 'Times New Roman', serif;
    font-weight: 400;
    text-autospace: normal;
    line-height: normal;

    background-color: transparent;
    outline: none !important;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 5px 10px;

    // &[data-selected=true] {
    //   border-color: var(--accent1-border-light);
    // }

    .diff.insert {
      display: inline-block;
      @include colors(color, uchu.$blue-9, uchu.$blue-2);

      &:hover {
        @include colors(background-color, uchu.$blue-1, uchu.$blue-9);
      }
    }

    .diff.delete {
      display: inline-block;
      @include colorvars(color, disabled-text);
      text-decoration: line-through;

      &:hover {
        @include colors(background-color, uchu.$gray-2, uchu.$gray-9);
      }
    }

    .diff.delete + .diff.insert {
      border-left: 0.75px solid;
      padding-left: 2px;
      @include colors(border-color, gray, gray);
    }

    .diff.delete:has(+ .diff.insert) {
      border-right: 0.75px solid;
      padding-right: 2px;
      @include colors(border-color, gray, gray);
    }

    .diff.update-marks {
      text-decoration: dashed underline darkgreen;
      @include colors(text-decoration-color, uchu.$green-9, uchu.$green-3);
      // text-decoration-thickness: 2px;
      text-underline-offset: 0.15em;
    }
  }

  :global [data-placeholder-text]::before {
    @include colorvars(color, disabled-text);
    padding: 9px 10px;
    line-height: normal;

    position: absolute;
    content: attr(data-placeholder-text);
    font-family: var(--ui-font-family);
    pointer-events: none;
  }
</style>
