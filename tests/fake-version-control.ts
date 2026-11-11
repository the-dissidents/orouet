import { id, type Id } from "$lib/Schema";
import type { Commit, DeltaCommit, RootCommit } from "$lib/Backend";
import type { ReadonlyVersionControl } from "$lib/VersionControl";
import { Debug } from "$lib/details/Util";

export type FakeAttrs = {
    timestamp: number,
    label?: string,
    currentCluster?: string,
    fileSaved?: boolean,
    selectionSet?: boolean,
};

type FakeDelta = {
    type: 'delta',
    id: Id<DeltaCommit>,
    parent: Id<Commit>,
    attrs: FakeAttrs,
};

/**
 * Minimal append-only `ReadonlyVersionControl` for layout tests. Keeping the
 * layout dependent on this interface (rather than `DocumentContext`) means the
 * tests do not need to boot Svelte runes or ProseMirror.
 */
export class FakeVersionControl implements ReadonlyVersionControl {
    readonly onChanged = undefined as any;
    readonly initialCommit: Id<Commit>;
    #sorted: Id<Commit>[];
    #commits = new Map<Id<Commit>, FakeDelta>();
    #forward = new Map<Id<Commit>, Id<Commit>[]>();

    constructor(initial = 'initial') {
        this.initialCommit = id(initial);
        this.#sorted = [this.initialCommit];
    }

    get latestCommit() {
        return this.#sorted[this.#sorted.length - 1];
    }

    get sortedCommits(): readonly Id<Commit>[] {
        return this.#sorted;
    }

    get<C extends Commit>(id: Id<C>): C {
        if (id === this.initialCommit) return {
            type: 'root', id,
            attrs: { timestamp: 0 },
            seq: 0
        } satisfies RootCommit as unknown as C;
        const c = this.#commits.get(id);
        Debug.assert(!!c);
        return c as C;
    }

    forwardLinks(id: Id<Commit>): Id<Commit>[] {
        return this.#forward.get(id) ?? [];
    }

    has(id: Id<Commit>) {
        return id === this.initialCommit || this.#commits.has(id);
    }

    isDelta(id: Id<Commit>): id is Id<DeltaCommit> {
        return this.#commits.get(id)?.type === 'delta';
    }

    isRoot(id: Id<Commit>): id is Id<RootCommit> {
        return id === this.initialCommit;
    }

    addAttr(attr: Partial<FakeAttrs> = {}): boolean {
        const latest = this.#commits.get(this.latestCommit);
        if (!latest) return false;
        Object.assign(latest.attrs, attr);
        return true;
    }

    add(
        id: string,
        parent: Id<Commit>,
        attrs: FakeAttrs,
    ): Id<Commit> {
        const commitId = id as Id<DeltaCommit>;
        this.#commits.set(commitId, { type: 'delta', id: commitId, parent, attrs });
        this.#sorted.push(commitId);

        const links = this.#forward.get(parent) ?? [];
        links.push(commitId);
        this.#forward.set(parent, links);

        return commitId as Id<Commit>;
    }
}

/** Adds `ids` oldest-first on top of `initialCommit`. */
export function linearChain(
    ids: string[],
    attrs: (index: number) => Partial<FakeAttrs> = () => ({}),
    vc = new FakeVersionControl(),
) {
    let parent = vc.initialCommit;
    ids.forEach((id, i) => {
        parent = vc.add(id, parent, { timestamp: i, ...attrs(i) });
    });
    return vc;
}
