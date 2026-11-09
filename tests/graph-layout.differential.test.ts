import { describe, expect, it } from "vitest";
import type { BoundaryCondition } from "$lib/Boundary";
import { graphLayout, type GraphLayout } from "$lib/component/graph/Layout";
import type { Id } from "$lib/Schema";
import type { Commit } from "$lib/VersionControl.svelte";
import { FakeVersionControl } from "./fake-version-control";
import { referenceGraphLayout } from "./reference-layout";
import { GraphLayoutCache } from "$lib/component/graph/Cache";

function mulberry32(seed: number) {
    return () => {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const simplify = (layout: GraphLayout) => ({
    nodes: layout.nodes.map(({ id, x, y, maxX }) => ({ id, x, y, maxX })),
    edges: layout.edges
        .map(({ from, to, type }) => [from.id, to.id, type] as const)
        .sort((a, b) =>
            a[0].localeCompare(b[0])
            || a[1].localeCompare(b[1])
            || a[2].localeCompare(b[2])),
});

describe("graphLayout differential", () => {
    it("matches the reference implementation on random histories", () => {
        for (let seed = 0; seed < 1000; seed++) {
            const rng = mulberry32(seed);
            const vc = new FakeVersionControl(`initial-${seed}`);
            const ids: Id<Commit>[] = [];
            let timestamp = 0;

            const count = Math.floor(rng() * 35);
            for (let i = 0; i < count; i++) {
                const parent = ids.length === 0 || rng() < 0.35
                    ? vc.initialCommit
                    : ids[Math.floor(rng() * ids.length)];
                timestamp += 1 + Math.floor(rng() * 500);
                ids.push(vc.add(`c${i}`, parent, {
                    timestamp,
                    fileSaved: rng() < 0.15,
                    label: rng() < 0.1 ? `label-${i}` : undefined,
                    currentCluster: rng() < 0.5 ? 'x' : 'y',
                    selectionSet: rng() < 0.1,
                }));
            }

            const condition: BoundaryCondition = {
                delay: rng() < 0.5 ? Math.floor(rng() * 2000) : undefined,
                selectionSet: rng() < 0.5,
                focusedClusterChange: rng() < 0.5,
                hasLabel: rng() < 0.5,
                fileSaved: rng() < 0.5,
            };

            const currentCommitId = ids.length > 0 && rng() < 0.8
                ? ids[Math.floor(rng() * ids.length)]
                : vc.initialCommit;
            const currentDiffCommit = ids.length > 0 && rng() < 0.3
                ? ids[Math.floor(rng() * ids.length)]
                : undefined;

            const context = { versionControl: vc, currentCommitId, currentDiffCommit };
            const cache = new GraphLayoutCache(context.versionControl);
            cache.setCondition(condition);
            const actual = graphLayout(context, cache);
            const expected = referenceGraphLayout(context, condition);

            expect(simplify(actual), `seed ${seed}`).toEqual(simplify(expected));
        }
    });
});
