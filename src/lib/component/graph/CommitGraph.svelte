<script lang="ts" module>
  const boundary = Memorized.$('graph-boundary', BoundaryCondition, {
    delay: 500,
    fileSaved: true,
    focusedClusterChange: true,
  });
</script>

<script lang="ts">
  import { formatAbsoluteDate, formatFullDate } from "$lib/details/DateFormat";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { graphLayout, type EdgeType } from "./Layout";
  import type { Commit } from "$lib/VersionControl.svelte";
  import { Collapsible } from "@the_dissidents/svelte-ui";
  import BoundarySelect from "./BoundarySelect.svelte";
  import { Memorized } from "$lib/details/Memorized.svelte";
  import { BoundaryCondition } from "$lib/Boundary";
  import type { Id } from "$lib/Schema";
  import { Menu } from "@tauri-apps/api/menu";

  const { context }: {
    context: DocumentContext
  } = $props();

  let boundaryReactive = $state($boundary);
  boundary.subscribe((v) => boundaryReactive = v);

  const layout = $derived(graphLayout(context, boundaryReactive));

  const X_STEP = 12; // Lane width
  const Y_STEP = 30; // Row height
  const RADIUS = 5;
  const PADDING = 20;

  let svgHeight = $derived(layout.nodes.length * Y_STEP + PADDING * 2);

  function generatePath(type: EdgeType, x1: number, y1: number, x2: number, y2: number): string {
    const startX = x1 * X_STEP + PADDING;
    const startY = y1 * Y_STEP + PADDING;
    const endX = x2 * X_STEP + PADDING;
    const endY = y2 * Y_STEP + PADDING;

    if (type == 'children') {
      if (startX === endX)
          return `M ${startX} ${startY} L ${endX} ${endY}`;

      // Add a smooth curve when jumping lanes
      const midY = Math.max((startY + endY) / 2, startY - (endX - startX) / 2);
      return `M ${startX} ${startY} C ${endX} ${startY}, ${endX} ${midY}, ${endX} ${endY}`;
    } else {
      return `M ${startX} ${startY} H ${3} V ${endY} H ${endX - RADIUS}`;
    }
  }

  async function onClickRow(id: Id<Commit>, c?: Commit) {
    const label = c ? c.attrs.label : '初始状态';
    const m = await Menu.new({items: [
      ...(label ? [{
        text: label,
        enabled: false
      }] : []),
      ...(c ? [{
        text: `时间：${formatFullDate(new Date(c.attrs.timestamp))}`,
        enabled: false
      }] : []),
      {
        item: 'Separator'
      },
      {
        text: `恢复到此刻`,
        enabled: id !== context.currentCommitId,
        action: () => context.revertTo(id)
      },
      {
        text: `进行比对`,
        enabled: id !== context.currentCommitId,
        action: () => context.currentDiffCommit = id
      },
    ]});
    m.popup();
  }
</script>

<div class="graph-container">
  <svg height={svgHeight}>
    <defs>
      <!-- A marker to be used as an arrowhead -->
      <marker
        id="arrow"
        class="arrow"
        viewBox="0 0 6 10"
        refX="6"
        refY="5"
        markerWidth="5"
        markerHeight="5"
        orient="auto">
        <path d="M 0 0 L 6 5 L 0 10" fill="none" />
      </marker>
  </defs>

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
              {#if commit.attrs.fileSaved}
                <span class="remarks">文件保存</span>
              {/if}
            {:else}
              初始状态
            {/if}
          </span>
        </button>
      </foreignObject>
    {/each}

    {#each layout.edges as edge}
      <path class="edge {edge.type}"
        d={generatePath(edge.type, edge.from.x, edge.from.y, edge.to.x, edge.to.y)} />
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
  @use "../../../../node_modules/@the_dissidents/svelte-ui/dist/uchu";
  @use '../../../util.scss' as *;

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
    stroke-linejoin: round;
  }

  .children {
    stroke-width: 2;
    @include colorvars(stroke, accent2-back);
  }

  .merging {
    stroke-width: 1.5;
    @include colors(stroke, uchu.$blue-3, uchu.$blue-4);
    marker-end: url(#arrow);
  }

  .arrow {
    stroke-width: 2;
    @include colors(stroke, uchu.$blue-3, uchu.$blue-4);
  }

  .node {
    stroke-width: 2;

    @include colorvars(fill, accent2-back);
    @include colorvars(stroke, page-background);

    &.current {
      @include colorvars(fill, page-background);
      @include colorvars(stroke, accent2-back);
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
      @include colors(background-color, #0001, #0003);
    }
  }

  .label {
    font-size: var(--input-font-size);
    vertical-align: baseline;
  }

  .hash {
    font-family: monospace;
    @include colorvars(color, disabled-text);
  }

  .remarks {
    @include colorvars(color, disabled-text);
  }
</style>
