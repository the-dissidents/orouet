<script lang="ts">
  import type { LocaleId } from "$lib/DocumentContext.svelte";
  import { LanguageCodes, LanguageVariants } from "../../data/LocaleData";

  const { locale = $bindable() }: { locale: LocaleId } = $props();

  const langName = new Intl.DisplayNames(['zh', 'en'], { type: 'language', languageDisplay: 'dialect' });
  const scriptName = new Intl.DisplayNames(['zh', 'en'], { type: 'script' });
  const regionName = new Intl.DisplayNames(['zh', 'en'], { type: 'region' });

  const choices = $derived(!locale[0] ? [] : LanguageVariants[locale[0]]);
  const choice = $derived(choices.find((x) => x[0] == locale[1] && x[1] == locale[2]) ?? null);

  function getName(l: LocaleId) {
    if (!l[0]) return '未制定';
    const code = l.filter((x) => !!x).join('-');
    return langName.of(code) ?? code;
  }

  const codes = Object.entries(LanguageCodes);
</script>

<select bind:value={locale[0]} onchange={() => {
  locale[1] = null;
  locale[2] = null;
}}>
  <option value={null}>自动识别</option>
  <hr>
  <optgroup label="modern">
    {#each codes.filter((x) => x[1] == 'modern') as [code, _]}
      <option value={code}>{langName.of(code) ?? '??'}</option>
    {/each}
  </optgroup>

  <optgroup label="moderate">
    {#each codes.filter((x) => x[1] == 'moderate') as [code, _]}
      <option value={code}>{langName.of(code) ?? '??'}</option>
    {/each}
  </optgroup>

  <optgroup label="basic">
    {#each codes.filter((x) => x[1] == 'basic') as [code, _]}
      <option value={code}>{langName.of(code) ?? '??'}</option>
    {/each}
  </optgroup>

  <optgroup label="n/a">
    {#each codes.filter((x) => x[1] == 'na') as [code, _]}
      <option value={code}>{langName.of(code) ?? '??'}</option>
    {/each}
  </optgroup>
</select>

{#if choices.length > 0}
<select bind:value={() => choice, (x) => {
  if (!x) { locale[1] = null; locale[2] = null; }
  else { locale[1] = x[0]; locale[2] = x[1]; }
}}>
  <option value={null}>通用</option>
  {#each choices as ch}
  {@const id = [locale[0], ...ch].filter((x) => !!x).join('-')}
    <option value={ch}>{langName.of(id)}</option>
  {/each}
</select>
{/if}

<style>

</style>
