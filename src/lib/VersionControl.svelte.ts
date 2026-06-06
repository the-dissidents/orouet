import { Step, Transform } from "prosemirror-transform";
import { type Block, type Cluster, type Doc, type Id } from "./Schema";
import { Debug } from "./details/Util";
import { SvelteMap } from "svelte/reactivity";

export type Steps = {
    list: SerializedStep[],
    parent: Id<DeltaCommit>, // delta
};

export type CommitAttributes = {
    timestamp: number,
    label?: string,
    focusedBlock?: Id<Block>,
    focusedCluster?: Id<Cluster>,
    fileSaved?: boolean,
    selectionSet?: boolean,
};

type CommitBase = {
    where: 'source' | 'target',
    attrs: CommitAttributes,
};

export type SnapshotCommit = CommitBase & {
    type: 'snapshot',
    id: Id<SnapshotCommit>,
    content: SerializedDoc,
};

export type DeltaCommit = CommitBase & {
    type: 'delta',
    id: Id<DeltaCommit>,
    steps: Step[],
    invertedSteps: Step[],
    parent: Id<Commit>
};

export type Commit =
    | SnapshotCommit
    | DeltaCommit;

declare const serializedDoc: unique symbol;
export type SerializedDoc = { [serializedDoc]: 'serializedDoc' };

declare const serializedStep: unique symbol;
export type SerializedStep = { [serializedStep]: 'serializedStep' };

export function serializeDoc(d: Doc): SerializedDoc {
    return d.toJSON() as SerializedDoc;
}

export function serializeStep(d: Step): SerializedStep {
    return d.toJSON() as SerializedStep;
}

type PathSegment = {
    from?: PathSegment;
    steps?: Step[];
    where?: 'source' | 'target';
    to: Id<Commit>;
};

type Docs = {
    source: Doc,
    target: Doc
};

export type Transforms = {
    source: Transform,
    target: Transform
};

export interface ReadonlyVersionControl {
    readonly initialCommit: Id<Commit>;
    readonly latestCommit: Id<Commit>;
    readonly sortedCommits: readonly Id<Commit>[];

    get<C extends Commit>(id: Id<C>): C | undefined;
    forwardLinks(id: Id<Commit>): Id<Commit>[];

    isDelta(id: Id<Commit>): id is Id<DeltaCommit>;
}

export class VersionControl implements ReadonlyVersionControl {
    #commits = new SvelteMap<Id<Commit>, Commit>();
    #forwardEdges = new SvelteMap<Id<Commit>, Id<DeltaCommit>[]>();

    #sorted: Id<Commit>[];

    constructor(readonly initialCommit: Id<Commit>) {
        this.#sorted = $state([initialCommit]);
    }

    get latestCommit() {
        return this.#sorted.at(-1)!;
    }

    get sortedCommits() {
        return this.#sorted;
    }

    get<C extends Commit>(id: Id<C>): C | undefined {
        return this.#commits.get(id) as C | undefined;
    }

    forwardLinks(id: Id<Commit>): Id<Commit>[] {
        Debug.assert(this.#commits.has(id));
        return this.#forwardEdges.get(id) ?? [];
    }

    isDelta(id: Id<Commit>): id is Id<DeltaCommit> {
        return this.get(id)?.type == 'delta';
    }

    add(c: Commit) {
        const latest = this.get(this.latestCommit);
        Debug.assert(!latest || c.attrs.timestamp > latest.attrs.timestamp);
        Debug.assert(!this.#commits.has(c.id));
        this.#commits.set(c.id, c);
        this.#sorted.push(c.id);

        switch (c.type) {
            case "snapshot": break;
            case "delta":
                const list = this.#forwardEdges.get(c.parent) ?? [];
                list.push(c.id);
                this.#forwardEdges.set(c.parent, list);
                break;
            default:
                c satisfies never;
        }
    }

    #apply(trs: Transforms, seg: PathSegment): Transforms {
        Debug.assert(!!seg.steps && !!seg.where)
        let tr = trs[seg.where];
        for (const s of seg.steps) tr = tr.step(s);
        return { ...trs, [seg.where]: tr };
    }

    transform(docs: Docs, from: Id<Commit>, to: Id<Commit>): Transforms | null {
        const queue: PathSegment[] = [{ to: from }];
        const visited = new Set<Id<Commit>>();

        while (queue.length > 0) {
            const step = queue.shift()!;
            const currentTo = step.to;
            if (visited.has(currentTo)) continue;
            visited.add(currentTo);

            if (currentTo === to) {
                let currentStep = step, segs: PathSegment[] = [];
                while (currentStep.to !== from) {
                    Debug.assert(!!currentStep.from && !!currentStep.steps);
                    segs.unshift(currentStep); // reverse order
                    currentStep = currentStep.from;
                }

                let result: Transforms = {
                    source: new Transform(docs.source),
                    target: new Transform(docs.target)
                };
                segs.forEach((s) => result = this.#apply(result, s));
                return result;
            }

            const forward = this.#forwardEdges.get(currentTo);
            if (forward) queue.push(...forward.map(
                (to) => {
                    const t = this.get(to);
                    Debug.assert(!!t);
                    return { from: step, to, steps: t.steps, where: t.where }
                }));

            if (currentTo == this.initialCommit) continue;
            const c = this.#commits.get(currentTo);
            Debug.assert(!!c);

            if (c.type == 'delta') queue.push(
                { from: step, to: c.parent, steps: c.invertedSteps, where: c.where });
        }

        return null;
    }
}
