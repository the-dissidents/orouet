import { Step, Transform } from "prosemirror-transform";
import { Id, PaneSchema, type Block, type Cluster, type Doc } from "./Schema";
import { Debug } from "./details/Util";
import { SvelteMap } from "svelte/reactivity";
import * as z from "zod/v4-mini";

const CommitBase = z.object({
    where: z.enum(['source', 'target']),
    attrs: z.object({
        timestamp: z.number(),
        label: z.optional(z.string()),
        focusedBlock: z.optional(Id<Block>()),
        focusedCluster: z.optional(Id<Cluster>()),
        fileSaved: z.optional(z.boolean()),
        selectionSet: z.optional(z.boolean()),
    })
});

type CommitBase = z.infer<typeof CommitBase>;

const ZStep = z.codec(z.any(), z.instanceof(Step), {
    decode: (v, ctx) => {
        try {
            return Step.fromJSON(PaneSchema, v);
        } catch (e: any) {
            ctx.issues.push({
                code: 'invalid_format',
                format: 'ProseMirror Step',
                input: v,
                message: e.message
            });
            return z.NEVER;
        }
    },
    encode: (v) => v.toJSON()
});

export const DeltaCommit = z.object({
    ...CommitBase.shape,
    id: Id<DeltaCommit>(),
    steps: z.array(ZStep),
    invertedSteps: z.array(ZStep),
    parent: Id<Commit>(),
});

export const MergeCommit = z.object({
    ...CommitBase.shape,
    id: Id<MergeCommit>(),
    // todo
});

// to avoid typing difficulties with circular reference,
// we must write out the types again instead of using `z.infer`
export type DeltaCommit = CommitBase & {
    type: 'delta',
    id: Id<DeltaCommit>,
    steps: Step[],
    invertedSteps: Step[],
    parent: Id<Commit>
};

export type MergeCommit = CommitBase & {
    type: 'merge',
    id: Id<MergeCommit>,
    // todo
};

export const Commit = z.union([MergeCommit, DeltaCommit]);

export type Commit =
    | MergeCommit
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

export const SerializedVersionControl = z.object({
    version: z.literal(1),
    initialCommit: Id<Commit>(),
    commits: z.array(Commit)
});

export type SerializedVersionControl = z.infer<typeof SerializedVersionControl>;

export class VersionControl implements ReadonlyVersionControl {
    #commits = new SvelteMap<Id<Commit>, Commit>();
    #forwardEdges = new SvelteMap<Id<Commit>, Id<DeltaCommit>[]>();

    // actually maps guarentee insertion order, but we need the initial commit in
    // this array anyway and it's probably faster than using $derived from values
    #sorted: Id<Commit>[];

    constructor(readonly initialCommit: Id<Commit>) {
        this.#sorted = $state([initialCommit]);
    }

    serialize(): SerializedVersionControl {
        return {
            version: 1,
            initialCommit: this.initialCommit,
            commits: [...this.#commits.values()]
        };
    }

    static deserialize(s: SerializedVersionControl) {
        const vc = new VersionControl(s.initialCommit);
        s.commits.forEach((c) => vc.add(c as Commit));
        return vc;
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
        Debug.assert(this.#commits.has(id) || id === this.initialCommit);
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
            case "merge": break;
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
