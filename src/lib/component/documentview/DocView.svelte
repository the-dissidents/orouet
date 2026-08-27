<script lang="ts" module>
  export class PaneContext {
    selection?: Selection = $state();
    readonly role: 'source' | 'target';
    readonly dc: DocumentContext;

    opts?: TextOptions = $state();
    focused = $state(false);

    constructor(dc: DocumentContext, role: 'source' | 'target') {
      this.dc = dc;
      this.role = role;
    }
  }
</script>

<script lang="ts">
  import { Cluster, PaneSchema, type Doc } from "$lib/Schema";
  import { createNodeView } from "$lib/details/NodeView.svelte";
  import { Debug } from "$lib/details/Util";

  import { toggleMark, newlineInCode, selectAll, chainCommands, deleteSelection } from "prosemirror-commands";
  import { keymap } from "prosemirror-keymap";
  import { search } from "prosemirror-search";
  import { EditorState, Selection } from "prosemirror-state";
  import { EditorView } from "prosemirror-view";

  import { onMount, untrack } from "svelte";
  import BlockView from "./BlockView.svelte";
  import ClusterView from "./ClusterView.svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import { placeholder } from "./Placeholder";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { gotoNextBlockIfAtEnd, gotoPrevBlockIfAtStart, mergeBlockUpIfAtStart, mergeClusterUpIfAtStart, noop, redo, splitBlock, splitCluster, stopIfAcrossClusters, testCommand, undo } from "./Commands";
  import type { TextOptions } from "$lib/TextOptions";
  import { computeDiff, generateMarkers, linearize, type LinearizationOptions, type VisualMarker } from "$lib/details/Richdiff";
  import { diffPluginKey, diffVisualization } from "./Diffview";
  import { DebouncedTask } from "$lib/details/DebouncedTask";
  import { pasteHandler } from "./PasteHandler";

  import { _ } from "svelte-i18n";

  interface Props {
    role: 'source' | 'target',
    diffTarget?: Doc,
    dc: DocumentContext,
  }

  const { role, dc, diffTarget, ...rest }: Props & SvelteHTMLElements['div'] = $props();
  $effect(() => Debug.assert(dc[role].content.type == PaneSchema.topNodeType));

  let content: HTMLElement | undefined = $state();
  let editor: EditorView | undefined;

  const emphasis = toggleMark(PaneSchema.marks.emphasis);
  const keyword = toggleMark(PaneSchema.marks.keyword);

  const lang = $derived(dc[role].language);
  const opts = $derived(dc[role].options);
  const context = $derived(new PaneContext(dc, role));

  export function view() {
    return editor;
  }

  export function selection() {
    return context.selection;
  }

  export function focused() {
    return context.focused;
  }

  const me = {};

  const diffTask = new DebouncedTask(() => {
    if (!editor) return;

    let result: VisualMarker[] = [];
    if (diffTarget) {
      const opts: LinearizationOptions = { skipRootBoundary: true };
      const ops = computeDiff(
        linearize(diffTarget, opts), linearize(editor.state.doc, opts));
      result = generateMarkers(ops);
    }
    editor?.dispatch(editor.state.tr.setMeta(diffPluginKey, result));
  }, 500);

  $effect(() => {
    diffTarget;
    untrack(() => diffTask.request());
  });

  onMount(() => {
    dc.onTransform.bind(me, (_, ts) => {
      if (!ts[role]) return;

      Debug.assert(!!editor);
      const tr = editor.state.tr.setMeta('is_system', true);
      for (const step of ts[role].steps)
        tr.step(step);
      editor.dispatch(tr);
    });

    Debug.assert(!!content);
    editor = new EditorView(content, {
      state: EditorState.create({
        schema: PaneSchema,
        doc: dc[role].content,
        plugins: [
          keymap({
            "Enter": chainCommands(stopIfAcrossClusters, deleteSelection, splitBlock),
            "Shift-Enter": chainCommands(stopIfAcrossClusters, deleteSelection, newlineInCode),
            "Alt-Enter": role == 'source'
              ? chainCommands(deleteSelection, splitCluster)
              : noop,

            "Backspace": chainCommands(stopIfAcrossClusters, deleteSelection, mergeBlockUpIfAtStart),
            "Alt-Backspace": role == 'source'
              ? chainCommands(deleteSelection, mergeBlockUpIfAtStart, mergeClusterUpIfAtStart)
              : noop,

            "ArrowLeft": gotoPrevBlockIfAtStart,
            "ArrowRight": gotoNextBlockIfAtEnd,
            "Mod-e": testCommand,

            "Mod-a": selectAll,
            "Mod-z": undo(dc),
            "Mod-y": redo(dc),
            "Mod-i": emphasis,
            "Mod-b": keyword,
          }),
          placeholder(PaneSchema.nodes.block, () => $_('placeholderText')),
          pasteHandler(role),
          diffVisualization([]),
          search()
        ]
      }),
      dispatchTransaction(tr) {
        context.selection = tr.selection;
        const { $head: r } = context.selection;
        dc.currentCluster = Cluster.fromPos(r)?.attrs.id;

        if (tr.docChanged) {
          // this should be the only place that assigns to Text.content!
          dc[role].content = tr.doc as Doc;
          dc.onDocumentChanged.dispatch();
          if (!tr.getMeta('is_system'))
            dc.addTransform({ [role]: tr }, { internal: true });
        }

        const newState = editor!.state.apply(tr)
        editor!.updateState(newState);
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
    context.selection = editor.state.selection;
    context.focused = editor.hasFocus();
    context.opts = opts;
  })
</script>

<div class="container"
  lang={lang.filter((x) => !!x).join('-')}
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
  @use "@the_dissidents/svelte-ui/uchu";
  @use "../../../util.scss" as *;

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
        text-emphasis: "•";
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
      @include colors(background-color, pink, palevioletred);
    }

    font-size: 20px;

    .ProseMirror-search-match, .ProseMirror-active-search-match {
      border-radius: 2px;
      @include colors(--color, uchu.$red-3, uchu.$red-3);
      box-shadow: 0 0 0 1px var(--color);
    }
    .ProseMirror-active-search-match {
      @include colors(background-color, uchu.$pink-2, uchu.$red-7);
    }
  }
</style>
