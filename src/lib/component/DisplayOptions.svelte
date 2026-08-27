<script lang="ts">
  import type { TextOptions } from "$lib/TextOptions";
  import { _ } from "svelte-i18n";
  import { ConfigRow, ConfigTable, NumberInput } from "@the_dissidents/svelte-ui";

  interface Props {
    value: TextOptions
  }

  const { value = $bindable() }: Props = $props();
</script>

<h5>{$_('displayOptions')}</h5>

<ConfigTable>
  <ConfigRow name={$_('numericStyle.label')}>
    <select bind:value={value.numericStyle}>
      <option value="lining">{$_('numericStyle.lining')}</option>
      <option value="oldstyle">{$_('numericStyle.oldstyle')}</option>
      <option value="tabular">{$_('numericStyle.tabular')}</option>
    </select>
  </ConfigRow>

  <ConfigRow name={$_('emphasisStyle')}>
    <select bind:value={value.emphasisStyle}>
      <option value="italic">{$_('italic')}</option>
      <option value="bold">{$_('bold')}</option>
      <option value="smallcaps">{$_('smallCaps')}</option>
      <option value="underline">{$_('underline')}</option>
      <option value="mark">{$_('emphasisMark')}</option>
      <option value="gesperrt">{$_('sperrsatz')}</option>
    </select>
  </ConfigRow>

  <ConfigRow name={$_('keywordStyle')}>
    <select bind:value={value.keywordStyle}>
      <option value="italic">{$_('italic')}</option>
      <option value="bold">{$_('bold')}</option>
      <option value="smallcaps">{$_('smallCaps')}</option>
      <option value="underline">{$_('underline')}</option>
      <option value="mark">{$_('emphasisMark')}</option>
      <option value="gesperrt">{$_('sperrsatz')}</option>
    </select>
  </ConfigRow>

  <ConfigRow name={$_('justify')}>
    <input type='checkbox' bind:checked={value.justify}>
  </ConfigRow>

  <ConfigRow name={$_('hyphenate')}>
    <input type='checkbox' bind:checked={value.hyphenation}>
  </ConfigRow>

  <ConfigRow name={$_('sizeAdjustment')}>
    <NumberInput bind:value={value.sizeAdjustment} width='4em' step='0.02' min='0.5' max='2' />
  </ConfigRow>

  <ConfigRow name={$_('ligatures.label')}>
    <label>
      {$_('ligatures.common')}
      <input type='checkbox' class="button" bind:checked={value.ligatures.common}>
    </label>
    <label>
      {$_('ligatures.discretionary')}
      <input type='checkbox' class="button" bind:checked={value.ligatures.discretionary}>
    </label>
    <label>
      {$_('ligatures.historical')}
      <input type='checkbox' class="button" bind:checked={value.ligatures.historical}>
    </label>
    <label>
      {$_('ligatures.contextual')}
      <input type='checkbox' class="button" bind:checked={value.ligatures.contextual}>
    </label>
  </ConfigRow>
</ConfigTable>
