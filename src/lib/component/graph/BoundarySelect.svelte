<script lang="ts">
  import type { BoundaryCondition } from "$lib/Boundary";
  import { ConfigRow, ConfigTable, NumberInput } from "@the_dissidents/svelte-ui";
  import { untrack } from "svelte";
  import { _ } from "svelte-i18n";

  const { c = $bindable(), onChange }:
    { c: BoundaryCondition, onChange?: (c: BoundaryCondition) => void } = $props();

  $effect(() => {
    if (c) untrack(() => onChange?.(c));
  });

  let delaySeconds = (c.delay ?? 5000) / 1000;
</script>

<ConfigTable>
  <ConfigRow name={$_('boundary.delay')}>
    <label>
      <input type='checkbox' checked={c.delay !== undefined}
        onchange={(x) => x.currentTarget.checked
          ? c.delay = delaySeconds * 1000 : c.delay = undefined}>
      <NumberInput bind:value={
        () => c.delay ? c.delay / 1000 : delaySeconds,
        (x) => { c.delay = x * 1000; delaySeconds = x; }} min='0' max='10000' step='0.1' />
      {$_('seconds')}
    </label>
  </ConfigRow>

  <ConfigRow name={"带有标签"}>
    <input type='checkbox' bind:checked={c.hasLabel}>
  </ConfigRow>

  <ConfigRow name={$_('boundary.fileSaved')}>
    <input type='checkbox' bind:checked={c.fileSaved}>
  </ConfigRow>

  <ConfigRow name={$_('boundary.focusedClusterChanged')}>
    <input type='checkbox' bind:checked={c.focusedClusterChange}>
  </ConfigRow>
</ConfigTable>
