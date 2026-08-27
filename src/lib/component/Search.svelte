<script lang="ts">
  import { Memorized } from "$lib/details/Memorized.svelte";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { ButtonStrip, ConfigRow, ConfigTable, StripItem, StripRadioItem } from "@the_dissidents/svelte-ui";
  import { findNext, findPrev, replaceAll, replaceCurrent, replaceNext, SearchQuery, setSearchState } from "prosemirror-search";
  import * as z from 'zod/v4-mini';
  import Editor from "./documentview/Editor.svelte";
  import { m } from "$lib/paraglide/messages";
  import type { Transaction } from "prosemirror-state";

  interface Props {
    context: DocumentContext,
    editor?: Editor
  }

  const { context = $bindable(), editor }: Props = $props();

  let searchPattern = $state('');
  let replacement = $state('');
  let side: 'source' | 'target' = $state('source');

  let regexp = Memorized.$('search-use-regexp', z.boolean(), false);
  let caseSensitive = Memorized.$('search-cases', z.boolean(), false);

  let view = $derived(editor?.pane(side)?.view());
  let query = $derived(new SearchQuery({
    search: searchPattern,
    replace: replacement || undefined,
    caseSensitive: $caseSensitive,
    regexp: $regexp,
    literal: true,
  }));

  function setQuery() {
    if (!view) return;
    view.dispatch(setSearchState(view.state.tr, query));

    // clear search query on the other side
    const other = editor?.pane(side == 'source' ? 'target' : 'source')?.view();
    if (!other) return;
    other.dispatch(setSearchState(other.state.tr, new SearchQuery({ search: '' })));
  }

  function customDispatch(tr: Transaction) {
    if (!view) return;
    view.dispatch(tr);
    context.versionControl.addAttr({ label: '查找替换' });
  }
</script>

<ButtonStrip bind:selectValue={side} onValueChanged={() => setQuery()}>
  <StripRadioItem value='source'>{m.source()}</StripRadioItem>
  <StripRadioItem value='target'>{m.target()}</StripRadioItem>
</ButtonStrip>

<h5>查找与替换</h5>

<input type="text" placeholder="查找……" bind:value={searchPattern} onchange={setQuery} />
<input type="text" placeholder="替换为……" bind:value={replacement} onchange={setQuery} />

<ConfigTable>
  <ConfigRow name='查找'>
    <ButtonStrip>
      <StripItem disabled={!view || !query.valid}
        onclick={() => view ? findNext(view.state, customDispatch, view) : 0}
      >下一个</StripItem>
      <StripItem disabled={!view || !query.valid}
        onclick={() => view ? findPrev(view.state, customDispatch, view) : 0}
      >上一个</StripItem>
    </ButtonStrip>
  </ConfigRow>
  <ConfigRow name='替换'>
    <ButtonStrip>
      <StripItem disabled={!view || !query.valid}
        onclick={() => view ? replaceCurrent(view.state, customDispatch, view) : 0}
      >当前匹配项</StripItem>
      <StripItem disabled={!view || !query.valid}
        onclick={() => view ? replaceNext(view.state, customDispatch, view) : 0}
      >下一个</StripItem>
      <StripItem disabled={!view || !query.valid}
        onclick={() => view ? replaceAll(view.state, customDispatch, view) : 0}
      >所有</StripItem>
    </ButtonStrip>
  </ConfigRow>
</ConfigTable>

<h5>设置</h5>
<label>
  <input type='checkbox' bind:checked={$regexp} onchange={setQuery}>
  使用正则表达式
</label>

<label>
  <input type='checkbox' bind:checked={$caseSensitive} onchange={setQuery}>
  大小写敏感
</label>
