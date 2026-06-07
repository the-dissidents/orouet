import { isBoundary, type BoundaryCondition } from "$lib/Boundary";
import { Debug, range } from "$lib/details/Util";
import type { DocumentContext } from "$lib/DocumentContext.svelte";
import type { Id } from "$lib/Schema";
import type { Commit } from "$lib/VersionControl.svelte";

export type PositionedNode = {
    id: Id<Commit>,
    x: number, y: number,
    maxX: number,
};

type Node = PositionedNode & {
    widths: Record<number, number>,
    topmostY: number,
    deltaX: number,
};

export type GraphEdge = {
    from: PositionedNode,
    to: PositionedNode,
};

export function graphLayout(c: DocumentContext, b: BoundaryCondition) {
    const vc = c.versionControl;

    // recent on top
    const commits = vc.sortedCommits.toReversed();
    const nodeMap = new Map<Id<Commit>, Node>();
    const nodes: Node[] = [];

    const skipped = new Set<Id<Commit>>();
    const realChildren = new Map<Id<Commit>, Id<Commit>[]>();

    // process skipping
    for (const id of commits) {
        if (skipped.has(id) || !vc.isDelta(id)) continue;
        const commit = vc.get(id)!;
        let p = commit.parent;
        while (!isBoundary(vc, p, 'forward', b) && p !== c.currentCommitId) {
            skipped.add(p);
            Debug.assert(vc.isDelta(p));
            p = vc.get(p)!.parent;
        }
        const children = realChildren.get(p) ?? [];
        children.push(id);
        realChildren.set(p, children);
    }

    // helper
    function getChildren(id: Id<Commit>) {
        return (realChildren.get(id) ?? []).map((x) => {
            Debug.assert(nodeMap.has(x));
            return nodeMap.get(x)!;
        });
    }

    // modified Reingold-Tilford with right contour only
    let y = 0;
    for (const id of commits) {
        if (skipped.has(id)) continue;

        // recent branches to the left
        const children = getChildren(id).sort((a, b) => a.topmostY - b.topmostY);
        const widths: Record<number, number> = { [y]: 0 };

        children.forEach((child, i) => {
            const shift = i == 0 ? 0
                : Math.max(0, ...range(child.topmostY, y).map((yx) => widths[yx] ?? 0)) + 1;
            child.deltaX = shift;

            let lastWx = 0;
            for (let yx = child.topmostY; yx <= y; yx++) {
                // use last value to bridge gaps
                const wx = child.widths[yx] ?? lastWx;
                lastWx = wx;

                if (yx in widths)
                    widths[yx] = Math.max(widths[yx], wx + shift);
                else
                    widths[yx] = wx + shift;
            }
        });

        const topmostY = Math.min(y, ...children.map((x) => x.topmostY));
        const node: Node = { id, x: 0, y, widths, topmostY, deltaX: 0, maxX: 0 };
        nodeMap.set(id, node);
        nodes.push(node);
        y++;
    }

    const edges: GraphEdge[] = [];
    function resolveX(id: Id<Commit>, currentX: number) {
        const node = nodeMap.get(id);
        Debug.assert(!!node);
        node.x = currentX;

        for (const child of getChildren(id)) {
            resolveX(child.id, currentX + child.deltaX);
            edges.push({ from: node, to: child });
        }
    }
    resolveX(vc.initialCommit, 0);

    // maxX is just the global width at that Y level
    const globalWidths = nodeMap.get(vc.initialCommit)?.widths;
    Debug.assert(!!globalWidths);
    for (const node of nodes)
        node.maxX = globalWidths[node.y];

    return { nodes, edges };
}
