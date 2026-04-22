<script lang="ts">
  import { BlockSchema } from "$lib/BlockSchema";
  import type { TextBlock } from "$lib/Document.svelte";
  import { chainCommands, deleteSelection, joinBackward, selectNodeBackward, joinForward, selectNodeForward, newlineInCode, selectAll, toggleMark } from "prosemirror-commands";
  import { history, redo, undo } from "prosemirror-history";
  import { keymap } from "prosemirror-keymap";
  import { EditorState, Plugin, TextSelection, type Command } from "prosemirror-state";
  import { EditorView } from "prosemirror-view";
  import { onDestroy, onMount } from "svelte";
  import { placeholder } from "./Placeholder";
  import { virtualSelection } from "./VirtualSelection";
  import { EventHost } from "@the_dissidents/svelte-ui";
  import { Debug } from "$lib/details/Util";
  import { getDocumentViewContext } from "../documentview/DocumentView.svelte";
  import type { ViewSelection, SelectionPoint, DocumentViewContext } from "../documentview/ViewContext.svelte";

  interface Props {
    block: TextBlock,
    type: 'source' | 'target',
  }

  let { block, type }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView;

  export function editorView() {
    return view;
  }

  function selectionOverlaps(s: ViewSelection) {
    const a = s.from.block.index!;
    const b = s.to.block.index!;
    const x = block.index!;
    return Math.max(a, b) >= x && Math.min(a, b) <= x;
  }

  function updateSelection(s: ViewSelection) {
    Debug.assert(selectionOverlaps(s));
    const ix = block.index;

    function idx(sp: SelectionPoint) {
      const i = sp.block.index;
      Debug.assert(i !== undefined);
      Debug.assert(ix !== undefined);
      return i == ix ? sp.pos
           : i < ix ? 0
           : i > ix ? view.state.doc.textContent.length
           : -1 as never;
    }

    view.dispatch(view.state.tr.setSelection(
      TextSelection.create(view.state.doc, idx(s.from), idx(s.to))));
  }

  const userDeleteSelection: Command = () => {
    Debug.assert(!!context.selection);
    context.onDeleteSelection.dispatch(context.selection);
    return true;
  };

  const userBackspace: Command = (s, d, v) => {
    if (mySelection) {
      userDeleteSelection(s, d, v);
      return true;
    }
    joinBackward(s, d, v);
    selectNodeBackward(s, d, v);
    return true;
  }

  const bold = toggleMark(BlockSchema.marks.bold);
  const italic = toggleMark(BlockSchema.marks.italic);
  const underline = toggleMark(BlockSchema.marks.underline);
  const backspace = chainCommands(userDeleteSelection, joinBackward, selectNodeBackward);
  const del = chainCommands(deleteSelection, joinForward, selectNodeForward);

  let context: DocumentViewContext;
  let mySelection: ViewSelection | undefined = $state();

  let mouseDown = false;
  let manualSelection = false;
  let showSelection = $state(true);

  const me = {};

  onMount(() => {
    context = getDocumentViewContext(type);

    context.onSelectionChange.bind(me, (s) => {
      if (selectionOverlaps(s)) {
        showSelection = s.to.block.id !== block.id;

        if (s !== mySelection) {
          mySelection = s;
          updateSelection(s);
        }
      } else {
        showSelection = false;
        mySelection = undefined;
      }
    });

    context.onDeleteSelection.bind(me, (s) => {
      if (selectionOverlaps(s)) {
        const a = s.from.block.index!;
        const b = s.to.block.index!;
        const x = block.index!;
        if (Math.min(a, b) < x && Math.max(a, b) > x) {
          // delete whole block
        } else {
          deleteSelection(view.state, view.dispatch);
        }
      }
    });

    const trackSelection = new Plugin({
      appendTransaction(transactions) {
        const sel = transactions.findLast((x) => x.selectionSet)?.selection;
        if (!sel) return null;

        if (!manualSelection) {
          const s = $state({
            from: { block, pos: sel.from },
            to: { block, pos: sel.to },
            ongoing: mouseDown,
          });
          mySelection = s;
          context.selection = s;
          context.onSelectionChange.dispatch(s);
        }

        return null;
      },
      props: {
        handleDOMEvents: {
          "mousedown"() {
            mouseDown = true;
            manualSelection = false;
            document.addEventListener('mouseup', () => {
              mouseDown = false;
              if (mySelection) {
                mySelection.ongoing = false;
                manualSelection = false;
              }
            }, { once: true });
          },
          "mousemove"(_, ev) {
            const sel = context.selection;
            if (!sel || !sel.ongoing) return;

            const pos = view.posAtCoords({ left: ev.clientX, top: ev.clientY });
            if (pos === null) return;
            if (!view.hasFocus()) view.focus();

            const i1 = sel.from.block.index;
            const i2 = block.index;
            Debug.assert(i1 !== undefined && i2 !== undefined);

            if (i1 == i2) {
              showSelection = false;
              manualSelection = false;
              return;
            }

            showSelection = true;
            manualSelection = true;
            sel.to = { block, pos: pos.pos };
            mySelection = sel;
            context.onSelectionChange.dispatch(sel);
            updateSelection(sel);
          }
        }
      }
    })

    view = new EditorView(editorContainer, {
      state: EditorState.create({
        schema: BlockSchema,
        doc: block.content,

        plugins: [
          placeholder('enter text here'),
          virtualSelection,
          history(),
          keymap({
            "Shift-Enter": newlineInCode,
            "Backspace": backspace,
            "Mod-Backspace": backspace,
            "Shift-Backspace": backspace,
            "Delete": del,
            "Mod-Delete": del,
            "Mod-a": selectAll,

            "Mod-z": undo,
            "Mod-y": redo,
            "Mod-b": bold,
            "Mod-i": italic,
            "Mod-u": underline,
          }),
          trackSelection,
        ]
      }),
    });

    // if (context.selection && selectionOverlaps(context.selection)) {
    //   updateSelection(context.selection);
    // }
  });

  onDestroy(() => {
    EventHost.unbind(me);
  });
</script>

<div bind:this={editorContainer} class={{outer: true, showsel: showSelection}}>
</div>

<style>
  .outer {
    margin: 0 0 5px 0;
    /* padding: 10px;
    border-radius: 3px; */
  }

  :global(div.ProseMirror) {
    font-family: serif;
    font-size: 125%;

    outline: none !important;
    border: 1px solid transparent;
    background-color: transparent;

    transition: border 0.1s;

    /* hyphens: auto; */

    &:focus {
      background-color: #fff;
      border: 1px solid transparent;
    }

    &:hover {
      border: 1px solid var(--accent1-border-light);
    }

    & span.placeholder {
      pointer-events: none;
      font-family: var(--ui-font-family);
      color: gray;
    }

    & .virtual-selection::selection {
      background-color: rgb(255, 218, 224);
    }
  }

  .showsel :global(.virtual-selection) {
    background-color: rgb(255, 218, 224);
    height: 1lh;
  }
</style>
