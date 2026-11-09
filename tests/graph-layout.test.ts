import { describe, expect, it } from "vitest";

import { graphLayout, type GraphLayout, type GraphLayoutContext } from "$lib/component/graph/Layout";
import type { Id } from "$lib/Schema";
import type { Commit, ReadonlyVersionControl } from "$lib/VersionControl.svelte";
import { FakeVersionControl, linearChain } from "./fake-version-control";
import { GraphLayoutCache } from "$lib/component/graph/Cache";
import type { BoundaryCondition } from "$lib/Boundary";

function expectSameMembers(a: unknown[], b: unknown[]) {
    expect(a).toHaveLength(b.length);
    expect(a).toEqual(expect.arrayContaining(b));
}

const id = (value: string) => value as Id<Commit>;
const ids = (layout: GraphLayout) => layout.nodes.map((node) => node.id);
const edges = (layout: GraphLayout) => layout.edges.map((edge) => [
    edge.from.id, edge.to.id, edge.type,
] as const);

function getLayout(
    vc: ReadonlyVersionControl,
    cond: BoundaryCondition = { fileSaved: true },
    ctx: GraphLayoutContext = {
        versionControl: vc,
        currentCommitId: vc.initialCommit,
    }
) {
    const cache = new GraphLayoutCache(vc);
    cache.setCondition(cond);
    return graphLayout(ctx, cache);
}

describe("graphLayout", () => {
    it("renders just the initial state for an empty history", () => {
        const vc = new FakeVersionControl();
        const layout = getLayout(vc, {});

        expect(ids(layout)).toEqual([vc.initialCommit]);
        expect(layout.nodes[0]).toMatchObject({ x: 0, y: 0, maxX: 0 });
        expect(layout.edges).toEqual([]);
    });

    it("collapses a linear history into a single boundary segment", () => {
        const vc = linearChain(['c1', 'c2', 'c3']);
        const layout = getLayout(vc, {});

        expect(ids(layout)).toEqual(['c3', vc.initialCommit]);
        expect(edges(layout)).toEqual([
            [vc.initialCommit, 'c3', 'children'],
        ]);
        expect(layout.nodes.map((node) => node.y)).toEqual([0, 1]);
    });

    it("keeps every commit when each one is a boundary", () => {
        const vc = linearChain(
            ['c1', 'c2', 'c3'],
            () => ({ fileSaved: true }),
        );
        const layout = getLayout(vc);

        expect(ids(layout)).toEqual(['c3', 'c2', 'c1', vc.initialCommit]);
        expect(layout.nodes.map((node) => node.y)).toEqual([0, 1, 2, 3]);
        expect(layout.nodes.map((node) => node.x)).toEqual([0, 0, 0, 0]);
        expect(layout.nodes.map((node) => node.maxX)).toEqual([0, 0, 0, 0]);
        expectSameMembers(edges(layout), [
            ['c2', 'c3', 'children'],
            ['c1', 'c2', 'children'],
            [vc.initialCommit, 'c1', 'children'],
        ]);
    });

    it("collapses commits that fall within the delay threshold", () => {
        const vc = new FakeVersionControl();
        vc.add('c1', vc.initialCommit, { timestamp: 0 });
        vc.add('c2', id('c1'), { timestamp: 100 });
        vc.add('c3', id('c2'), { timestamp: 1000 });

        const layout = getLayout(vc, { delay: 500 });

        // c1 is within 100ms of c2, so only c2 survives between c3 and the
        // initial state. c3 itself starts a new segment because of the 900ms gap.
        expect(ids(layout)).toEqual(['c3', 'c2', vc.initialCommit]);
        expectSameMembers(edges(layout), [
            ['c2', 'c3', 'children'],
            [vc.initialCommit, 'c2', 'children'],
        ]);
    });

    it("keeps the current and diff commits visible", () => {
        const vc = linearChain(['c1', 'c2', 'c3']);
        const layout = getLayout(vc, {}, {
            versionControl: vc,
            currentCommitId: vc.latestCommit,
            currentDiffCommit: id('c2'),
        });

        expect(ids(layout)).toEqual(['c3', 'c2', vc.initialCommit]);
        expectSameMembers(edges(layout), [
            ['c2', 'c3', 'children'],
            [vc.initialCommit, 'c2', 'children'],
            ['c2', 'c3', 'merging'],
        ]);
    });

    it("puts sibling branches on separate lanes", () => {
        const vc = new FakeVersionControl();
        vc.add('a', vc.initialCommit, { timestamp: 0 });
        vc.add('b', vc.initialCommit, { timestamp: 1 });

        const layout = getLayout(vc);
        const byId = new Map(layout.nodes.map((node) => [node.id, node]));
        expect(ids(layout)).toEqual(['b', 'a', vc.initialCommit]);
        expect(byId.get(id('b'))).toMatchObject({ x: 0, y: 0 });
        expect(byId.get(id('a'))).toMatchObject({ x: 1, y: 1 });
        expect(byId.get(vc.initialCommit)).toMatchObject({ x: 0, y: 2 });
        expectSameMembers(edges(layout), [
            [vc.initialCommit, 'b', 'children'],
            [vc.initialCommit, 'a', 'children'],
        ]);
    });

    it("does not overflow the call stack on deep histories", () => {
        const count = 20000;
        const chain = Array.from({ length: count }, (_, i) => `c${i}`);
        const vc = linearChain(chain, () => ({ fileSaved: true }));

        const cache = new GraphLayoutCache(vc);
        cache.setCondition({ fileSaved: true });
        const layout = graphLayout({
            versionControl: vc,
            currentCommitId: vc.latestCommit,
        }, cache);

        expect(layout.nodes).toHaveLength(count + 1);
        expect(layout.edges).toHaveLength(count);
    });

    it("stays linear on large, fully visible histories", { timeout: 15000 }, () => {
        const count = 15000;
        const chain = Array.from({ length: count }, (_, i) => `c${i}`);
        const vc = linearChain(chain, () => ({ fileSaved: true }));

        const start = performance.now();
        const cache = new GraphLayoutCache(vc);
        cache.setCondition({ fileSaved: true });
        const layout = graphLayout({
            versionControl: vc,
            currentCommitId: vc.latestCommit,
        }, cache);
        const elapsed = performance.now() - start;

        expect(layout.nodes).toHaveLength(count + 1);
        // The previous implementation copied every node's width map, which is
        // quadratic here (seconds at this size). Keep a generous ceiling so
        // this only fails on an actual complexity regression.
        expect(elapsed, `layout took ${elapsed.toFixed(1)}ms`).toBeLessThan(3000);
    });
});
