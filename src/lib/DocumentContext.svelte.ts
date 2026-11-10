import { EventHost } from "@the_dissidents/svelte-ui";
import { Debug, range } from "./details/Util";
import { Doc, Id, id, makeBlock, makeCluster, makeDoc, PaneSchema, type Cluster } from "./Schema";
import { VcsBackend, type Commit, type DeltaCommit, type Docs, type StepsJson, type Transforms, type VcsSnapshot } from "./Backend";
import { Step, Transform } from "prosemirror-transform";
import { DefaultOptions } from "./TextOptions";
import { ChatSession } from "./llm/ChatSession.svelte";
import { normalizeLegacyImport } from "./LegacyImport";
import { SqliteVersionControl } from "./SqliteVersionControl";
import { LocaleId, Text } from "./TextSchema";

export { LocaleId, Text };

function transformToSteps(tr?: Transform): StepsJson | undefined {
    return tr ? {
        steps: tr.steps.map((s) => s.toJSON()),
        invertedSteps: tr.steps.map(
            (s, i) => s.invert(tr!.docs[i]).toJSON()
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
    #vc: SqliteVersionControl;
    #chats = $state<ChatSession[]>([]);
    #path: string | undefined;
    #lastTimestamp = 0;

    get chats() { return this.#chats; }
    get path() { return this.#path; }
    get commitCount() { return this.#vc.commitCount; }
    get docId() { return this.#vc.docId; }

    /** Used to notify editors to apply transforms *before* `source` or `target` changes. Dispatched by this class. */
    readonly onTransform = new EventHost<[cid: Id<Commit>, ts: Partial<Transforms>]>();

    /** Fired after `source` or `target` changed. Dispatched by the editors.  */
    readonly onDocumentChanged = new EventHost<[]>();

    private constructor(
        source: Text,
        target: Text,
        vc: SqliteVersionControl,
        currentCommit: Id<Commit>,
        chats: ChatSession[] = [],
    ) {
        Debug.assert(source.content.type === PaneSchema.topNodeType);
        Debug.assert(target.content.type === PaneSchema.topNodeType);

        const clustersMatch =
            source.content.childCount === target.content.childCount
            && [...range(0, source.content.childCount)].every((i) =>
                source.content.child(i).attrs.id === target.content.child(i).attrs.id);

        if (!clustersMatch) {
            console.warn("repairing document, history may be lost");
            const tr = balanceTargetClusters(source.content, new Transform(target.content));
            target.content = tr.doc as Doc;
        }

        this.source = $state(source);
        this.target = $state(target);
        this.#vc = vc;
        this.#currentCommit = $state(currentCommit);
        this.#chats = chats;
    }

    static async open(path: string) {
        return await DocumentContext.#fromSnapshot(await VcsBackend.open(path));
    }

    static async createDemo(clusters: string[]) {
        const { source, target } = DocumentContext.#demoTexts(clusters);
        const snapshot = await VcsBackend.create(source, target, []);
        return DocumentContext.#fromSnapshot(snapshot);
    }

    static async fromTestClusters(clusters: string[]) {
        return await DocumentContext.createDemo(clusters);
    }

    static async importLegacy(source: unknown) {
        const { document, warnings } = normalizeLegacyImport(source);
        for (const warning of warnings) console.warn(warning);
        return await DocumentContext.#fromSnapshot(await VcsBackend.importLegacy(document));
    }

    static async #fromSnapshot(snapshot: VcsSnapshot) {
        const source = snapshot.source;
        const target = snapshot.target;
        const chats = snapshot.chats.map((x) => ChatSession.deserialize(x));
        const vc = new SqliteVersionControl(snapshot);
        const ctx = new DocumentContext(
            source, target, vc,
            snapshot.currentCommit,
            chats,
        );
        ctx.#path = snapshot.path ?? undefined;

        // The checkpoint may lag behind currentCommit after a crash. Replay
        // only the commits between checkpoint and current.
        if (snapshot.checkpointCommit !== snapshot.currentCommit) {
            const trs = await ctx.#pathTransform(
                snapshot.checkpointCommit,
                snapshot.currentCommit,
            );
            if (trs) {
                ctx.source.content = trs.source.doc as Doc;
                ctx.target.content = trs.target.doc as Doc;
            }
        }
        return ctx;
    }

    static #demoTexts(s: string[]) {
        const clusters = s.map((x) => {
            const _id = id<Cluster>();
            return [
                makeCluster([makeBlock(PaneSchema.text(x.trim()))], 'text', _id),
                makeCluster([makeBlock([])], 'text', _id),
            ];
        });
        return {
            source: {
                content: makeDoc(clusters.map((x) => x[0])),
                options: DefaultOptions.en,
                language: ['en', null, null] as LocaleId,
            } satisfies Text,
            target: {
                content: makeDoc(clusters.map((x) => x[1])),
                options: DefaultOptions.zh,
                language: ['zh', null, 'CN'] as LocaleId,
            } satisfies Text,
        };
    }

    get currentCommitId() {
        return this.#currentCommit;
    }

    get versionControl() {
        return this.#vc;
    }

    async flush() {
        await this.#vc.flush();
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

        const _id = opts?.cid ?? id<DeltaCommit>();
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

        const timestamp = Math.max(Date.now(), this.#lastTimestamp + 1);
        this.#lastTimestamp = timestamp;
        this.#vc.append({
            id: _id,
            attrs: {
                timestamp,
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

    async revertTo(cid: Id<Commit>) {
        await this.#vc.flush();
        const result = await this.#pathTransform(this.#currentCommit, cid);
        Debug.assert(!!result);
        this.onTransform.dispatch(cid, result);
        this.#currentCommit = cid;
        this.#vc.setCurrent(cid);
    }

    async getDocsAtCommit(cid: Id<Commit>) {
        await this.#vc.flush();
        const result = await this.#pathTransform(this.#currentCommit, cid);
        Debug.assert(!!result);
        return {
            source: result.source.doc as Doc,
            target: result.target.doc as Doc
        } satisfies Docs;
    }

    async #pathTransform(from: Id<Commit>, to: Id<Commit>): Promise<Transforms | null> {
        const segments = await this.#vc.planPath(from, to);
        const result: Transforms = {
            source: new Transform(this.source.content),
            target: new Transform(this.target.content),
        };

        for (const segment of segments) {
            const sourceSteps = segment.direction === 'backward'
                ? segment.source?.invertedSteps
                : segment.source?.steps;
            const targetSteps = segment.direction === 'backward'
                ? segment.target?.invertedSteps
                : segment.target?.steps;

            for (const raw of sourceSteps ?? [])
                result.source.step(Step.fromJSON(PaneSchema, raw));
            for (const raw of targetSteps ?? [])
                result.target.step(Step.fromJSON(PaneSchema, raw));
        }

        return result;
    }

    async save() {
        await this.#vc.flush();
        await VcsBackend.saveCheckpoint(
            this.docId,
            this.#currentCommit,
            this.source,
            this.target,
            this.#chats.map((x) => x.serialize()),
        );
        this.#vc.addAttr({ fileSaved: true });
        await this.#vc.flush();
    }

    async saveAs(path: string) {
        await this.#vc.flush();
        await VcsBackend.saveCheckpoint(
            this.docId,
            this.#currentCommit,
            this.source,
            this.target,
            this.#chats.map((x) => x.serialize()),
        );
        await VcsBackend.saveAs(this.docId, path);
        this.#path = path;
        await this.save();
    }
}
