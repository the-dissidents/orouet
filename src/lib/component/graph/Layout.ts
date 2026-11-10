import { type BoundaryCondition } from "$lib/Boundary";
import { Debug } from "$lib/details/Util";
import type { Id } from "$lib/Schema";
import type { Commit, ReadonlyVersionControl } from "$lib/Backend";
import { GraphLayoutCache } from "./Cache";

export type PositionedNode = {
    commit: Commit,
    x: number, y: number,
    maxX: number,
};

type Widths = Record<number, number>;

type Node = PositionedNode & {
    widths: Widths,
    /**
     * True when `widths` has an explicit value for every row in
     * `[topmostY, y]`, so it can be reused by a parent without copying.
     */
    dense: boolean,
    topmostY: number,
    deltaX: number,
    children: Node[],
};

export type EdgeType = 'children' | 'merging' | 'merged';

export type GraphEdge = {
    from: PositionedNode,
    to: PositionedNode,
    type: EdgeType
};

export type GraphLayout = {
    nodes: PositionedNode[],
    edges: GraphEdge[],
};

/** The subset of `DocumentContext` that graph layout actually needs. */
export type GraphLayoutContext = {
    readonly versionControl: ReadonlyVersionControl,
    readonly currentCommitId: Id<Commit>,
    readonly currentDiffCommit?: Id<Commit>,
};

export function graphLayout(
    c: GraphLayoutContext, cache: GraphLayoutCache,
): GraphLayout {
    const vc = c.versionControl;

    // recent on top
    const commits = vc.sortedCommits.toReversed();
    const nodeMap = new Map<Id<Commit>, Node>();
    const nodes: Node[] = [];

    cache.ensureInitialized();
    const boundarySet = cache.boundarySet;

    // Current commit and diff target are visible regardless of boundaries.
    // They change far more often than the history, so they are handled as a
    // per-call overlay rather than part of the persistent cache.
    const forced = new Set<Id<Commit>>([c.currentCommitId]);
    if (c.currentDiffCommit) forced.add(c.currentDiffCommit);

    const isVisible = (id: Id<Commit>) =>
        id === vc.initialCommit || boundarySet.has(id) || forced.has(id);

    // Non-boundary commits in a forced node's segment attach to that node.
    const forcedAncestor = new Map<Id<Commit>, Id<Commit>>();
    for (const f of forced) {
        if (f === vc.initialCommit || boundarySet.has(f)) continue;

        const stack = [...vc.forwardLinks(f)];
        while (stack.length > 0) {
            const id = stack.pop()!;
            if (id === vc.initialCommit
                || boundarySet.has(id)
                || forced.has(id)
                || forcedAncestor.has(id)) continue;

            forcedAncestor.set(id, f);
            stack.push(...vc.forwardLinks(id));
        }
    }

    const visibleAncestor = (id: Id<Commit>): Id<Commit> => {
        if (isVisible(id)) return id;
        const forcedBy = forcedAncestor.get(id);
        if (forcedBy !== undefined) return forcedBy;
        return cache.baseAncestor(id);
    };

    // process skipping
    const visibleChildren = new Map<Id<Commit>, Id<Commit>[]>();
    for (const id of commits) {
        if (id === vc.initialCommit || !isVisible(id)) continue;
        const commit = vc.get(id);
        // Merge commits are not supported yet
        if (commit.type !== 'delta') continue;

        const parent = visibleAncestor(commit.parent);
        const children = visibleChildren.get(parent) ?? [];
        children.push(id);
        visibleChildren.set(parent, children);
    }

    // modified Reingold-Tilford with right contour only
    // A bit of this was written by Gemini 3 Pro
    let y = 0;
    for (const id of commits) {
        if (!isVisible(id)) continue;
        // The initial commit has no commit object, and non-delta commits are not supported yet
        if (id !== vc.initialCommit && !vc.isDelta(id)) continue;

        // children in insertion order, for edge traversal
        // the layout pass needs children ordered by their topmost row
        const children = (visibleChildren.get(id) ?? []).map((childId) => {
            const child = nodeMap.get(childId);
            Debug.assert(!!child);
            return child;
        });

        // children in display order (longest-lived on the left)
        const ordered = children.slice().sort((a, b) => a.topmostY - b.topmostY);

        // The first child has shift 0, so its width map is also this node's
        // width map (plus the new row). Reuse it instead of copying.
        let widths: Widths;
        let dense: boolean;
        if (ordered.length === 0) {
            widths = { [y]: 0 };
            dense = true;
        } else {
            // inherit the first child's widths map and fill its gaps
            widths = ordered[0].widths;
            if (!ordered[0].dense) {
                let lastWx = 0;
                for (let yx = ordered[0].topmostY; yx <= ordered[0].y; yx++) {
                    const wx = widths[yx] ?? lastWx;
                    lastWx = wx;
                    widths[yx] = wx;
                }
            }

            // add a default width at the y-level of this node
            widths[y] = 0;

            // Only a single child directly adjacent to this row leaves no
            // gaps. Multiple children can leave gaps between their spans.
            dense = ordered.length === 1 && ordered[0].y + 1 === y;
        }

        ordered.forEach((child, i) => {
            if (i === 0) {
                child.deltaX = 0;
                return;
            }

            let maxWidth = 0;
            for (let yx = child.topmostY; yx < y; yx++) {
                const w = widths[yx];
                if (w !== undefined && w > maxWidth) maxWidth = w;
            }
            const shift = maxWidth + 1;
            child.deltaX = shift;

            let lastWx = 0;
            for (let yx = child.topmostY; yx <= child.y; yx++) {
                // use last value to bridge gaps
                const wx = child.widths[yx] ?? lastWx;
                lastWx = wx;
                const w = wx + shift;

                const existing = widths[yx];
                widths[yx] = existing === undefined ? w : Math.max(existing, w);
            }
        });

        let topmostY = y;
        for (const child of children)
            if (child.topmostY < topmostY) topmostY = child.topmostY;

        const node: Node = {
            commit: vc.get(id), x: 0, y, maxX: 0,
            widths, dense, topmostY, deltaX: 0, children,
        };
        nodeMap.set(id, node);
        nodes.push(node);
        y++;
    }

    // resolve x positions and emit edges
    const edges: GraphEdge[] = [];
    const initial = nodeMap.get(vc.initialCommit);
    Debug.assert(!!initial);

    // don't use recursion here as we can break the call stack limit
    type StackItem = { node: Node, x: number }
    const stack: StackItem[] = [{ node: initial, x: 0 }];
    let item: StackItem | undefined;
    while ((item = stack.pop())) {
        item.node.x = item.x;
        for (let i = item.node.children.length - 1; i >= 0; i--) {
            const child = item.node.children[i];
            edges.push({ from: item.node, to: child, type: 'children' });
            stack.push({ node: child, x: item.x + child.deltaX });
        }
    }

    if (c.currentDiffCommit) {
        const orig = nodeMap.get(c.currentDiffCommit);
        const current = nodeMap.get(c.currentCommitId);
        Debug.assert(!!orig && !!current);
        edges.push({ from: orig, to: current, type: 'merging' });
    }

    // maxX is just the global width at that Y level
    const globalWidths = initial.widths;
    for (const node of nodes) {
        node.maxX = globalWidths[node.y] ?? 0;
    }

    return { nodes, edges };
}
