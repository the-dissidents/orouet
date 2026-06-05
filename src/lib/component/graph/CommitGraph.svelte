<script lang="ts">
  import { formatAbsoluteDate } from "$lib/details/DateFormat";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { EllipsisIcon } from "@lucide/svelte";
  import { graphLayout } from "./Layout";

  const { context }: {
    context: DocumentContext
  } = $props();

  const layout = $derived(graphLayout(context.versionControl));
  const currentIndex = $derived(layout.nodes.findIndex((x) => x.id == context.currentCommitId));

  const X_STEP = 30; // Lane width
  const Y_STEP = 30; // Row height
  const RADIUS = 6;
  const PADDING = 20;

  let svgWidth = $derived(Math.max(0, ...layout.nodes.map(n => n.x)) * X_STEP + PADDING * 2);
  let svgHeight = $derived(layout.nodes.length * Y_STEP + PADDING * 2);

  function generatePath(x1: number, y1: number, x2: number, y2: number): string {
    const startX = x1 * X_STEP + PADDING;
    const startY = y1 * Y_STEP + PADDING;
    const endX = x2 * X_STEP + PADDING;
    const endY = y2 * Y_STEP + PADDING;

    if (startX === endX) {
        return `M ${startX} ${startY} L ${endX} ${endY}`;
    }

    // Add a smooth curve when jumping lanes
    const midY = (startY + endY) / 2;
    return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
  }
</script>

<div class="graph-container">
  <svg height={svgHeight}>
    {#each layout.edges as edge}
      <path class="edge"
        d={generatePath(edge.from.x, edge.from.y, edge.to.x, edge.to.y)} />
    {/each}

    {#each layout.nodes as node, i (node.id)}
    {@const commit = context.versionControl.get(node.id)}
      <g transform="translate({node.x * X_STEP + PADDING}, {node.y * Y_STEP + PADDING})">
        <circle class={{node: true, current: i == currentIndex}} r={RADIUS} />
        <foreignObject x={node.x * X_STEP + PADDING} y={-Y_STEP / 2} width="100%" height={Y_STEP}>
          <div xmlns="http://w3.org">
            <span class="label">
              <span class='hash'>
                {node.id.substring(0, 7)}
              </span>
              {#if commit}
                {formatAbsoluteDate(new Date(commit.attrs.timestamp))}
              {:else}
                Initial commit
              {/if}
            </span>
          </div>
        </foreignObject>
      </g>

      <rect class="line" y={node.y * Y_STEP} width='100%' height={Y_STEP}/>
    {/each}
  </svg>
</div>

<style lang="scss">
  .graph-container {
    overflow-x: auto;
    font-family: sans-serif;
  }

  svg {
    width: 100%;
  }

  .edge {
    fill: none;
    stroke: #64748b;
    stroke-width: 2;
  }

  .node {
    fill: #3b82f6;
    stroke: #ffffff;
    stroke-width: 2;

    &.current {
      stroke: #115468;
    }
  }

  .line {
    fill: none;
    &:hover {
      fill: gainsboro;
    }
  }

  foreignObject div {
    display: flex;
    flex-direction: row;
    height: 100%;
  }

  .label {
    font-size: var(--input-font-size);
    fill: #0f172a;
    vertical-align: baseline;
  }

  .hash {
    font-family: monospace;
    fill: gray;
  }
</style>
