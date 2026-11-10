import * as z from "zod/v4-mini";
import { Text } from "./TextSchema";
import { Id, type Cluster, type Doc } from "./Schema";
import { SerializedChatSession } from "./llm/ChatSchema";
import type { EventHost } from "@the_dissidents/svelte-ui";
import type { Transform } from "prosemirror-transform";
import { invoke } from "@tauri-apps/api/core";
import { getPassword, setPassword, deletePassword } from "tauri-plugin-keyring-api";

export const Backend = {
    async saveCompressed(path: string, content: string) {
        await invoke<void>('save_compressed', {path, content});
    },

    async readCompressed(path: string) {
        return await invoke<string>('read_compressed', {path});
    },
}

export const StepJson = z.looseObject({
    stepType: z.string(),
});

export type StepJson = z.infer<typeof StepJson>;

export const StepsJson = z.object({
    steps: z.array(StepJson),
    invertedSteps: z.array(StepJson),
});

export type StepsJson = z.infer<typeof StepsJson>;

export const VcsCommitAttrs = z.object({
    timestamp: z.number(),
    label: z.optional(z.string()),
    currentCluster: z.optional(Id<Cluster>()),
    fileSaved: z.optional(z.boolean()),
    selectionSet: z.optional(z.boolean()),
});

export type VcsCommitAttrs = z.infer<typeof VcsCommitAttrs>;

// we can't use z.infer<> here because of the circular reference to Commit

export type RootCommit = {
    type: 'root';
    id: Id<Commit>;
    attrs: VcsCommitAttrs;
    seq: number;
};

export type DeltaCommit = {
    type: 'delta';
    id: Id<Commit>;
    parent: Id<Commit>;
    attrs: VcsCommitAttrs;
    seq: number;
};

export type MergeCommit = {
    type: 'merge';
    id: Id<Commit>;
    attrs: VcsCommitAttrs;
    seq: number;
};

export type Commit = RootCommit | DeltaCommit | MergeCommit;
export type VcsCommit = Commit;

export const RootCommit = z.object({
    type: z.literal('root'),
    id: Id<Commit>(),
    attrs: VcsCommitAttrs,
    seq: z.number(),
});

export const DeltaCommit = z.object({
    type: z.literal('delta'),
    id: Id<Commit>(),
    parent: Id<Commit>(),
    attrs: VcsCommitAttrs,
    seq: z.number(),
});

export const MergeCommit = z.object({
    type: z.literal('merge'),
    id: Id<Commit>(),
    attrs: VcsCommitAttrs,
    seq: z.number(),
});

export const VcsCommit = z.discriminatedUnion('type', [
    RootCommit,
    DeltaCommit,
    MergeCommit,
]);

export type Docs = {
    source: Doc;
    target: Doc;
};

export type Transforms = {
    source: Transform;
    target: Transform;
};

export type VersionControlChange =
    | { type: 'add'; id: Id<Commit>; parent?: Id<Commit> }
    | { type: 'attrs'; id: Id<Commit> };

export interface ReadonlyVersionControl {
    readonly initialCommit: Id<Commit>;
    readonly latestCommit: Id<Commit>;
    readonly sortedCommits: readonly Id<Commit>[];

    /** Fired after commits are added or commit attributes change. */
    readonly onChanged: EventHost<[change: VersionControlChange]>;

    addAttr(attr: Partial<VcsCommitAttrs>): boolean;

    get<C extends Commit>(id: Id<C>): C;
    forwardLinks(id: Id<Commit>): Id<Commit>[];

    has(id: Id<Commit>): boolean;
    isDelta(id: Id<Commit>): id is Id<DeltaCommit>;
}

export const VcsSnapshot = z.object({
    docId: z.string(),
    path: z.optional(z.nullable(z.string())),
    initialCommit: Id<Commit>(),
    currentCommit: Id<Commit>(),
    checkpointCommit: Id<Commit>(),
    nextSeq: z.number(),
    source: Text,
    target: Text,
    chats: z.array(SerializedChatSession),
    summaries: z.array(VcsCommit),
});

