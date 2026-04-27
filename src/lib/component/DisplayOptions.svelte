<script lang="ts">
  import type { TextOptions } from "$lib/DocumentContext.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import { Collapsible, NumberInput } from "@the_dissidents/svelte-ui";

  interface Props {
    value: TextOptions
  }

  const { value = $bindable() }: Props = $props();
</script>

<h5>{m.displayOptions()}</h5>

<div class="content">
  <label>
    {m.numericStyle()}
    <select bind:value={value.numericStyle}>
      <option value="lining">{m.numericStyle_lining()}</option>
      <option value="oldstyle">{m.numericStyle_oldstyle()}</option>
      <option value="tabular">{m.numericStyle_tabular()}</option>
    </select>
  </label>

  <label>
    {m.justify()}
    <input type='checkbox' bind:checked={value.justify}>
  </label>

  <label>
    {m.hyphenate()}
    <input type='checkbox' bind:checked={value.hyphenation}>
  </label>

  <label>
    {m.sizeAdjustment()}
    <NumberInput bind:value={value.sizeAdjustment} width='4em' />
  </label>

  <Collapsible header={m.ligatures()} active>
  <div class="content">
    <label>
      common
      <input type='checkbox' bind:checked={value.ligatures.common}>
    </label>
    <label>
      discretionary
      <input type='checkbox' bind:checked={value.ligatures.discretionary}>
    </label>
    <label>
      historical
      <input type='checkbox' bind:checked={value.ligatures.historical}>
    </label>
    <label>
      contextual
      <input type='checkbox' bind:checked={value.ligatures.contextual}>
    </label>
  </div>
  </Collapsible>
</div>

<style lang="scss">
  .content {
    display: flex;
    flex-direction: column;
    margin: 5px;
  }
</style>
