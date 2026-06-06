<script lang="ts" module>
  export class PaneContext {
    selection?: Selection = $state();
    opts?: TextOptions = $state();
    focused = $state(false);
  }
</script>

<script lang="ts">
  import { PaneSchema, type Doc } from "$lib/Schema";
  import { createNodeView } from "$lib/details/NodeView.svelte";
  import { Debug } from "$lib/details/Util";
  import { toggleMark, newlineInCode, selectAll, chainCommands, deleteSelection } from "prosemirror-commands";
  import { keymap } from "prosemirror-keymap";
  import { EditorState, Selection } from "prosemirror-state";
  import { EditorView } from "prosemirror-view";
  import { onMount } from "svelte";
  import BlockView from "./BlockView.svelte";
  import ClusterView from "./ClusterView.svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { placeholder } from "./Placeholder";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import { gotoNextBlockIfAtEnd, gotoPrevBlockIfAtStart, mergeBlockUpIfAtStart, pasteHandler, splitBlock, testCommand } from "./Commands";
  import type { TextOptions } from "$lib/TextOptions";

  interface Props {
    role: 'source' | 'target',
    dc: DocumentContext,
  }

  let { role, dc, ...rest }: Props & SvelteHTMLElements['div'] = $props();
  $effect(() => Debug.assert(dc[role].content.type == PaneSchema.topNodeType));

  let content: HTMLElement | undefined = $state();
  let view: EditorView;

  const emphasis = toggleMark(PaneSchema.marks.emphasis);
  const keyword = toggleMark(PaneSchema.marks.keyword);

  const opts = $derived(dc[role].options);
  const context = new PaneContext();

  const me = {};

  onMount(() => {
    dc.onRevert.bind(me, (_, ts) => {
      const tr = view.state.tr.setMeta('is_revert', true);
      for (const step of ts[role].steps)
        tr.step(step);
      view.dispatch(tr);
    });

    Debug.assert(!!content);
    view = new EditorView(content, {
      state: EditorState.create({
        schema: PaneSchema,
        doc: dc[role].content,
        plugins: [
          keymap({
            "Enter": chainCommands(deleteSelection, gotoNextBlockIfAtEnd),
            "Control-Enter": chainCommands(deleteSelection, splitBlock),
            "Control-Backspace": chainCommands(deleteSelection, mergeBlockUpIfAtStart),
            "Shift-Enter": newlineInCode,

            "ArrowLeft": gotoPrevBlockIfAtStart,
            "ArrowRight": gotoNextBlockIfAtEnd,
            "Mod-e": testCommand,

            "Mod-a": selectAll,
            // "Mod-z": undo,
            // "Mod-y": redo,
            "Mod-i": emphasis,
            "Mod-b": keyword,
          }),
          placeholder(PaneSchema.nodes.block, m.placeholderText),
          pasteHandler,
        ]
      }),
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        if (tr.docChanged) {
          dc[role].content = tr.doc as Doc;
          if (!tr.getMeta('is_revert'))
            dc.addTransform(role, tr);
        }
        context.selection = tr.selection;
        view.updateState(newState);
      },
      nodeViews: {
        cluster: createNodeView(ClusterView, { context }),
        block: createNodeView(BlockView, { context }),
      },
      handleDOMEvents: {
        focus: () => context.focused = true,
        blur: () => context.focused = false,
      },
    });
    context.selection = view.state.selection;
    context.focused = view.hasFocus();
    context.opts = opts;
  })
</script>

<div class="container"
  style="
    font-variant-numeric: {opts.numericStyle}-nums;
    font-variant-ligatures:
      {opts.ligatures.common ? '' : 'no-'}common-ligatures
      {opts.ligatures.contextual ? '' : 'no-'}contextual
      {opts.ligatures.discretionary ? '' : 'no-'}discretionary-ligatures
      {opts.ligatures.historical ? '' : 'no-'}historical-ligatures;
    hyphens: {opts.hyphenation ? 'auto' : 'manual'};
  "
  data-em={opts.emphasisStyle}
  data-strong={opts.keywordStyle}
  bind:this={content} {...rest}>
</div>

<style lang="scss">
  @mixin emphasisStyle($attr, $tag) {
    #{$tag} {
      font-style: normal;
      font-weight: normal;
    }

    &[#{$attr}=italic] {
      #{$tag} { font-style: italic; }
    }
    &[#{$attr}=bold] {
      #{$tag} { font-weight: bold; }
    }
    &[#{$attr}=smallcaps] {
      #{$tag} { font-variant: small-caps; }
    }
    &[#{$attr}=underline] {
      #{$tag} {
        text-decoration: underline;
        text-decoration-thickness: 1.5px;
        text-underline-offset: 0.2em;
      }
    }
    &[#{$attr}=mark] {
      #{$tag} {
        text-emphasis: filled dot;
        text-emphasis-position: under;
      }
    }
    &[#{$attr}=gesperrt] {
      #{$tag} {
        letter-spacing: 0.3em;
        padding-left: 0.3em;
      }
    }
  }

  .container {
    display: contents;

    :global {
      @include emphasisStyle(data-em, em);
      @include emphasisStyle(data-strong, strong);
    }
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
