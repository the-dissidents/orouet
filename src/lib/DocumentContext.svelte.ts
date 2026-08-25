import { EventHost } from "@the_dissidents/svelte-ui";
import { Debug, range } from "./details/Util";
import { Doc, Id, id, makeBlock, makeCluster, makeDoc, PaneSchema, type Block, type Cluster } from "./Schema";
import { Commit, SerializedVersionControl, VersionControl, type DeltaCommit, type Docs, type ReadonlyVersionControl, type Steps, type Transforms } from "./VersionControl.svelte";
import { Transform } from "prosemirror-transform";
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

function transformToSteps(tr?: Transform): Steps | undefined {
    return tr ? {
        steps: tr.steps,
        invertedSteps: tr.steps.map(
            (s, i) => s.invert(tr!.docs[i])
        ).reverse()
    } : undefined;
}

export function balanceTargetClusters(source: Doc, targetTr: Transform) {
    let modified: boolean;
    do {
        const target = targetTr.doc as Doc;
        modified = false;
        target.forEach((c, offset, i) => {
            if (modified) return;

            const sc = source.maybeChild(i);
            if (!sc) {
                console.log('deleting', c.attrs.id, i);
                targetTr.delete(offset, offset + c.nodeSize);
                modified = true;
                return;
            }
            if (sc.attrs.id !== c.attrs.id) {
                let found = -1;
                for (let j = i+1; j < source.childCount; j++)
                    if (source.child(j).attrs.id == c.attrs.id) {
                        found = j;
                        break;
                    }

                if (found < 0) {
                    console.log('deleting', c.attrs.id, i);
                    targetTr.delete(offset, offset + c.nodeSize);
                } else {
                    // add the corresponding (found - i) clusters
                    console.log('inserting clusters', i, found);
                    targetTr.insert(offset, [...range(i, found)].map((k) => {
                        const sc = source.child(k);
                        return makeCluster([makeBlock([])], sc.attrs.kind, sc.attrs.id);
                    }));
                }

                modified = true;
                return;
            }
        });
    } while (modified);

    // add any missing clusters at the end
    const target = targetTr.doc as Doc;
    if (target.childCount < source.childCount) {
        console.log('inserting ending', target.childCount, source.childCount);
        targetTr.insert(target.content.size,
            [...range(target.childCount, source.childCount)].map((i) => {
                const sc = source.child(i);
                return makeCluster([makeBlock([])], sc.attrs.kind, sc.attrs.id);
            }));
    }

    return targetTr;
}

export class DocumentContext {
    readonly source: Text;
    readonly target: Text;

    currentCluster = $state<Id<Cluster>>();
    currentDiffCommit = $state<Id<Commit>>();

    #currentCommit: Id<Commit>;
    #vc: VersionControl;
    #chats = $state<ChatSession[]>([]);

    get chats() { return this.#chats; }

    /** Used to notify editors to apply transforms */
    readonly onTransform = new EventHost<[cid: Id<Commit>, ts: Partial<Transforms>]>();
    readonly onDocumentChanged = new EventHost<[]>();

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

    /** If clusters are added to or removed from source, this will automatically apply corresponding changes in target */
    addTransform(
        trs: Partial<Transforms>,
        opts?: {
            cid?: Id<DeltaCommit>,
            /** if true, the editor is already at a state where the transforms have been applied, and the `Text.content`s have already been modified (happens when the transform comes from user edit) */
            internal?: boolean
        }
    ) {
        Debug.assert(!!(trs.source?.steps.length || trs.target?.steps.length));

        const _id = opts?.cid ?? id();
        if (trs.source) {
            const newTr = new Transform(trs.target?.doc ?? this.target.content);
            balanceTargetClusters(trs.source.doc as Doc, newTr);
            if (newTr.docChanged) {
                if (!trs.target) {
                    trs.target = newTr;
                } else {
                    for (const step of newTr.steps)
                        trs.target?.step(step);
                }
                if (opts?.internal)
                    this.onTransform.dispatch(_id, { target: newTr });
            }
        }

        this.#vc.add({
            type: 'delta',
            id: _id,
            attrs: {
                timestamp: Date.now(),
                currentCluster: this.currentCluster
            },
            source: transformToSteps(trs.source),
            target: transformToSteps(trs.target),
            parent: this.#currentCommit
        });
        console.log(`created commit ${_id} with ${trs.source?.steps.length ?? 0}/${trs.target?.steps.length ?? 0} steps`);

        if (!opts?.internal) this.onTransform.dispatch(_id, trs);
        this.#currentCommit = _id;
    }

    revertTo(cid: Id<Commit>) {
        const result = this.#vc.transform({
            source: this.source.content,
            target: this.target.content
        }, this.#currentCommit, cid);
        Debug.assert(!!result);
        this.onTransform.dispatch(cid, result);
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
