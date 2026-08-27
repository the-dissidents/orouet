<script lang="ts">
  import type { LocaleId } from "$lib/DocumentContext.svelte";
  import { ConfigRow, ConfigTable } from "@the_dissidents/svelte-ui";
  import { LanguageCodes, LanguageVariants } from "../../data/LocaleData";
  import { _ } from 'svelte-i18n';

  const { locale = $bindable() }: { locale: LocaleId } = $props();

  const langName = new Intl.DisplayNames(['zh', 'en'], { type: 'language', languageDisplay: 'dialect' });
  // const scriptName = new Intl.DisplayNames(['zh', 'en'], { type: 'script' });
  // const regionName = new Intl.DisplayNames(['zh', 'en'], { type: 'region' });

  const choices = $derived(!locale[0] ? [] : LanguageVariants[locale[0]]);
  const choice = $derived(choices.find((x) => x[0] == locale[1] && x[1] == locale[2]) ?? null);

  const codes = Object.entries(LanguageCodes);
</script>

<ConfigTable>
  <ConfigRow name={$_('locselect.language')} style="display:flex">
    <select bind:value={locale[0]} onchange={() => {
      locale[1] = null;
      locale[2] = null;
    }}>
      <option value={null}>{$_('locselect.automatic')}</option>
      <hr>
      <optgroup label={$_('locselect.modern')}>
        {#each codes.filter((x) => x[1] == 'modern') as [code, _]}
          <option value={code}>{langName.of(code) ?? '??'}</option>
        {/each}
      </optgroup>

      <optgroup label={$_('locselect.moderate')}>
        {#each codes.filter((x) => x[1] == 'moderate') as [code, _]}
          <option value={code}>{langName.of(code) ?? '??'}</option>
        {/each}
      </optgroup>

      <optgroup label={$_('locselect.basic')}>
        {#each codes.filter((x) => x[1] == 'basic') as [code, _]}
          <option value={code}>{langName.of(code) ?? '??'}</option>
        {/each}
      </optgroup>

      <optgroup label={$_('locselect.n-a')}>
        {#each codes.filter((x) => x[1] == 'na') as [code, _]}
          <option value={code}>{langName.of(code) ?? '??'}</option>
        {/each}
      </optgroup>
    </select>
  </ConfigRow>

  {#if choices.length > 0}
  <ConfigRow name={$_('locselect.variant')} style="display:flex">
    <select bind:value={() => choice, (x) => {
      if (!x) { locale[1] = null; locale[2] = null; }
      else { locale[1] = x[0]; locale[2] = x[1]; }
    }}>
      <option value={null}>{$_('locselect.generic')}</option>
      {#each choices as ch}
      {@const id = [locale[0], ...ch].filter((x) => !!x).join('-')}
        <option value={ch}>{langName.of(id)}</option>
      {/each}
    </select>
  </ConfigRow>
  {/if}
</ConfigTable>

<style>
select {
  flex-grow: 1;
}
</style>
