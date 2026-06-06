import { isBoundary, type BoundaryCondition } from "$lib/Boundary";
import { Debug } from "$lib/details/Util";
import type { DocumentContext } from "$lib/DocumentContext.svelte";
import type { Id } from "$lib/Schema";
import type { Commit, ReadonlyVersionControl } from "$lib/VersionControl.svelte";

export type PositionedNode = {
    id: Id<Commit>,
    x: number, y: number,
    maxX: number,
};

export type GraphEdge = {
    from: PositionedNode,
    to: PositionedNode,
    skipped: Id<Commit>[],
};

export function graphLayout(c: DocumentContext, b: BoundaryCondition) {
    const vc = c.versionControl;
    const commits = vc.sortedCommits.toReversed();

    const nodes: PositionedNode[] = [];
    const nodeMap = new Map<Id<Commit>, PositionedNode>();
    const lanes: (Id<Commit> | null)[] = [];

    const skippedSet = new Set<Id<Commit>>();
    const parentMap = new Map<Id<Commit>, Id<Commit>>();
    const skippedMap = new Map<Id<Commit>, Id<Commit>[]>();

    let y = 0;
    commits.forEach((id) => {
        if (skippedSet.has(id)) return;

        let x = lanes.indexOf(id);
        if (x < 0) x = lanes.indexOf(null);
        if (x < 0) {
            x = lanes.length;
            lanes.push(null);
        }
        const node: PositionedNode = {
            id, x, y,
            maxX: Math.max(x, lanes.findLastIndex((x) => x !== null))
        };
        nodes.push(node);
        nodeMap.set(id, node);

        const commit = vc.get(id);
        if (commit?.type == 'delta') {
            // skip nodes within boundary to find display-parent
            let cur = commit, parent = commit.parent, skipped: Id<Commit>[] = [];
            while (!isBoundary(vc, cur.id, 'backward', b) && parent !== c.currentCommitId) {
                if (!vc.isDelta(parent)) break;
                skippedSet.add(parent);
                skipped.push(parent);

                cur = vc.get(parent)!;
                Debug.assert(!!cur);
                parent = cur.parent;
            }
            skippedMap.set(id, skipped);
            parentMap.set(id, parent);

            if (!lanes.includes(parent)) lanes[x] = parent;
            else lanes[x] = null;

            // process more parents for merge commits...
        } else {
            lanes[x] = null;
        }

        y++;
    });

    const edges: GraphEdge[] = [];
    commits.forEach((id) => {
        if (skippedSet.has(id)) return;

        const commit = vc.get(id);
        if (commit?.type == 'delta') {
            const from = nodeMap.get(id);
            const to = nodeMap.get(parentMap.get(id)!);
            Debug.assert(!!from && !!to);
            edges.push({
                from, to,
                skipped: skippedMap.get(id) ?? []
            });
        }
    });

    return { nodes, edges };
}
