<script lang="ts">
  import type { TextOptions } from "$lib/DocumentContext.svelte";

  interface Props {
    value: TextOptions
  }

  const { value }: Props = $props();
</script>

<select>
  <option></option>
</select>
