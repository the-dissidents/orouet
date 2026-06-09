import { EventHost } from "@the_dissidents/svelte-ui";
import { Debug } from "./details/Util";
import { Doc, Id, id, makeBlock, makeCluster, makeDoc, PaneSchema } from "./Schema";
import { Commit, SerializedVersionControl, VersionControl, type DeltaCommit, type ReadonlyVersionControl, type Transforms } from "./VersionControl.svelte";
import type { Transform } from "prosemirror-transform";
import { DefaultOptions, TextOptions } from "./TextOptions";
import * as z from "zod/v4-mini";
import { LanguageCodes, type LanguageCode } from "../data/LocaleData";

export const LocaleId = z.tuple([
    z.nullable(z.enum(Object.keys(LanguageCodes) as LanguageCode[])),
    z.nullable(z.string()),
    z.nullable(z.string()),
]);

export type LocaleId = z.infer<typeof LocaleId>;

export const Text = z.object({
    content: Doc,
    language: z._default(LocaleId, ['en', null, null]),
    options: TextOptions
});

export type Text = z.infer<typeof Text>;

const SerializedDocumentContext = z.object({
    version: z.literal(1),
    source: Text,
    target: Text,
    currentCommit: Id<Commit>(),
    vc: SerializedVersionControl
});

export type SerializedDocumentContextJSON = z.input<typeof SerializedDocumentContext>;

export class DocumentContext {
    readonly source: Text;
    readonly target: Text;

    #currentCommit: Id<Commit>;
    #vc: VersionControl;

    readonly onRevert = new EventHost<[cid: Id<Commit>, ts: Transforms]>();

    serialize(): SerializedDocumentContextJSON {
        return z.encode(SerializedDocumentContext, {
            version: 1,
            source: this.source,
            target: this.target,
            currentCommit: this.#currentCommit,
            vc: this.#vc.serialize()
        });
    }

    static deserialize(s: SerializedDocumentContextJSON) {
        const decoded = z.decode(SerializedDocumentContext, s);
        const c = new DocumentContext(
            decoded.source, decoded.target, VersionControl.deserialize(decoded.vc));
        c.#currentCommit = decoded.currentCommit;
        return c;
    }

    get currentCommitId() {
        return this.#currentCommit;
    }

    get versionControl(): ReadonlyVersionControl {
        return this.#vc;
    }

    private constructor(
        source: Text,
        target: Text,
        vc = new VersionControl(id())
    ) {
        Debug.assert(source.content.type === PaneSchema.topNodeType);
        Debug.assert(target.content.type === PaneSchema.topNodeType);
        Debug.assert(source.content.childCount === target.content.childCount);

        this.source = $state(source);
        this.target = $state(target);

        this.#vc = vc;
        this.#currentCommit = $state(vc.initialCommit);
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
                    makeCluster([makeBlock(PaneSchema.text(x.trim()))]))),
                options: DefaultOptions.en,
                language: ['en', null, null]
            },
            {
                content: makeDoc(s.map(() =>
                    makeCluster([makeBlock([])]))),
                options: DefaultOptions.zh,
                language: ['zh', null, 'CN']
            }
        );
    }
}
