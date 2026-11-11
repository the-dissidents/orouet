import { describe, expect, it } from "vitest";
import type { BoundaryCondition } from "$lib/Boundary";
import { GraphLayoutCache } from "$lib/component/graph/Cache";
import { graphLayout, type GraphLayout } from "$lib/component/graph/Layout";
import type { Id } from "$lib/Schema";
import type { Commit } from "$lib/Backend";
import { FakeVersionControl } from "./fake-version-control";
import { referenceGraphLayout } from "./reference-layout";

function mulberry32(seed: number) {
    return () => {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const simplify = (layout: GraphLayout) => ({
    nodes: layout.nodes.map(({ commit, x, y, maxX }) => ({ id: commit.id, x, y, maxX })),
    edges: layout.edges
        .map(({ from, to, type }) => [from.commit.id, to.commit.id, type] as const)
        .sort((a, b) =>
            a[0].localeCompare(b[0])
            || a[1].localeCompare(b[1])
            || a[2].localeCompare(b[2])),
});

function randomCondition(rng: () => number): BoundaryCondition {
    return {
        delay: rng() < 0.5 ? Math.floor(rng() * 2000) : undefined,
        selectionSet: rng() < 0.5,
        focusedClusterChange: rng() < 0.5,
        hasLabel: rng() < 0.5,
        fileSaved: rng() < 0.5,
    };
}

function buildHistory(seed: number) {
    const rng = mulberry32(seed);
    const vc = new FakeVersionControl(`initial-${seed}`);
    const cache = new GraphLayoutCache(vc);
    const ids: Id<Commit>[] = [];
    let timestamp = 0;

    const count = 1 + Math.floor(rng() * 35);
    for (let i = 0; i < count; i++) {
        const parent = ids.length === 0 || rng() < 0.35
            ? vc.initialCommit
            : ids[Math.floor(rng() * ids.length)];
        timestamp += 1 + Math.floor(rng() * 500);
        const id = vc.add(`c${i}`, parent, {
            timestamp,
            fileSaved: rng() < 0.15,
            label: rng() < 0.1 ? `label-${i}` : undefined,
            currentCluster: rng() < 0.5 ? 'x' : 'y',
            selectionSet: rng() < 0.1,
        });
        ids.push(id);
        cache.notify({ type: 'add', id, parent });
    }

    return { vc, cache, ids, rng };
}

describe("GraphLayoutCache", () => {
    it("matches a full recompute while history grows incrementally", () => {
        for (let seed = 0; seed < 300; seed++) {
            const rng = mulberry32(seed);
            const vc = new FakeVersionControl(`initial-${seed}`);
            const cache = new GraphLayoutCache(vc);
            const ids: Id<Commit>[] = [];
            const condition = randomCondition(rng);
            let timestamp = 0;

            const count = 1 + Math.floor(rng() * 30);
            for (let step = 0; step < count; step++) {
                const parent = ids.length === 0 || rng() < 0.35
                    ? vc.initialCommit
                    : ids[Math.floor(rng() * ids.length)];
                timestamp += 1 + Math.floor(rng() * 500);
                const id = vc.add(`c${step}`, parent, {
                    timestamp,
                    fileSaved: rng() < 0.15,
                    label: rng() < 0.1 ? `label-${step}` : undefined,
                    currentCluster: rng() < 0.5 ? 'x' : 'y',
                    selectionSet: rng() < 0.1,
                });
                ids.push(id);
                cache.notify({ type: 'add', id, parent });

                // Attribute changes affect boundaries even without new commits.
                if (rng() < 0.25) {
                    vc.addAttr({
                        fileSaved: rng() < 0.5,
                        label: rng() < 0.2 ? `attr-${step}` : undefined,
                        currentCluster: rng() < 0.5 ? 'x' : 'y',
                        selectionSet: rng() < 0.2,
                    });
                    cache.notify({ type: 'attrs', id: vc.latestCommit });
                }

                const context = {
                    versionControl: vc,
                    currentCommitId: ids[Math.floor(rng() * ids.length)],
                    currentDiffCommit: rng() < 0.3
                        ? ids[Math.floor(rng() * ids.length)]
                        : undefined,
                };

                cache.setCondition(condition);
                const actual = graphLayout(context, cache);
                const expected = referenceGraphLayout(context, condition);

                expect(simplify(actual), `seed ${seed} step ${step}`)
                    .toEqual(simplify(expected));
            }
        }
    });

    it("resets cached data when the boundary condition changes", () => {
        const conditions: BoundaryCondition[] = [
            {},
            { fileSaved: true },
            { delay: 200 },
            { delay: 1000, hasLabel: true },
            { focusedClusterChange: true },
            { selectionSet: true },
            { delay: 0, fileSaved: true, focusedClusterChange: true },
        ];

        for (let seed = 0; seed < 100; seed++) {
            const { vc, cache, ids, rng } = buildHistory(seed);

            for (let i = 0; i < conditions.length * 2; i++) {
                const condition = conditions[i % conditions.length];
                const context = {
                    versionControl: vc,
                    currentCommitId: ids[Math.floor(rng() * ids.length)],
                    currentDiffCommit: rng() < 0.3
                        ? ids[Math.floor(rng() * ids.length)]
                        : undefined,
                };

                cache.setCondition(condition);
                const actual = graphLayout(context, cache);
                const expected = referenceGraphLayout(context, condition);

                expect(simplify(actual), `seed ${seed} condition ${i}`)
                    .toEqual(simplify(expected));
            }
        }
    });
});
