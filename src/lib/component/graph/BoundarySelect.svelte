<script lang="ts">
  import type { BoundaryCondition } from "$lib/Boundary";
  import { ConfigRow, ConfigTable, NumberInput } from "@the_dissidents/svelte-ui";
  import { untrack } from "svelte";

  const { c = $bindable(), onChange }:
    { c: BoundaryCondition, onChange?: (c: BoundaryCondition) => void } = $props();

  $effect(() => {
    if (c) untrack(() => onChange?.(c));
  });

  let placeholderDelay = c.delay ?? 500;
</script>

<ConfigTable>
  <ConfigRow name='时间间隔'>
    <label>
      <input type='checkbox' checked={c.delay !== undefined}
        onchange={(x) => x.currentTarget.checked ? c.delay = placeholderDelay : c.delay = undefined}>
      <NumberInput bind:value={
        () => c.delay ?? placeholderDelay,
        (x) => { c.delay = x; placeholderDelay = x; }} min='0' max='10000' />
      ms
    </label>
  </ConfigRow>

  <ConfigRow name='文件保存'>
    <input type='checkbox' bind:checked={c.fileSaved}>
  </ConfigRow>

  <ConfigRow name='焦点段落变化'>
    <input type='checkbox' bind:checked={c.focusedBlockChange}>
  </ConfigRow>

  <ConfigRow name='焦点段落组合变化'>
    <input type='checkbox' bind:checked={c.focusedClusterChange}>
  </ConfigRow>
</ConfigTable>
