import { EventHost } from "@the_dissidents/svelte-ui";
import { Debug } from "./details/Util";
import { id, makeBlock, makeCluster, makeDoc, PaneSchema, type Doc, type Id } from "./Schema";
import { serializeStep, VersionControl, type Commit, type DeltaCommit, type ReadonlyVersionControl, type Transforms } from "./VersionControl.svelte";
import type { Step, Transform } from "prosemirror-transform";
import { DefaultOptions, type TextOptions } from "./TextOptions";

export type Text = {
    content: Doc,
    options: TextOptions
};

export class DocumentContext {
    readonly source: Text;
    readonly target: Text;

    #currentCommit: Id<Commit>;
    #vc: VersionControl;

    readonly onRevert = new EventHost<[cid: Id<Commit>, ts: Transforms]>();

    get currentCommitId() {
        return this.#currentCommit;
    }

    get versionControl(): ReadonlyVersionControl {
        return this.#vc;
    }

    private constructor(
        source: Text,
        target: Text,
        initialCommit: Id<Commit> = id()
    ) {
        Debug.assert(source.content.type === PaneSchema.topNodeType);
        Debug.assert(target.content.type === PaneSchema.topNodeType);
        Debug.assert(source.content.childCount === target.content.childCount);

        this.source = $state(source);
        this.target = $state(target);

        this.#vc = new VersionControl(initialCommit);
        this.#currentCommit = $state(initialCommit);
    }

    addTransform(where: 'source' | 'target', tr: Transform, cid: Id<DeltaCommit> = id()) {
        Debug.assert(tr.steps.length > 0);
        this.#vc.add({
            type: 'delta', where, id: cid,
            attrs: {
                timestamp: Date.now(),
            },
            steps: tr.steps,
            invertedSteps: tr.steps.map((s, i) => s.invert(tr.docs[i])).reverse(),
            parent: this.#currentCommit
        });
        console.log(`created commit ${cid} with ${tr.steps.length} steps`);
        this.#currentCommit = cid;
    }

    revertTo(cid: Id<Commit>) {
        const result = this.#vc.transform({
            source: this.source.content,
            target: this.target.content
        }, this.#currentCommit, cid);
        Debug.assert(!!result);
        this.onRevert.dispatch(cid, result);
        this.#currentCommit = cid;
    }

    static fromTestClusters(s: string[]) {
        return new DocumentContext(
            {
                content: makeDoc(s.map((x) =>
                    makeCluster(id(), [makeBlock(id(), PaneSchema.text(x.trim()))]))),
                options: DefaultOptions.en
            },
            {
                content: makeDoc(s.map(() =>
                    makeCluster(id(), [makeBlock(id(), [])]))),
                options: DefaultOptions.zh
            }
        );
    }
}
