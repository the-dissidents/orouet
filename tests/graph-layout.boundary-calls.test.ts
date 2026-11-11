import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/Boundary", async (importOriginal) => {
    const actual = await importOriginal<typeof import("$lib/Boundary")>();
    return { ...actual, isBoundary: vi.fn(actual.isBoundary) };
});

import { isBoundary } from "$lib/Boundary";
import { GraphLayoutCache } from "$lib/component/graph/Cache";
import { graphLayout } from "$lib/component/graph/Layout";
import { FakeVersionControl } from "./fake-version-control";

const isBoundaryMock = vi.mocked(isBoundary);

describe("graphLayout boundary resolution", () => {
    beforeEach(() => {
        isBoundaryMock.mockClear();
    });

    it("computes boundaries once and reuses them across layout calls", () => {
        const vc = new FakeVersionControl();

        // A shared chain between the initial state and the branch point.
        let tip = vc.initialCommit;
        for (let i = 0; i < 100; i++) {
            tip = vc.add(`chain${i}`, tip, { timestamp: i });
        }

        // Many branches all forking from the tip of that chain.
        for (let i = 0; i < 100; i++) {
            vc.add(`leaf${i}`, tip, { timestamp: 1000 + i });
        }

        const cache = new GraphLayoutCache(vc);
        const context = {
            versionControl: vc,
            currentCommitId: vc.latestCommit,
        };

        isBoundaryMock.mockClear();
        const first = graphLayout(context, cache);

        // The first layout has to classify the whole history once.
        expect(isBoundaryMock.mock.calls.length).toBeLessThanOrEqual(210);

        // Every leaf is visible, plus the branch point (a commit with multiple
        // forward links is itself a boundary) and the initial commit.
        expect(first.nodes).toHaveLength(102);

        isBoundaryMock.mockClear();
        const second = graphLayout(context, cache);

        // Nothing changed, so no boundary needs to be recomputed.
        expect(isBoundaryMock.mock.calls.length).toBe(0);
        expect(second.nodes.map((node) => node.commit.id))
            .toEqual(first.nodes.map((node) => node.commit.id));
    });
});
