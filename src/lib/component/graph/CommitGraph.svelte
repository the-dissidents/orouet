<script lang="ts">
  import { formatAbsoluteDate, formatFullDate } from "$lib/details/DateFormat";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { graphLayout } from "./Layout";
  import type { Commit } from "$lib/VersionControl.svelte";
  import { Collapsible } from "@the_dissidents/svelte-ui";
  import BoundarySelect from "./BoundarySelect.svelte";
  import { Memorized } from "$lib/details/Memorized.svelte";
  import { BoundaryCondition } from "$lib/Boundary";
  import type { Id } from "$lib/Schema";

  const { context }: {
    context: DocumentContext
  } = $props();

  const boundary = Memorized.$('graph-boundary', BoundaryCondition, {
    delay: 500,
    fileSaved: true,
    focusedClusterChange: true,
    focusedBlockChange: true
  });

  let boundaryReactive = $state($boundary);
  const layout = $derived(graphLayout(context, boundaryReactive));

  const X_STEP = 12; // Lane width
  const Y_STEP = 30; // Row height
  const RADIUS = 5;
  const PADDING = 20;

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
    const midY = Math.max((startY + endY) / 2, startY - (endX - startX) / 2);
    return `M ${startX} ${startY} C ${endX} ${startY}, ${endX} ${midY}, ${endX} ${endY}`;
  }

  async function onClickRow(id: Id<Commit>, c?: Commit) {
    context.revertTo(id);

    // const label = c ? c.attrs.label : 'Initial commit';
    // const m = await Menu.new({items: [
    //   ...(label ? [{
    //     text: label,
    //     enabled: false
    //   }] : []),
    //   ...(c ? [{
    //     text: `时间：${formatFullDate(new Date(c.attrs.timestamp))}`,
    //     enabled: false
    //   }] : []),
    //   {
    //     item: 'Separator'
    //   },
    //   {
    //     text: `恢复到此刻`,
    //     enabled: id !== context.currentCommitId,
    //     action: () => context.revertTo(id)
    //   },
    // ]});
    // m.popup();
  }
</script>

<div class="graph-container">
  <svg height={svgHeight}>
    {#each layout.nodes as node (node.id)}
    {@const commit = context.versionControl.get(node.id)}
      <foreignObject width="100%" height={Y_STEP}
          x='0' y={(node.y-0.5) * Y_STEP + PADDING}>
        <button tabindex="0" onclick={() => onClickRow(node.id, commit)}>
          <span class="label" style:padding-left='{node.maxX * X_STEP + RADIUS + PADDING + 10}px'>
            <span class='hash'>
              {node.id.substring(0, 7)}
            </span>
            {#if commit}
              {formatAbsoluteDate(new Date(commit.attrs.timestamp))}
            {:else}
              Initial commit
            {/if}
          </span>
        </button>
      </foreignObject>
    {/each}

    {#each layout.edges as edge}
      <path class="edge"
        d={generatePath(edge.from.x, edge.from.y, edge.to.x, edge.to.y)} />
    {/each}

    {#each layout.nodes as node (node.id)}
      <circle class={{node: true, current: node.id == context.currentCommitId}} r={RADIUS}
        cx={node.x * X_STEP + PADDING}
        cy={node.y * Y_STEP + PADDING} />
    {/each}
  </svg>
</div>

<Collapsible header={'显示设置'}>
  <BoundarySelect bind:c={boundaryReactive} onChange={(b) => boundary.set(b)} />
</Collapsible>

<style lang="scss">
  .graph-container {
    overflow-x: auto;
    font-family: sans-serif;
    flex-grow: 1;
  }

  svg {
    width: 100%;
  }

  .edge {
    fill: none;
    stroke: var(--accent2-back-light);
    stroke-width: 2;

    @media (prefers-color-scheme: dark) {
      stroke: var(--accent2-back-dark);
    }
  }

  .node {
    fill: var(--accent2-back-light);
    stroke: white;
    stroke-width: 2;

    &.current {
      fill: white;
      stroke: var(--accent2-back-light);
    }

    @media (prefers-color-scheme: dark) {
      fill: var(--accent2-back-dark);
      stroke: var(--page-background-dark);;

      &.current {
        fill: var(--page-background-dark);
        stroke: var(--accent2-back-dark);
      }
    }
  }

  foreignObject > button {
    display: flex;
    flex-direction: row;
    align-items: center;

    background-color: transparent;
    box-shadow: none;
    outline: none;

    border-radius: 3px;
    width: 100%;
    height: 100%;

    &:hover {
      border: none;
      background-color: #0001;

      @media (prefers-color-scheme: dark) {
        background-color: #0003;
      }
    }
  }

  .label {
    font-size: var(--input-font-size);
    vertical-align: baseline;
  }

  .hash {
    font-family: monospace;
    color: gray;
  }
</style>
