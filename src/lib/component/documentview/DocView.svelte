<script lang="ts" module>
  export class PaneContext {
    selection?: Selection = $state();
    focused = $state(false);
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
  import { EditorState, Plugin, Selection } from "prosemirror-state";
  import { EditorView } from "prosemirror-view";
  import { onMount } from "svelte";
  import BlockView from "./BlockView.svelte";
  import ClusterView from "./ClusterView.svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { placeholder } from "./Placeholder";
  import type { TextOptions } from "$lib/DocumentContext.svelte";

  interface Props {
    doc: Node,
    opts: TextOptions
  }

  let { doc = $bindable(), opts, ...rest }: Props & SvelteHTMLElements['div'] = $props();
  $effect(() => Debug.assert(doc.type == PaneSchema.topNodeType));

  let content: HTMLElement | undefined = $state();
  let view: EditorView;

  const bold = toggleMark(PaneSchema.marks.bold);
  const italic = toggleMark(PaneSchema.marks.italic);
  const underline = toggleMark(PaneSchema.marks.underline);

  const context = new PaneContext();

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
          placeholder(PaneSchema.nodes.block),
        ]
      }),
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        if (tr.docChanged) doc = tr.doc;
        if (tr.selectionSet) context.selection = tr.selection;
        view.updateState(newState);
      },
      nodeViews: {
        cluster: createNodeView(ClusterView, { context }),
        block: createNodeView(BlockView, { context }),
      },
      handleDOMEvents: {
        focus: () => context.focused = true,
        blur: () => context.focused = false,
      }
    });
    context.selection = view.state.selection;
    context.focused = view.hasFocus();
  })
</script>

<div class="container" bind:this={content} {...rest}>
</div>

<style lang="scss">
  .container {
    display: contents;
  }

  :global .ProseMirror.ProseMirror.ProseMirror {
    outline: none;
    border: none;
    background-color: transparent;

    & ::selection {
      background-color: pink;

      @media (prefers-color-scheme: dark) {
        background-color: palevioletred;
      }
    }

    * {
      font-size: 20px;
    }
  }
</style>
