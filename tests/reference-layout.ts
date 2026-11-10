import { isBoundary, type BoundaryCondition } from "$lib/Boundary";
import type {
    GraphEdge,
    GraphLayout,
    GraphLayoutContext,
    PositionedNode,
} from "$lib/component/graph/Layout";
import type { Id } from "$lib/Schema";
import { Debug } from "$lib/details/Util";
import type { Commit } from "$lib/Backend";

type Node = PositionedNode & {
    widths: Record<number, number>,
    topmostY: number,
    deltaX: number,
};

/**
 * The previous implementation, kept verbatim apart from handling the phantom
 * initial commit. Used to check that layout optimizations do not change the
 * resulting positions.
 */
export function referenceGraphLayout(
    c: GraphLayoutContext,
    b: BoundaryCondition,
): GraphLayout {
    const vc = c.versionControl;

    const commits = vc.sortedCommits.toReversed();
    const nodeMap = new Map<Id<Commit>, Node>();
    const nodes: Node[] = [];

    const skipped = new Set<Id<Commit>>();
    const realChildren = new Map<Id<Commit>, Id<Commit>[]>();

    for (const id of commits) {
        if (skipped.has(id) || !vc.isDelta(id)) continue;
        const commit = vc.get(id)!;
        let p = commit.parent;
        while (p !== c.currentDiffCommit && p !== c.currentCommitId) {
            const from = vc.get(p);
            if (from.type !== 'delta') break;
            if (isBoundary(vc, p, 'forward', b)) break;
            skipped.add(p);
            p = from.parent;
        }
        const children = realChildren.get(p) ?? [];
        children.push(id);
        realChildren.set(p, children);
    }

    function getChildren(id: Id<Commit>) {
        return (realChildren.get(id) ?? []).map((x) => {
            Debug.assert(nodeMap.has(x));
            return nodeMap.get(x)!;
        });
    }

    let y = 0;
    for (const id of commits) {
        if (skipped.has(id)) continue;
        if (!vc.isDelta(id)) continue;

        const children = getChildren(id).sort((a, b) => a.topmostY - b.topmostY);
        const widths: Record<number, number> = { [y]: 0 };

        children.forEach((child, i) => {
            let shift = 0;
            if (i !== 0) {
                let maxWidth = 0;
                for (let yx = child.topmostY; yx < y; yx++) {
                    maxWidth = Math.max(maxWidth, widths[yx] ?? 0);
                }
                shift = maxWidth + 1;
            }
            child.deltaX = shift;

            let lastWx = 0;
            for (let yx = child.topmostY; yx <= child.y; yx++) {
                const wx = child.widths[yx] ?? lastWx;
                lastWx = wx;

                if (yx in widths) widths[yx] = Math.max(widths[yx], wx + shift);
                else widths[yx] = wx + shift;
            }
        });

        const topmostY = Math.min(y, ...children.map((x) => x.topmostY));
        const node: Node = { commit: vc.get(id), x: 0, y, maxX: 0, widths, topmostY, deltaX: 0 };
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
            resolveX(child.commit.id, currentX + child.deltaX);
            edges.push({ from: node, to: child, type: 'children' });
        }
    }
    resolveX(vc.initialCommit, 0);

    if (c.currentDiffCommit) {
        const orig = nodeMap.get(c.currentDiffCommit);
        const current = nodeMap.get(c.currentCommitId);
        Debug.assert(!!orig && !!current);
        edges.push({ from: orig, to: current, type: 'merging' });
    }

    const globalWidths = nodeMap.get(vc.initialCommit)?.widths;
    Debug.assert(!!globalWidths);
    for (const node of nodes) {
        node.maxX = globalWidths[node.y] ?? 0;
    }

    return { nodes, edges };
}