export type VcsSnapshot = z.infer<typeof VcsSnapshot>;

export const VcsPathSegment = z.object({
    id: z.string(),
    direction: z.enum(['forward', 'backward']),
    source: z.optional(StepsJson),
    target: z.optional(StepsJson),
});

export type VcsPathSegment = z.infer<typeof VcsPathSegment>;

export const VcsNewCommit = z.object({
    id: Id<Commit>(),
    parent: Id<Commit>(),
    attrs: VcsCommitAttrs,
    source: z.optional(StepsJson),
    target: z.optional(StepsJson),
});

export type VcsNewCommit = z.input<typeof VcsNewCommit>;

export const VcsImportCommit = z.object({
    id: Id<Commit>(),
    parent: Id<Commit>(),
    kind: z.enum(['delta', 'merge']),
    attrs: VcsCommitAttrs,
    source: z.optional(StepsJson),
    target: z.optional(StepsJson),
});

export type VcsImportCommit = z.input<typeof VcsImportCommit>;

export const VcsImportDocument = z.object({
    initialCommit: Id<Commit>(),
    currentCommit: Id<Commit>(),
    source: Text,
    target: Text,
    chats: z.array(SerializedChatSession),
    commits: z.array(VcsImportCommit),
});

export type VcsImportDocument = z.input<typeof VcsImportDocument>;

export const VcsBackend = {
    async create(
        source: Text,
        target: Text,
        chats: SerializedChatSession[],
        path?: string,
    ) {
        const data = await invoke<z.input<typeof VcsSnapshot>>('vcs_create', {
            path: path ?? null,
            source: z.encode(Text, source),
            target: z.encode(Text, target),
            chats,
        });
        return z.decode(VcsSnapshot, data);
    },

    async open(path: string) {
        const data = await invoke<z.input<typeof VcsSnapshot>>('vcs_open', {path});
        return z.decode(VcsSnapshot, data);
    },

    async importLegacy(document: VcsImportDocument) {
        const decoded = z.decode(VcsImportDocument, document);
        const data = await invoke<z.input<typeof VcsSnapshot>>('vcs_import', {
            document: {
                ...decoded,
                source: z.encode(Text, decoded.source),
                target: z.encode(Text, decoded.target),
            },
        });
        return z.decode(VcsSnapshot, data);
    },

    async append(docId: string, commit: VcsNewCommit) {
        const data = await invoke<z.input<typeof VcsCommit>>('vcs_append', {docId, commit});
        return z.decode(VcsCommit, data);
    },

    async updateAttrs(
        docId: string, id: string, attrs: Partial<VcsCommitAttrs>,
    ) {
        await invoke<void>('vcs_update_attrs', {docId, id, attrs});
    },

    async setCurrent(docId: string, id: string) {
        await invoke<void>('vcs_set_current', {docId, id});
    },

    async saveCheckpoint(
        docId: string,
        currentCommit: string,
        source: Text,
        target: Text,
        chats: SerializedChatSession[],
    ) {
        await invoke<void>('vcs_save_checkpoint', {
            docId,
            currentCommit,
            source: z.encode(Text, source),
            target: z.encode(Text, target),
            chats,
        });
    },

    async planPath(docId: string, from: string, to: string) {
        const data = await invoke<z.input<typeof VcsPathSegment>[]>('vcs_plan_path', {docId, from, to});
        return z.decode(z.array(VcsPathSegment), data);
    },

    async count(docId: string) {
        const data = await invoke<number>('vcs_count', {docId});
        return z.decode(z.number(), data);
    },

    async saveAs(docId: string, path: string) {
        const data = await invoke<z.input<typeof VcsSnapshot>>('vcs_save_as', {docId, path});
        return z.decode(VcsSnapshot, data);
    },
}

export const Secrets = {
    async get(name: string) {
        const value = await getPassword('secret', name);
        return value ?? null;
    },

    async set(name: string, value: string) {
        await setPassword('secret', name, value);
    },

    async delete(name: string) {
        await deletePassword('secret', name);
    },
}
