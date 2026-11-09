import { EventHost } from "@the_dissidents/svelte-ui";
import type { Id, Cluster } from "./Schema";
import type {
    Commit,
    DeltaCommit,
    ReadonlyVersionControl,
    Steps,
    VersionControlChange,
} from "./VersionControl.svelte";
import {
    VcsBackend,
    type VcsCommitAttrs,
    type VcsCommitSummary,
    type VcsPathSegment,
    type VcsSnapshot,
} from "./Backend";

export type CommitSummary = {
    id: Id<Commit>;
    parent?: Id<Commit>;
    type: 'root' | 'delta' | 'merge';
    attrs: {
        timestamp: number;
        label?: string;
        currentCluster?: Id<Cluster>;
        fileSaved?: boolean;
        selectionSet?: boolean;
    };
    seq: number;
    depth: number;
};

type WireSteps = {
    steps: unknown[];
    invertedSteps: unknown[];
};

function encodeSteps(steps?: Steps): WireSteps | undefined {
    return steps ? {
        steps: steps.steps.map((s) => s.toJSON()),
        invertedSteps: steps.invertedSteps.map((s) => s.toJSON()),
    } : undefined;
}

function fromWire(s: VcsCommitSummary): CommitSummary {
    return {
        id: s.id as Id<Commit>,
        parent: s.parent as Id<Commit> | undefined,
        type: s.type,
        attrs: {
            timestamp: s.attrs.timestamp,
            label: s.attrs.label,
            currentCluster: s.attrs.currentCluster as Id<Cluster> | undefined,
            fileSaved: s.attrs.fileSaved,
            selectionSet: s.attrs.selectionSet,
        },
        seq: s.seq,
        depth: s.depth,
    };
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

    #summaries = new Map<Id<Commit>, CommitSummary>();
    #forwardEdges = new Map<Id<Commit>, Id<Commit>[]>();
    #sorted: Id<Commit>[] = [];
    #latest: Id<Commit>;
    #queue: Promise<void> = Promise.resolve();
    #error: unknown;

    constructor(snapshot: VcsSnapshot) {
        this.docId = snapshot.docId;
        this.initialCommit = snapshot.initialCommit as Id<Commit>;

        for (const raw of snapshot.summaries) {
            const summary = fromWire(raw);
            this.#summaries.set(summary.id, summary);
            this.#sorted.push(summary.id);
            if (summary.parent) {
                const links = this.#forwardEdges.get(summary.parent) ?? [];
                links.push(summary.id);
                this.#forwardEdges.set(summary.parent, links);
            }
        }

        this.#latest = this.#sorted.at(-1) ?? this.initialCommit;
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

    get<C extends Commit>(id: Id<C>): C | undefined {
        // The initial state has no commit object, matching the previous model.
        if (id === this.initialCommit) return undefined;
        return this.#summaries.get(id) as unknown as C | undefined;
    }

    forwardLinks(id: Id<Commit>): Id<Commit>[] {
        return this.#forwardEdges.get(id) ?? [];
    }

    has(id: Id<Commit>): boolean {
        return id === this.initialCommit || this.#summaries.has(id);
    }

    isDelta(id: Id<Commit>): id is Id<DeltaCommit> {
        return this.#summaries.get(id)?.type === 'delta';
    }

    addAttr(attr: Partial<CommitSummary['attrs']>): boolean {
        if (this.#latest === this.initialCommit) return false;
        const latest = this.#summaries.get(this.#latest);
        if (!latest) return false;

        Object.assign(latest.attrs, attr);
        this.onChanged.dispatch({ type: 'attrs', id: this.#latest });
        this.#enqueue(() => VcsBackend.updateAttrs(
            this.docId, this.#latest, attr as Partial<VcsCommitAttrs>));
        return true;
    }

    append(commit: Commit): Id<Commit> {
        if (commit.type !== 'delta') {
            throw new Error('merge commits are not supported yet');
        }
        const parent = commit.parent;
        const parentDepth = parent
            ? this.#summaries.get(parent)?.depth ?? 0
            : 0;
        const summary: CommitSummary = {
            id: commit.id,
            parent,
            type: commit.type,
            attrs: { ...commit.attrs },
            seq: this.#sorted.length + 1,
            depth: parentDepth + 1,
        };

        this.#summaries.set(summary.id, summary);
        this.#sorted.push(summary.id);
        if (parent) {
            const links = this.#forwardEdges.get(parent) ?? [];
            links.push(summary.id);
            this.#forwardEdges.set(parent, links);
        }
        this.#latest = summary.id;

        this.onChanged.dispatch({
            type: 'add',
            id: summary.id,
            parent,
        });

        this.#enqueue(() => VcsBackend.append(this.docId, {
            id: commit.id,
            parent: parent!,
            attrs: commit.attrs,
            source: encodeSteps(commit.type === 'delta' ? commit.source : undefined),
            target: encodeSteps(commit.type === 'delta' ? commit.target : undefined),
        }));
        return summary.id;
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

export type { VcsPathSegment };
