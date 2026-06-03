import type { DocumentContext } from "$lib/DocumentContext.svelte";
import type { Id } from "$lib/Schema";
import type { Commit, ReadonlyVersionControl } from "$lib/VersionControl";
import { Plugin } from "prosemirror-state";

function isBoundary(vc: ReadonlyVersionControl, c: Id<Commit>) {

}

const UndoRedo = (context: DocumentContext) => new Plugin({

});
