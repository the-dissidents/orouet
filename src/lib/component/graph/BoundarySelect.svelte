<script lang="ts">
  import type { BoundaryCondition } from "$lib/Boundary";
  import { ConfigRow, ConfigTable, NumberInput } from "@the_dissidents/svelte-ui";
  import { _ } from "svelte-i18n";

  const { c = $bindable(), onChange }:
    { c: BoundaryCondition, onChange?: (c: BoundaryCondition) => void } = $props();

  let delaySeconds = (c.delay ?? 5000) / 1000;
</script>

<ConfigTable>
  <ConfigRow name={$_('boundary.delay')}>
    <label>
      <input type='checkbox' checked={c.delay !== undefined}
        onchange={(x) => {
          c.delay = x.currentTarget.checked ? delaySeconds * 1000 : undefined;
          onChange?.(c);
        }}>
      <NumberInput min='0' max='100000' step='0.1'
        bind:value={
          () => c.delay ? c.delay / 1000 : delaySeconds,
          (x) => { c.delay = x * 1000; delaySeconds = x; }
        }
        onchange={() => onChange?.(c)} />
      {$_('seconds')}
    </label>
  </ConfigRow>

  <ConfigRow name={$_('boundary.has-label')}>
    <input type='checkbox' bind:checked={c.hasLabel} onchange={() => onChange?.(c)}>
  </ConfigRow>

  <ConfigRow name={$_('boundary.fileSaved')}>
    <input type='checkbox' bind:checked={c.fileSaved} onchange={() => onChange?.(c)}>
  </ConfigRow>

  <ConfigRow name={$_('boundary.focusedClusterChanged')}>
    <input type='checkbox' bind:checked={c.focusedClusterChange} onchange={() => onChange?.(c)}>
  </ConfigRow>
</ConfigTable>
