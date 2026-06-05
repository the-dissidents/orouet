import type { Id } from "$lib/Schema";
import type { Commit, ReadonlyVersionControl } from "$lib/VersionControl.svelte";

export type PositionedNode = {
    id: Id<Commit>,
    x: number, y: number
};

export type GraphEdge = {
    from: PositionedNode,
    to: PositionedNode
};

export function graphLayout(vc: ReadonlyVersionControl) {
    const commits = vc.sortedCommits.toReversed();

    const nodes: PositionedNode[] = [];
    const nodeMap = new Map<Id<Commit>, PositionedNode>();
    const edges: GraphEdge[] = [];
    const lanes: (Id<Commit> | null)[] = [];

    commits.forEach((id, y) => {
        let x = lanes.indexOf(id);
        if (x < 0) x = lanes.indexOf(null);
        if (x < 0) {
            x = lanes.length;
            lanes.push(null);
        }
        const node: PositionedNode = { id, x, y };
        nodes.push(node);
        nodeMap.set(id, node);

        const commit = vc.get(id);
        if (commit?.type == 'delta') {
            if (!lanes.includes(commit.parent))lanes[x] = commit.parent;
            else lanes[x] = null;

            // process more parents for merge commits...
        } else {
            lanes[x] = null;
        }
    });

    commits.forEach((id) => {
        const commit = vc.get(id);
        if (commit?.type == 'delta') {
            edges.push({ from: nodeMap.get(id)!, to: nodeMap.get(commit.parent)! });
        }
    });

    return { nodes, edges };
}
