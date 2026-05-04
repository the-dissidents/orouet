<script lang="ts">
  import type { TextOptions } from "$lib/DocumentContext.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import { Collapsible, ConfigRow, ConfigTable, NumberInput } from "@the_dissidents/svelte-ui";

  interface Props {
    value: TextOptions
  }

  const { value = $bindable() }: Props = $props();
</script>

<h5>{m.displayOptions()}</h5>

<ConfigTable>
  <ConfigRow name={m.numericStyle()}>
    <select bind:value={value.numericStyle}>
      <option value="lining">{m.numericStyle_lining()}</option>
      <option value="oldstyle">{m.numericStyle_oldstyle()}</option>
      <option value="tabular">{m.numericStyle_tabular()}</option>
    </select>
  </ConfigRow>

  <ConfigRow name={m.emphasisStyle()}>
    <select bind:value={value.emphasisStyle}>
      <option value="italic">{m.italic()}</option>
      <option value="bold">{m.bold()}</option>
      <option value="smallcaps">{m.smallCaps()}</option>
      <option value="underline">{m.underline()}</option>
      <option value="mark">{m.emphasisMark()}</option>
      <option value="gesperrt">{m.sperrsatz()}</option>
    </select>
  </ConfigRow>

  <ConfigRow name={m.keywordStyle()}>
    <select bind:value={value.keywordStyle}>
      <option value="italic">{m.italic()}</option>
      <option value="bold">{m.bold()}</option>
      <option value="smallcaps">{m.smallCaps()}</option>
      <option value="underline">{m.underline()}</option>
      <option value="mark">{m.emphasisMark()}</option>
      <option value="gesperrt">{m.sperrsatz()}</option>
    </select>
  </ConfigRow>

  <ConfigRow name={m.justify()}>
    <input type='checkbox' bind:checked={value.justify}>
  </ConfigRow>

  <ConfigRow name={m.hyphenate()}>
    <input type='checkbox' bind:checked={value.hyphenation}>
  </ConfigRow>

  <ConfigRow name={m.sizeAdjustment()}>
    <NumberInput bind:value={value.sizeAdjustment} width='4em' step='0.02' min='0.5' max='2' />
  </ConfigRow>

  <ConfigRow name={m.ligatures()}>
    <label>
      {m.ligatures_common()}
      <input type='checkbox' class="button" bind:checked={value.ligatures.common}>
    </label>
    <label>
      {m.ligatures_discretionary()}
      <input type='checkbox' class="button" bind:checked={value.ligatures.discretionary}>
    </label>
    <label>
      {m.ligatures_historical()}
      <input type='checkbox' class="button" bind:checked={value.ligatures.historical}>
    </label>
    <label>
      {m.ligatures_contextual()}
      <input type='checkbox' class="button" bind:checked={value.ligatures.contextual}>
    </label>
  </ConfigRow>
</ConfigTable>
