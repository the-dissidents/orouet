<script lang="ts">
  import { BlockSchema } from "$lib/BlockSchema";
  import type { TextBlock } from "$lib/Document.svelte";
  import { deleteSelection, joinBackward, selectNodeBackward, newlineInCode, selectAll, toggleMark } from "prosemirror-commands";
  import { history, redo, undo } from "prosemirror-history";
  import { keymap } from "prosemirror-keymap";
  import { EditorState, Plugin, TextSelection, type Command } from "prosemirror-state";
  import { EditorView } from "prosemirror-view";
  import { onMount, untrack } from "svelte";
  import { placeholder } from "./Placeholder";
  import { virtualSelection } from "./VirtualSelection";
  import { EventHost } from "@the_dissidents/svelte-ui";
  import { Debug } from "$lib/details/Util";
  import { getDocumentViewContext } from "../documentview/DocumentView.svelte";
  import type { ViewSelection, SelectionPoint, DocumentViewContext } from "../documentview/ViewContext.svelte";
  import { Slice } from "prosemirror-model";

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

    const selection = TextSelection.create(view.state.doc, idx(s.from), idx(s.to));
    if (!view.state.selection.eq(selection))
      view.dispatch(view.state.tr.setSelection(selection));
  }

  const userDeleteSelection: Command = (s, d, v) => {-
    Debug.assert(!!currentSelection);
    const from = currentSelection!.from;
    const to = currentSelection!.to;

    if (from.block.id == to.block.id) {
      return deleteSelection(s, d, v);
    }

    const [a, b] = from.block.index! < to.block.index! ? [from, to] : [to, from];
    a.block.content =
      a.block.content.replace(a.pos, a.block.content.textContent.length, Slice.empty);
    b.block.content =
      b.block.content.replace(0, b.pos, Slice.empty);

    let current = context.document.previousBlock(b.block, type);
    while (current && current.id !== a.block.id) {
      context.document.removeBlock(current, type);
      current = context.document.previousBlock(current, type);
    }

    return true;
  };

  const userBackspace: Command = (s, d, v) => {
    if (currentSelection) {
      userDeleteSelection(s, d, v);
      return true;
    }
    joinBackward(s, d, v);
    selectNodeBackward(s, d, v);
    return true;
  };

  type Direction = 'up' | 'down' | 'left' | 'right';

  const userMoveCursor: (d: Direction) => Command = (d) => () => {
    if (!currentSelection
      || currentSelection.from.block.id !== currentSelection.to.block.id
      || currentSelection.from.pos !== currentSelection.to.pos
      || !view.endOfTextblock(d)
    ) return false;

    console.log('111');

    // move to previous block
    const side = (d == 'left' || d == 'up') ? 'end' : 'start';
    const to = side == 'end'
      ? context.document.previousBlock(block, type)
      : context.document.nextBlock(block, type);
    if (!to) return false;

    const h = (d == 'up' || d == 'down')
      ? view.coordsAtPos(currentSelection.from.pos).left
      : undefined;
    currentSelection = undefined;
    context.onCursorMoveAcrossBoundary.dispatch(to, side, h);
    return true;
  };

  const bold = toggleMark(BlockSchema.marks.bold);
  const italic = toggleMark(BlockSchema.marks.italic);
  const underline = toggleMark(BlockSchema.marks.underline);

  let context: DocumentViewContext;
  let currentSelection: ViewSelection | undefined = $state();

  let mouseDown = false;
  let manualSelection = false, passivelyUpdatedSelection = false;
  let showSelection = $state(true);

  const me = {};

  $effect(() => {
    block.content;

    untrack(() => {
      console.log(block.id, block.content);
      if (view)
        view.dispatch(view.state.tr
          .replaceWith(0, view.state.doc.content.size, block.content.content));
    });
  })

  onMount(() => {
    context = getDocumentViewContext(type);

    context.onSelectionChange.bind(me, (s) => {
      if (selectionOverlaps(s)) {
        currentSelection = s;
        if (s.to.block.id != block.id)
          showSelection = true;

        passivelyUpdatedSelection = true;
        updateSelection(s);
        passivelyUpdatedSelection = false;
      } else {
        showSelection = false;
        currentSelection = undefined;
      }
    });

    // context.onDeleteSelection.bind(me, (s) => {
    //   if (selectionOverlaps(s)) {
    //     const a = s.from.block.index!;
    //     const b = s.to.block.index!;
    //     const x = block.index!;
    //     if (Math.min(a, b) < x && Math.max(a, b) > x) {
    //       // delete whole block
    //       context.document.removeBlock(block, type);
    //     } else {
    //       deleteSelection(view.state, view.dispatch);
    //     }
    //   }
    // });

    context.onCursorMoveAcrossBoundary.bind(me, (to, side, h) => {
      if (to.id !== block.id) return;
      view.focus();

      const rect = view.dom.getBoundingClientRect();
      let pos: number;
      if (h !== undefined) {
        if (side == 'start') {
          const result = view.posAtCoords({ left: h, top: rect.top + 25 });
          Debug.assert(!!result);
          pos = result.pos;
        } else {
          const result = view.posAtCoords({ left: h, top: rect.bottom - 25 });
          Debug.assert(!!result);
          pos = result.pos;
        }
      } else {
        pos = side == 'start' ? 0 : block.content.textContent.length;
      }

      context.selection = {
        from: { block, pos },
        to: { block, pos },
        ongoing: false
      };
      currentSelection = context.selection;
      context.onSelectionChange.dispatch(context.selection);
    });

    const trackSelection = new Plugin({
      appendTransaction(transactions) {
        const sel = transactions.findLast((x) => x.selectionSet)?.selection;
        if (!sel) return null;

        if (!manualSelection && !passivelyUpdatedSelection) {
          const s = $state({
            from: { block, pos: sel.anchor },
            to: { block, pos: sel.head },
            ongoing: mouseDown,
          });
          currentSelection = s;
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
              if (currentSelection) {
                currentSelection.ongoing = false;
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
            currentSelection = sel;

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
            "ArrowLeft": userMoveCursor('left'),
            "ArrowRight": userMoveCursor('right'),
            "ArrowUp": userMoveCursor('up'),
            "ArrowDown": userMoveCursor('down'),

            "Shift-Enter": newlineInCode,
            "Backspace": userBackspace,
            // "Mod-Backspace": userBackspace,
            // "Shift-Backspace": userBackspace,
            // "Delete": del,
            // "Mod-Delete": del,
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

    return () => EventHost.unbind(me);
  });
</script>

<div bind:this={editorContainer} class={{outer: true, showsel: showSelection}}>
</div>

<style lang='scss'>
  @use "../../../../node_modules/@the_dissidents/svelte-ui/dist/uchu";

  .outer {
    margin: 0 0 5px 0;
    /* padding: 10px;
    border-radius: 3px; */
  }

  :global div.ProseMirror {
    font-family: serif;
    font-size: 125%;

    outline: none !important;
    border: 1px solid transparent;
    background-color: transparent;

    transition: border 0.1s;

    /* hyphens: auto; */

    &:focus {
      background-color: #fff;

      @media (prefers-color-scheme: dark) {
        background-color: uchu.$yin-8;
      }
    }

    &:hover, &:focus {
      border: 1px solid var(--accent1-border-light);
    }

    & span.placeholder {
      pointer-events: none;
      font-family: var(--ui-font-family);
      color: gray;
    }

    & .virtual-selection::selection {
      background-color: rgb(255, 218, 224);

      @media (prefers-color-scheme: dark) {
        background-color: rgb(93, 43, 51);
      }
    }
  }

  .showsel :global(.virtual-selection) {
    background-color: rgb(255, 218, 224);
    height: 1lh;

    @media (prefers-color-scheme: dark) {
      background-color: rgb(93, 43, 51);
    }
  }
</style>
