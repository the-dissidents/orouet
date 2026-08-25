<script lang="ts">
  import { Debug } from "$lib/details/Util";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { unbindEvents } from "@the_dissidents/svelte-ui";
  import { Heading1Icon, Heading2Icon, Heading3Icon, Heading4Icon, Heading5Icon, Heading6Icon, QuoteIcon, TextAlignStartIcon } from "@lucide/svelte";
  import { Menu } from "@tauri-apps/api/menu";
  import { Cluster, ClusterKinds, type ClusterKind } from "$lib/Schema";
  import { Transform } from "prosemirror-transform";

  interface Props {
    dc: DocumentContext,
    index: number
  }

  const { dc, index }: Props = $props();
  const me = {};

  let updateCounter = $state(0);
  $effect(() => {
    dc.onDocumentChanged.bind(me, () => { updateCounter++ });
    return () => unbindEvents(me);
  });

  function getKind() {
    const c = dc.source.content.maybeChild(index);
    Debug.assert(!!c);
    return c.attrs.kind;
  }

  function changeKindTo(kind: ClusterKind) {
    const [_1, pos1] = Cluster.findByIndex(dc.source.content, index)!;
    const [_2, pos2] = Cluster.findByIndex(dc.target.content, index)!;
    const source = new Transform(dc.source.content).setNodeAttribute(pos1, "kind", kind);
    const target = new Transform(dc.target.content).setNodeAttribute(pos2, "kind", kind);
    dc.addTransform({ source, target });
  }
</script>

{#key updateCounter}
{@const kind = getKind()}
  <button onclick={async () => {
    (await Menu.new({
      items: ClusterKinds.map((x) => ({
        text: x,
        checked: kind == x,
        action: () => kind !== x ? changeKindTo(x) : undefined
      }))
    })).popup();
  }}>
    {#if kind == 'h1'}
      <Heading1Icon />
    {:else if kind == 'h2'}
      <Heading2Icon />
    {:else if kind == 'h3'}
      <Heading3Icon />
    {:else if kind == 'h4'}
      <Heading4Icon />
    {:else if kind == 'h5'}
      <Heading5Icon />
    {:else if kind == 'h6'}
      <Heading6Icon />
    {:else if kind == 'blockquote'}
      <QuoteIcon />
    {:else if kind == 'text'}
      <TextAlignStartIcon />
    {/if}
  </button>
{/key}

<style lang="scss">
  @use "@the_dissidents/svelte-ui/uchu.scss";
  @use "../../../util.scss" as *;

  button {
    background-color: transparent;
    box-shadow: none;

    &:hover {
      @include colors(background-color, uchu.$gray-1, uchu.$yin-8);
    }
  }
</style>
