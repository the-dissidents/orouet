<script lang="ts">
  import { Memorized } from "$lib/details/Memorized.svelte";
  import type { DocumentContext } from "$lib/DocumentContext.svelte";
  import { ButtonStrip, ConfigRow, ConfigTable, StripItem, StripRadioItem } from "@the_dissidents/svelte-ui";
  import { findNext, findPrev, replaceAll, replaceCurrent, replaceNext, SearchQuery, setSearchState } from "prosemirror-search";
  import * as z from 'zod/v4-mini';
  import Editor from "./documentview/Editor.svelte";
  import { _ } from "svelte-i18n";
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
    context.versionControl.addAttr({ label: $_('search.find-and-replace') });
  }
</script>

<ButtonStrip bind:selectValue={side} onValueChanged={() => setQuery()}>
  <StripRadioItem value='source'>{$_('source')}</StripRadioItem>
  <StripRadioItem value='target'>{$_('target')}</StripRadioItem>
</ButtonStrip>

<h5>{$_('search.heading')}</h5>

<input type="text" placeholder={$_('search.term-placeholder')} bind:value={searchPattern} onchange={setQuery} />
<input type="text" placeholder={$_('search.replacement-placeholder')} bind:value={replacement} onchange={setQuery} />

<ConfigTable>
  <ConfigRow name={$_('search.find')}>
    <ButtonStrip>
      <StripItem disabled={!view || !query.valid}
        onclick={() => view ? findNext(view.state, customDispatch, view) : 0}
      >下一个</StripItem>
      <StripItem disabled={!view || !query.valid}
        onclick={() => view ? findPrev(view.state, customDispatch, view) : 0}
      >上一个</StripItem>
    </ButtonStrip>
  </ConfigRow>
  <ConfigRow name={$_('search.replace')}>
    <ButtonStrip>
      <StripItem disabled={!view || !query.valid}
        onclick={() => view ? replaceCurrent(view.state, customDispatch, view) : 0}
      >{$_('search.current')}</StripItem>
      <StripItem disabled={!view || !query.valid}
        onclick={() => view ? replaceNext(view.state, customDispatch, view) : 0}
      >{$_('search.next')}</StripItem>
      <StripItem disabled={!view || !query.valid}
        onclick={() => view ? replaceAll(view.state, customDispatch, view) : 0}
      >{$_('search.all')}</StripItem>
    </ButtonStrip>
  </ConfigRow>
</ConfigTable>

<h5>{$_('search.settings')}</h5>
<label>
  <input type='checkbox' bind:checked={$regexp} onchange={setQuery}>
  {$_('search.use-regexp')}
</label>

<label>
  <input type='checkbox' bind:checked={$caseSensitive} onchange={setQuery}>
  {$_('search.case-sensitive')}
</label>
