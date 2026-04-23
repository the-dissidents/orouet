<script lang="ts" module>
  export class PaneContext {

  }
</script>

<script lang="ts">
  import { PaneSchema } from "$lib/Schema";
  import { createNodeView } from "$lib/details/NodeView.svelte";
  import { Debug } from "$lib/details/Util";
  import { toggleMark, newlineInCode, selectAll } from "prosemirror-commands";
  import { undo, redo, history } from "prosemirror-history";
  import { keymap } from "prosemirror-keymap";
  import type { Node } from "prosemirror-model";
  import { EditorState, Plugin } from "prosemirror-state";
  import { EditorView } from "prosemirror-view";
  import { onMount } from "svelte";
  import BlockView from "./BlockView.svelte";
  import ClusterView from "./ClusterView.svelte";
  import type { SvelteHTMLElements } from "svelte/elements";

  interface Props {
    doc: Node
  }

  let { doc = $bindable(), ...rest }: Props & SvelteHTMLElements['div'] = $props();
  $effect(() => Debug.assert(doc.type == PaneSchema.topNodeType));

  let content: HTMLElement | undefined = $state();
  let view: EditorView;

  const bold = toggleMark(PaneSchema.marks.bold);
  const italic = toggleMark(PaneSchema.marks.italic);
  const underline = toggleMark(PaneSchema.marks.underline);

  onMount(() => {
    Debug.assert(!!content);
    view = new EditorView(content, {
      state: EditorState.create({
        schema: PaneSchema, doc,
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
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        if (tr.docChanged) doc = tr.doc;
        view.updateState(newState)
      },
      nodeViews: {
        cluster: createNodeView(ClusterView, {}),
        block: createNodeView(BlockView, {}),
      }
    });
  })
</script>

<div class="container" bind:this={content} {...rest}>
</div>

<style lang="scss">
  .container {
    display: contents;
  }

  :global .ProseMirror {
    display: contents;

    * {
      font-size: 20px;
    }
  }

  :global(.ProseMirror-trailingBreak) {
    // display: none;
  }
</style>
