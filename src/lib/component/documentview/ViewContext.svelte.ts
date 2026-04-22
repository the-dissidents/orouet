import type { DocumentState, TextBlock, TextCluster } from "$lib/Document.svelte";
import { EventHost } from "@the_dissidents/svelte-ui";

export interface SelectionPoint {
    block: TextBlock,
    pos: number
}

export interface ViewSelection {
    from: SelectionPoint,
    to: SelectionPoint,
    ongoing: boolean
}

export class DocumentViewContext {
    onSelectionChange = new EventHost<[selection: ViewSelection]>;
    onDeleteSelection = new EventHost<[selection: ViewSelection]>;

    activeBlock?: TextCluster = $state();
    selection?: ViewSelection = $state();

    constructor(
        readonly document: DocumentState,
        readonly type: 'source' | 'target'
    ) {}
}
