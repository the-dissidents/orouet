import { BoundaryCondition, isBoundary } from "$lib/Boundary";
import type { DocumentContext } from "$lib/DocumentContext.svelte";
import { Cluster, id, PaneSchema } from "$lib/Schema";
import { TextSelection, type Command } from "prosemirror-state";

export const noop: Command = () => false;

export const stopIfAcrossClusters: Command = (s) => {
    const { $from, $to } = s.selection;
    return Cluster.indexFromPos($from) !== Cluster.indexFromPos($to);
};

export const splitCluster: Command = (s, d) => {
    const head = s.selection.$head;
    const tr = s.tr.split(head.pos, 2, [{
        type: PaneSchema.nodes.cluster,
        attrs: { id: id<Cluster>() }
    }]);
    d?.(tr.scrollIntoView());
    return true;
};

export const splitBlock: Command = (s, d) => {
    const head = s.selection.$head;
    const tr = s.tr.split(head.pos, undefined, [{
        type: PaneSchema.nodes.block,
        attrs: { }
    }]);
    d?.(tr.scrollIntoView());
    return true;
};

export const mergeClusterUpIfAtStart: Command = (s, d) => {
    const head = s.selection.$head;
    const clusterStart = head.before(head.depth-1);
    if (clusterStart < 2 || head.pos - clusterStart > 2) return false;

    const tr = s.tr.delete(clusterStart - 1, clusterStart + 1);
    d?.(tr.scrollIntoView());
    return true;
};

export const mergeBlockUpIfAtStart: Command = (s, d) => {
    const head = s.selection.$head;
    if (head.parentOffset > 0 || head.index(head.depth-1) == 0 || !d) return false;

    const tr = s.tr.delete(head.pos - 2, head.pos);
    d?.(tr.scrollIntoView());
    return true;
};

export const testCommand: Command = (s, d) => {
    const head = s.selection.$head;
    console.log(head, head.depth, head.index(head.depth-1), head.nodeBefore, head.nodeAfter);
    return false;
};

export const gotoPrevBlockIfAtStart: Command = (s, d) => {
    const head = s.selection.$head;
    if (head.parentOffset > 0) return false;

    const sel = TextSelection.near(s.doc.resolve(head.pos - 1), -1);
    if (!sel) return false;

    d?.(s.tr.setSelection(sel).scrollIntoView());
    return true;
};

export const gotoNextBlockIfAtEnd: Command = (s, d) => {
    const head = s.selection.$head;
    if (head.parentOffset < head.parent.content.size) return false;

    const sel = TextSelection.near(s.doc.resolve(head.pos + 1));
    if (!sel) return false;

    d?.(s.tr.setSelection(sel).scrollIntoView());
    return true;
};

const historyBoundary: BoundaryCondition = {
    delay: 1000,
    hasLabel: true
};

export const undo: (dc: DocumentContext) => Command = (dc) => () => {
    let id = dc.currentCommitId;
    do {
        const c = dc.versionControl.get(id);
        if (!c || c.type != 'delta') break;
        id = c.parent;
    } while (!isBoundary(dc.versionControl, id, 'backward', historyBoundary));
    dc.revertTo(id);
    return true;
};

export const redo: (dc: DocumentContext) => Command = (dc) => () => {
    let id = dc.currentCommitId;
    do {
        const c = dc.versionControl.forwardLinks(dc.currentCommitId);
        if (c.length != 1) return false;
        id = c[0];
    } while (!isBoundary(dc.versionControl, id, 'forward', historyBoundary));
    dc.revertTo(id);
    return true;
};
