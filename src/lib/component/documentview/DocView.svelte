<script lang="ts">
  import { DocumentSchema } from "$lib/Schema";
  import { createNodeView } from "$lib/details/NodeView.svelte";
  import { Debug } from "$lib/details/Util";
  import { Resizer } from "@the_dissidents/svelte-ui";
  import { toggleMark, newlineInCode, selectAll } from "prosemirror-commands";
  import { undo, redo, history } from "prosemirror-history";
  import { keymap } from "prosemirror-keymap";
  import type { Node } from "prosemirror-model";
  import { EditorState } from "prosemirror-state";
  import { EditorView } from "prosemirror-view";
  import { onMount } from "svelte";
  import BlockView from "./BlockView.svelte";
  import ClusterView from "./ClusterView.svelte";

  interface Props {
    doc: Node
  }

  let { doc = $bindable() }: Props = $props();
  $effect(() => Debug.assert(doc.type == DocumentSchema.topNodeType));

  let leftPane: HTMLElement | undefined = $state();
  let content: HTMLElement | undefined = $state();
  let view: EditorView;

  const bold = toggleMark(DocumentSchema.marks.bold);
  const italic = toggleMark(DocumentSchema.marks.italic);
  const underline = toggleMark(DocumentSchema.marks.underline);

  onMount(() => {
    Debug.assert(!!content);
    view = new EditorView(content, {
      state: EditorState.create({
        schema: DocumentSchema, doc,
        plugins: [
          history(),
          keymap({
            "Shift-Enter": newlineInCode,
            "Mod-a": selectAll,
            "Mod-z": undo,
            "Mod-y": redo,
            "Mod-b": bold,
            "Mod-i": italic,
            "Mod-u": underline,
          }),
        ]
      }),
      nodeViews: {
        cluster: createNodeView(ClusterView, {}),
        block: createNodeView(BlockView, {}),
      }
    });
  })
</script>

<div class="container" bind:this={content}>
  <div class="dummy-header">
    <div class="resize-dummy" bind:this={leftPane} style:width="33vw">
    </div>
  </div>

  <div class="resizer">
    <Resizer first={leftPane} vertical useViewportFraction/>
  </div>
</div>

<style lang="scss">
  .container {
    display: grid;
    /* Left Pane | Resizer | Right Pane */
    grid-template-columns: auto min-content min-content 1fr;
    grid-auto-rows: min-content;
    overflow-y: auto;

    flex-grow: 1;
    white-space: pre-wrap;
  }

  .dummy-header {
    display: grid;
    grid-column: 1 / -1;
    grid-row: 1;
    grid-template-columns: subgrid;
  }

  .resize-dummy {
    grid-column: 2;
    height: 1em;
  }

  :global .ProseMirror {
    display: contents;

    * {
      font-size: 20px;
    }
  }

  :global(.ProseMirror-trailingBreak) {
    display: none;
  }

  .resizer {
    grid-column: 3;
    grid-row: 1 / 10;
    cursor: col-resize;
    z-index: 10;
  }
</style>
