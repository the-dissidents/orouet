import { EventHost } from "@the_dissidents/svelte-ui";
import type { Id } from "./Schema";
import { RootCommit, VcsBackend, type Commit, type DeltaCommit, type VcsCommit, type VcsCommitAttrs, type VcsNewCommit, type VcsSnapshot } from "./Backend";
import { Debug } from "./details/Util";

export type VersionControlChange =
    | { type: 'add'; id: Id<Commit>; parent?: Id<Commit>; }
    | { type: 'attrs'; id: Id<Commit>; };

export interface ReadonlyVersionControl {
    readonly initialCommit: Id<Commit>;
    readonly latestCommit: Id<Commit>;
    readonly sortedCommits: readonly Id<Commit>[];

    /** Fired after commits are added or commit attributes change. */
    readonly onChanged: EventHost<[change: VersionControlChange]>;

    addAttr(attr: Partial<VcsCommitAttrs>): boolean;

    get<C extends Commit>(id: Id<C>): C;
    forwardLinks(id: Id<Commit>): Id<Commit>[];

    has(id: Id<Commit>): boolean;
    isDelta(id: Id<Commit>): id is Id<DeltaCommit>;
    isRoot(id: Id<Commit>): id is Id<RootCommit>;
}

/**
 * Frontend view of a Rust/SQLite-backed version control.
 *
 * Summaries (no ProseMirror steps) are loaded once on open. Appends update the
 * local summary immediately and are written through an ordered outbox, so
 * ProseMirror's synchronous dispatchTransaction path never awaits IPC.
 */
export class SqliteVersionControl implements ReadonlyVersionControl {
    readonly onChanged = new EventHost<[VersionControlChange]>();
    readonly initialCommit: Id<Commit>;
    readonly docId: string;

    #summaries = new Map<Id<Commit>, VcsCommit>();
    #forwardEdges = new Map<Id<Commit>, Id<Commit>[]>();
    #sorted: Id<Commit>[] = [];
    #latest: Id<Commit>;
    #nextSeq = 1;
    #queue: Promise<void> = Promise.resolve();
    #error: unknown;

    constructor(snapshot: VcsSnapshot) {
        this.docId = snapshot.docId;
        this.initialCommit = snapshot.initialCommit;

        for (const summary of snapshot.summaries) {
            this.#summaries.set(summary.id, summary);
            this.#sorted.push(summary.id);
            if (summary.type === 'delta') {
                const links = this.#forwardEdges.get(summary.parent) ?? [];
                links.push(summary.id);
                this.#forwardEdges.set(summary.parent, links);
            }
        }

        this.#latest = this.#sorted.at(-1) ?? this.initialCommit;
        this.#nextSeq = snapshot.nextSeq;
    }

    nextCommitId() {
        return String(this.#nextSeq++) as Id<Commit>;
    }

    get latestCommit() {
        return this.#latest;
    }

    get sortedCommits(): readonly Id<Commit>[] {
        return this.#sorted;
    }

    get commitCount() {
        return Math.max(0, this.#sorted.length - 1);
    }

    get<C extends Commit>(id: Id<C>) {
        const c = this.#summaries.get(id);
        Debug.assert(!!c);
        return this.#summaries.get(id) as C;
    }

    forwardLinks(id: Id<Commit>): Id<Commit>[] {
        return this.#forwardEdges.get(id) ?? [];
    }

    has(id: Id<Commit>): boolean {
        return id === this.initialCommit || this.#summaries.has(id);
    }

    isRoot(id: Id<Commit>): id is Id<RootCommit> {
        return this.#summaries.get(id)?.type === 'root';
    }

    isDelta(id: Id<Commit>): id is Id<DeltaCommit> {
        return this.#summaries.get(id)?.type === 'delta';
    }

    addAttr(attr: Partial<VcsCommitAttrs>): boolean {
        if (this.#latest === this.initialCommit) return false;
        const latest = this.#summaries.get(this.#latest);
        if (!latest) return false;

        Object.assign(latest.attrs, attr);
        this.onChanged.dispatch({ type: 'attrs', id: this.#latest });
        this.#enqueue(() => VcsBackend.updateAttrs(
            this.docId, this.#latest, attr as Partial<VcsCommitAttrs>));
        return true;
    }

    append(commit: VcsNewCommit): Id<Commit> {
        const id = commit.id as Id<Commit>;
        const parent = commit.parent as Id<Commit>;
        const seq = Number(id);
        const summary: VcsCommit = {
            type: 'delta',
            id,
            parent,
            attrs: { ...commit.attrs } as VcsCommitAttrs,
            seq,
        };
        this.#nextSeq = Math.max(this.#nextSeq, seq + 1);

        this.#summaries.set(id, summary);
        this.#sorted.push(id);
        const links = this.#forwardEdges.get(parent) ?? [];
        links.push(id);
        this.#forwardEdges.set(parent, links);
        this.#latest = id;

        this.onChanged.dispatch({ type: 'add', id, parent });
        this.#enqueue(() => VcsBackend.append(this.docId, commit));
        return id;
    }

    setCurrent(id: Id<Commit>) {
        this.#enqueue(() => VcsBackend.setCurrent(this.docId, id));
    }

    async planPath(from: Id<Commit>, to: Id<Commit>) {
        return await VcsBackend.planPath(this.docId, from, to);
    }

    async flush() {
        await this.#queue;
        if (this.#error) {
            const error = this.#error;
            this.#error = undefined;
            throw error;
        }
    }

    #enqueue(task: () => Promise<unknown>) {
        this.#queue = this.#queue
            .then(task)
            .then(() => {})
            .catch((error) => {
                this.#error = error;
                console.error('VCS write failed', error);
            });
    }
}
