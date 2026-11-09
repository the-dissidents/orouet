import { describe, expect, it } from "vitest";

import { normalizeLegacyImport, type LegacyCommit, type LegacyDocument } from "$lib/LegacyImport";

function commit(
    id: string,
    parent: string | undefined,
    type: 'delta' | 'merge' = 'delta',
    timestamp = 0,
): LegacyCommit {
    return {
        type,
        id,
        parent,
        attrs: { timestamp },
        source: { steps: [], invertedSteps: [] },
    };
}

function document(commits: LegacyCommit[], currentCommit: string): LegacyDocument {
    return {
        currentCommit,
        source: { content: 'source' },
        target: { content: 'target' },
        chats: [],
        vc: { initialCommit: 'initial', commits },
    };
}

describe("normalizeLegacyImport", () => {
    it("deduplicates, repairs parents and falls back to the latest commit", () => {
        const source = document([
            commit('initial', undefined),
            commit('c1', 'initial', 'delta', 1),
            commit('c2', 'c1', 'delta', 2),
            commit('c1', 'initial', 'delta', 3), // duplicate
            commit('orphan', 'missing', 'delta', 4),
            commit('merge', 'initial', 'merge', 5),
        ], 'missing');

        const { document: result, warnings } = normalizeLegacyImport(source);

        expect(result.commits.map((c) => c.id)).toEqual(['c1', 'c2', 'orphan', 'merge']);
        expect(result.commits.map((c) => c.parent)).toEqual(['initial', 'c1', 'initial', 'initial']);
        expect(result.commits.map((c) => c.kind)).toEqual(['delta', 'delta', 'delta', 'merge']);
        expect(result.currentCommit).toBe('merge');
        expect(result.source).toEqual({ content: 'source' });
        expect(result.target).toEqual({ content: 'target' });
        expect(warnings).toEqual(expect.arrayContaining([
            'dropping duplicate commit c1',
            're-parenting commit orphan from missing to initial',
            'current commit is missing; using merge',
        ]));
    });

    it("keeps a valid current commit", () => {
        const source = document([
            commit('c1', 'initial', 'delta', 1),
            commit('c2', 'c1', 'delta', 2),
        ], 'c1');

        const { document: result, warnings } = normalizeLegacyImport(source);

        expect(result.currentCommit).toBe('c1');
        expect(warnings).toEqual([]);
    });

    it("keeps the initial commit when it is empty", () => {
        const source = document([], 'initial');
        const { document: result } = normalizeLegacyImport(source);

        expect(result.currentCommit).toBe('initial');
        expect(result.commits).toEqual([]);
    });
});
