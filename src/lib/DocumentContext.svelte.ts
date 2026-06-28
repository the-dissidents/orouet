import { EventHost } from "@the_dissidents/svelte-ui";
import { Debug } from "./details/Util";
import { Doc, Id, id, makeBlock, makeCluster, makeDoc, PaneSchema, type Block, type Cluster } from "./Schema";
import { Commit, SerializedVersionControl, VersionControl, type DeltaCommit, type Docs, type ReadonlyVersionControl, type Transforms } from "./VersionControl.svelte";
import type { Transform } from "prosemirror-transform";
import { DefaultOptions, TextOptions } from "./TextOptions";
import * as z from "zod/v4-mini";
import { LanguageCodes, type LanguageCode } from "../data/LocaleData";
import { ChatSession, SerializedChatSession } from "./llm/ChatSession.svelte";

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
    vc: SerializedVersionControl,
    chats: z.array(SerializedChatSession),
});

export type SerializedDocumentContextJSON = z.input<typeof SerializedDocumentContext>;

export class DocumentContext {
    readonly source: Text;
    readonly target: Text;

    currentCluster = $state<Id<Cluster>>();
    currentDiffCommit = $state<Id<Commit>>();

    #currentCommit: Id<Commit>;
    #vc: VersionControl;
    #chats = $state<ChatSession[]>([]);

    get chats() { return this.#chats; }

    readonly onRevert = new EventHost<[cid: Id<Commit>, ts: Partial<Transforms>]>();

    serialize(): SerializedDocumentContextJSON {
        return z.encode(SerializedDocumentContext, {
            version: 1,
            source: this.source,
            target: this.target,
            currentCommit: this.#currentCommit,
            vc: this.#vc.serialize(),
            chats: this.#chats.map((x) => x.serialize()),
        });
    }

    static deserialize(s: SerializedDocumentContextJSON) {
        const decoded = z.decode(SerializedDocumentContext, s);
        const c = new DocumentContext(
            decoded.source, decoded.target, VersionControl.deserialize(decoded.vc));
        c.#currentCommit = decoded.currentCommit;
        c.#chats = decoded.chats.map((x) => ChatSession.deserialize(x));
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

    addTransform(
        where: 'source' | 'target', tr: Transform,
        opts?: {
            cid?: Id<DeltaCommit>,
            internal?: boolean
        }
    ) {
        Debug.assert(tr.steps.length > 0);
        const _id = opts?.cid ?? id();
        this.#vc.add({
            type: 'delta', where, id: _id,
            attrs: {
                timestamp: Date.now(),
                currentCluster: this.currentCluster
            },
            steps: tr.steps,
            invertedSteps: tr.steps.map((s, i) => s.invert(tr.docs[i])).reverse(),
            parent: this.#currentCommit
        });
        console.log(`created commit ${_id} with ${tr.steps.length} steps`);

        if (!opts?.internal)
            this.onRevert.dispatch(_id, { [where]: tr });
        this.#currentCommit = _id;
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

    getDocsAtCommit(cid: Id<Commit>) {
        const result = this.#vc.transform({
            source: this.source.content,
            target: this.target.content
        }, this.#currentCommit, cid);
        Debug.assert(!!result);
        return {
            source: result.source.doc as Doc,
            target: result.target.doc as Doc
        } satisfies Docs;
    }

    static fromTestClusters(s: string[]) {
        const clusters = s.map((x) => {
            const _id = id<Cluster>();
            return [
                makeCluster([makeBlock(PaneSchema.text(x.trim()))], 'text', _id),
                makeCluster([makeBlock([])], 'text', _id),
            ];
        });
        return new DocumentContext(
            {
                content: makeDoc(clusters.map((x) => x[0])),
                options: DefaultOptions.en,
                language: ['en', null, null]
            },
            {
                content: makeDoc(clusters.map((x) => x[1])),
                options: DefaultOptions.zh,
                language: ['zh', null, 'CN']
            }
        );
    }
}
