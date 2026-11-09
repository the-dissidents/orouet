import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    append: vi.fn(async () => ({})),
    updateAttrs: vi.fn(async () => {}),
    setCurrent: vi.fn(async () => {}),
    planPath: vi.fn(async () => []),
    count: vi.fn(async () => 0),
}));

vi.mock("$lib/Backend", () => ({
    VcsBackend: mocks,
}));

import type { Commit } from "$lib/VersionControl.svelte";
import type { Id } from "$lib/Schema";
import type { VcsSnapshot } from "$lib/Backend";
import { SqliteVersionControl } from "$lib/SqliteVersionControl";

const id = <T>(value: string) => value as Id<T>;

function snapshot(): VcsSnapshot {
    return {
        docId: 'doc',
        initialCommit: 'initial',
        currentCommit: 'c1',
        checkpointCommit: 'c1',
        source: null,
        target: null,
        chats: [],
        summaries: [
            {
                id: 'initial', type: 'root', seq: 1,
                attrs: { timestamp: 0 },
            },
            {
                id: 'c1', parent: 'initial', type: 'delta', seq: 2,
                attrs: { timestamp: 1 },
            },
        ],
    };
}

const commit = (idValue: string, parent: string, timestamp: number): Commit => ({
    type: 'delta',
    id: id(idValue),
    parent: id(parent),
    attrs: { timestamp },
});

describe("SqliteVersionControl", () => {
    beforeEach(() => {
        mocks.append.mockClear();
        mocks.updateAttrs.mockClear();
        mocks.setCurrent.mockClear();
        mocks.planPath.mockClear();
    });

    it("loads summaries and keeps the initial commit object-less", () => {
        const vc = new SqliteVersionControl(snapshot());

        expect(vc.sortedCommits).toEqual(['initial', 'c1']);
        expect(vc.commitCount).toBe(1);
        expect(vc.get(vc.initialCommit)).toBeUndefined();
        expect(vc.get(id<Commit>('c1'))).toMatchObject({
            type: 'delta',
            parent: 'initial',
            attrs: { timestamp: 1 },
        });
    });

    it("appends locally first and drains writes in order", async () => {
        const vc = new SqliteVersionControl(snapshot());
        const changes: string[] = [];
        vc.onChanged.bind({}, (change) => { changes.push(change.type); });

        vc.append(commit('c2', 'c1', 2));

        // The graph/editor can see the new commit before IPC completes.
        expect(vc.sortedCommits).toEqual(['initial', 'c1', 'c2']);
        expect(vc.forwardLinks(id<Commit>('c1'))).toEqual(['c2']);
        expect(changes).toEqual(['add']);
        expect(mocks.append).not.toHaveBeenCalled();

        await vc.flush();

        expect(mocks.append).toHaveBeenCalledOnce();
        expect(mocks.append).toHaveBeenCalledWith('doc', {
            id: 'c2',
            parent: 'c1',
            attrs: { timestamp: 2 },
            source: undefined,
            target: undefined,
        });
    });

    it("updates attrs and current commit through the same outbox", async () => {
        const vc = new SqliteVersionControl(snapshot());

        expect(vc.addAttr({ fileSaved: true })).toBe(true);
        expect(vc.get(id<Commit>('c1'))?.attrs.fileSaved).toBe(true);

        vc.setCurrent(id<Commit>('initial'));
        await vc.flush();

        expect(mocks.updateAttrs).toHaveBeenCalledWith('doc', 'c1', { fileSaved: true });
        expect(mocks.setCurrent).toHaveBeenCalledWith('doc', 'initial');
    });

    it("delegates path planning to the backend", async () => {
        const vc = new SqliteVersionControl(snapshot());
        const path = [{ id: 'c2', direction: 'forward' }] as never;
        mocks.planPath.mockResolvedValueOnce(path);

        await expect(vc.planPath(id<Commit>('c1'), id<Commit>('c2')))
            .resolves.toEqual(path);
    });
});
