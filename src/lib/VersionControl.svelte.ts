import { Step, Transform } from "prosemirror-transform";
import { id, PaneSchema, type Block, type Cluster, type Doc, type Id } from "./Schema";
import { Debug } from "./details/Util";
import { Node } from "prosemirror-model";
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
    steps: Steps,
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

type PathStep = {
    direction: 'forward' | 'backward';
    from?: PathStep;
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
        return this.get(id)!.type == 'delta';
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

    #apply(trs: Transforms, step: PathStep): Transforms {
        Debug.assert(!!step.from);
        const from = this.#commits.get(step.from.to);
        Debug.assert(!!from);

        let tr = trs[from.where];
        switch (from.type) {
            case "snapshot":
                tr = new Transform(Node.fromJSON(PaneSchema, from.content));
                break;
            case "delta":
                const steps = from.steps.list.map((x) => Step.fromJSON(PaneSchema, x));
                if (step.direction == 'forward') {
                    for (const s of steps)
                        tr = tr.step(s);
                } else {
                    let doc = tr.doc;
                    for (const s of steps.reverse()) {
                        const inverted = s.invert(doc);
                        const result = inverted.apply(doc).doc;
                        Debug.assert(!!result);
                        doc = result;
                        tr = tr.step(inverted);
                    }
                }
                break;
            default:
                from satisfies never;
        }
        return { ...trs, [from.where]: tr };
    }

    transform(docs: Docs, from: Id<Commit>, to: Id<Commit>): Transforms | null {
        const queue: PathStep[] = [{ direction: 'forward', to: from }];
        const visited = new Set<Id<Commit>>();

        while (queue.length > 0) {
            const step = queue.shift()!;
            const currentTo = step.to;
            if (visited.has(currentTo)) continue;
            visited.add(currentTo);

            if (currentTo === to) {
                let result: Transforms = {
                    source: new Transform(docs.source),
                    target: new Transform(docs.target)
                };
                let currentStep = step;
                while (currentStep.to !== from) {
                    Debug.assert(!!currentStep.from);
                    result = this.#apply(result, currentStep);
                    currentStep = currentStep.from;
                }
                return result;
            }

            const forward = this.#forwardEdges.get(currentTo);
            if (forward) queue.push(...forward.map(
                (to) => ({ direction: 'forward' as const, from: step, to })));

            if (currentTo == this.initialCommit) continue;
            const c = this.#commits.get(currentTo);
            Debug.assert(!!c);

            if (c.type == 'delta') queue.push(
                { direction: 'backward', from: step, to: c.parent });
        }

        return null;
    }
}
