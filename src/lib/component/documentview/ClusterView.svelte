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

  const { node }: Props = $props();
  $effect(() => Debug.assert(node.type == PaneSchema.nodes.cluster));
</script>

<div class="container">
  <NodeViewContent contentsOnly={false} data-cluster-kind={node.attrs.kind} />
</div>

<style lang='scss'>
  @use "@the_dissidents/svelte-ui/uchu";
  @use "../../../util.scss" as *;

  %heading {
    line-height: 1.25;
    margin-top: 0.5em;
    margin-bottom: 0.25em;
    page-break-after: avoid;
  }

  .container {
    position: relative;
    padding-block: 5px;
    border-bottom: 1px dashed;
    @include colors(border-color, #ccc, #555);
  }

  :global [data-cluster-kind] {
    &[data-cluster-kind="h1"] [data-block] {
      @extend %heading;
      font-weight: 600;
      font-size: 200%;
      letter-spacing: -0.015em;
      text-align: center !important;
    }

    &[data-cluster-kind="h2"] [data-block] {
      @extend %heading;
      font-weight: 600;
      font-size: 162.5%;
    }

    &[data-cluster-kind="h3"] [data-block] {
      @extend %heading;
      font-weight: 600;
      font-size: 137.5%;
    }

    &[data-cluster-kind="h4"] [data-block] {
      @extend %heading;
      font-weight: 600;
      font-size: 112.5%;
      text-align: center !important;
    }

    &[data-cluster-kind="h5"] [data-block] {
      @extend %heading;
      font-weight: 600;
      font-size: 100%;
      letter-spacing: 0.06em;
    }

    &[data-cluster-kind="h6"] [data-block] {
      @extend %heading;
      font-size: 87.5%;
      font-family: sans-serif;
      letter-spacing: 0.06em;
      font-weight: 500;
    }

    &[data-cluster-kind="blockquote"] {
      font-size: 95%;
      border-radius: 5px;
      margin-inline: 1em;
    }

    &[data-cluster-kind="speaker"] [data-block] {
      font-variant: small-caps;
      padding-left: 0;
      // margin-left: -0.5em;
    }

    &[data-cluster-kind="stage-direction"] [data-block] {
      font-style: italic;
      opacity: 0.8;
      padding-block: 2px;
    }

    &[data-cluster-kind="poetry"] {
      margin-left: 1em;
      text-indent: 2em hanging each-line
    }
  }
</style>
