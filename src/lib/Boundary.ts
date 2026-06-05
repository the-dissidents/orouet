import type { Id } from "$lib/Schema";
import type { Commit, ReadonlyVersionControl } from "$lib/VersionControl.svelte";

type BoundaryCondition = {
    delay?: number,
    selectionSet?: boolean,
    focusedBlockChange?: boolean,
    focusedClusterChange?: boolean,
    fileSaved?: boolean,
};

export function isBoundary(
    vc: ReadonlyVersionControl, current: Id<Commit>,
    direction: 'forward' | 'backward',
    condition: BoundaryCondition = {}
) {
    const from = vc.get(current);
    if (!from)
        return direction == 'forward';

    let nexts: Id<Commit>[];
    if (direction == 'forward') {
        nexts = vc.forwardLinks(current);
    } else {
        // backward
        if (from.type == 'delta')
            nexts = [from.parent];
        else return true;
    }
    if (nexts.length !== 1 || !vc.isDelta(nexts[0])) return true;

    const next = vc.get(nexts[0])!;
    if (next.where !== from.where) return true;
    if (condition.fileSaved && next.attrs.fileSaved) return true;
    if (condition.selectionSet && next.attrs.selectionSet) return true;

    if (condition.delay
     && Math.abs(from.attrs.timestamp - next.attrs.timestamp) > condition.delay) return true;
    if (condition.focusedBlockChange
     && next.attrs.focusedBlock !== from.attrs.focusedBlock) return true;
    if (condition.focusedClusterChange
     && next.attrs.focusedCluster !== from.attrs.focusedCluster) return true;

    return false;
}
