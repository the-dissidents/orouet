import { Step, Transform } from "prosemirror-transform";
import { Id, PaneSchema, type Block, type Cluster, type Doc } from "./Schema";
import { Debug } from "./details/Util";
import { SvelteMap } from "svelte/reactivity";
import * as z from "zod/v4-mini";

const CommitBase = z.object({
    attrs: z.object({
        timestamp: z.number(),
        label: z.optional(z.string()),
        currentCluster: z.optional(Id<Cluster>()),
        fileSaved: z.optional(z.boolean()),
        selectionSet: z.optional(z.boolean()),
    })
});

type CommitBase = z.infer<typeof CommitBase>;

const ZStep = z.codec(z.unknown(), z.instanceof(Step), {
    decode: (v, ctx) => {
        try {
            return Step.fromJSON(PaneSchema, v);
        } catch (e: any) {
            ctx.issues.push({
                code: 'invalid_format',
                format: 'ProseMirror Step',
                input: `...`,
                message: e.message
            });
            return z.NEVER;
        }
    },
    encode: (v) => v.toJSON()
});

export const ZSteps = z.object({
    steps: z.array(ZStep),
    invertedSteps: z.array(ZStep),
})

export type Steps = z.infer<typeof ZSteps>;

export const DeltaCommit = z.object({
    ...CommitBase.shape,
    type: z.literal('delta'),
    id: Id<DeltaCommit>(),
    source: z.optional(ZSteps),
    target: z.optional(ZSteps),
    parent: Id<Commit>(),
});

export const MergeCommit = z.object({
    ...CommitBase.shape,
    type: z.literal('merge'),
    id: Id<MergeCommit>(),
    // todo
});

// to avoid typing difficulties with circular reference,
// we must write out the types again instead of using `z.infer`
export type DeltaCommit = CommitBase & {
    type: 'delta',
    id: Id<DeltaCommit>,
    source?: Steps,
    target?: Steps,
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

type PathSegment = {
    from?: PathSegment;
    source?: Step[];
    target?: Step[];
    to: Id<Commit>;
};

export type Docs = {
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

    addAttr(attr: Partial<CommitBase['attrs']>): boolean;

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

    addAttr(attr: Partial<CommitBase['attrs']>) {
        if (this.latestCommit == this.initialCommit) return false;
        const latest = this.get(this.latestCommit);
        Debug.assert(!!latest);
        Object.assign(latest.attrs, attr);
        return true;
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

    // modifies `trs`
    #apply(trs: Transforms, seg: PathSegment): Transforms {
        if (seg.source)
            for (const s of seg.source) trs.source.step(s);
        if (seg.target)
            for (const s of seg.target) trs.target.step(s);
        return trs;
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
                    Debug.assert(!!currentStep.from);
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
                    const c = this.get(to);
                    Debug.assert(!!c);
                    return {
                        from: step, to,
                        source: c.source?.steps,
                        target: c.target?.steps
                    };
                }));

            if (currentTo == this.initialCommit) continue;
            const c = this.#commits.get(currentTo);
            Debug.assert(!!c);

            if (c.type == 'delta') queue.push({
                from: step, to: c.parent,
                source: c.source?.invertedSteps,
                target: c.target?.invertedSteps
            });
        }

        return null;
    }
}
