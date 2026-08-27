<script lang="ts">
  import { Debug } from "$lib/details/Util";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { unbindEvents } from "@the_dissidents/svelte-ui";
  import { FeatherIcon, Heading1Icon, Heading2Icon, Heading3Icon, Heading4Icon, Heading5Icon, Heading6Icon, MegaphoneIcon, QuoteIcon, SpotlightIcon, TextAlignStartIcon } from "@lucide/svelte";
  import { Menu } from "@tauri-apps/api/menu";
  import { Cluster, ClusterKind, ClusterKindCategories, ClusterKinds } from "$lib/Schema";
  import { Transform } from "prosemirror-transform";
  import { _ } from "svelte-i18n";

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
      items: [
        ...ClusterKind.category('common').map((y) => ({
          text: $_(`clusterkind.${y}`),
          checked: kind == y,
          enabled: kind !== y,
          action: () => changeKindTo(y)
        })),
        { item: 'Separator' },
        ...ClusterKindCategories.filter((x) => x != 'common').map((x) => ({
          text: $_(`clusterkind.category.${x}`),
          items: ClusterKind.category(x).map((y) => ({
            text: $_(`clusterkind.${y}`),
            checked: kind == y,
            enabled: kind !== y,
            action: () => changeKindTo(y)
          }))
        }))
      ]
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
    {:else if kind == 'speaker'}
      <MegaphoneIcon />
    {:else if kind == 'stage-direction'}
      <SpotlightIcon />
    {:else if kind == 'poetry'}
      <FeatherIcon />
    {:else}
      {kind satisfies never}
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
