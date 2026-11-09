import { invoke } from "@tauri-apps/api/core";
import { getPassword, setPassword, deletePassword } from "tauri-plugin-keyring-api";
import * as z from "zod/v4-mini";

import { Text } from "./TextSchema";
import { SerializedChatSession } from "./llm/ChatSchema";

export const Backend = {
    async saveCompressed(path: string, content: string) {
        await invoke<void>('save_compressed', {path, content});
    },

    async readCompressed(path: string) {
        return await invoke<string>('read_compressed', {path});
    },
}

const StepJson = z.looseObject({
    stepType: z.string(),
});

const StepsJsonSchema = z.object({
    steps: z.array(StepJson),
    invertedSteps: z.array(StepJson),
});

export type StepsJson = z.infer<typeof StepsJsonSchema>;

const VcsCommitAttrsSchema = z.object({
    timestamp: z.number(),
    label: z.optional(z.string()),
    currentCluster: z.optional(z.string()),
    fileSaved: z.optional(z.boolean()),
    selectionSet: z.optional(z.boolean()),
});

export type VcsCommitAttrs = z.infer<typeof VcsCommitAttrsSchema>;

const VcsCommitSummarySchema = z.object({
    id: z.string(),
    parent: z.optional(z.string()),
    type: z.enum(['root', 'delta', 'merge']),
    attrs: VcsCommitAttrsSchema,
    seq: z.number(),
});

export type VcsCommitSummary = z.infer<typeof VcsCommitSummarySchema>;

const VcsSnapshotSchema = z.object({
    docId: z.string(),
    path: z.optional(z.nullable(z.string())),
    initialCommit: z.string(),
    currentCommit: z.string(),
    checkpointCommit: z.string(),
    source: Text,
    target: Text,
    chats: z.array(SerializedChatSession),
    summaries: z.array(VcsCommitSummarySchema),
});

export type VcsSnapshot = z.infer<typeof VcsSnapshotSchema>;

const VcsPathSegmentSchema = z.object({
    id: z.string(),
    direction: z.enum(['forward', 'backward']),
    source: z.optional(StepsJsonSchema),
    target: z.optional(StepsJsonSchema),
});

export type VcsPathSegment = z.infer<typeof VcsPathSegmentSchema>;

const VcsPathSegmentsSchema = z.array(VcsPathSegmentSchema);

const VcsNewCommitSchema = z.object({
    id: z.string(),
    parent: z.string(),
    attrs: VcsCommitAttrsSchema,
    source: z.optional(StepsJsonSchema),
    target: z.optional(StepsJsonSchema),
});

export type VcsNewCommit = z.input<typeof VcsNewCommitSchema>;

const VcsImportCommitSchema = z.object({
    id: z.string(),
    parent: z.string(),
    kind: z.enum(['delta', 'merge']),
    attrs: VcsCommitAttrsSchema,
    source: z.optional(StepsJsonSchema),
    target: z.optional(StepsJsonSchema),
});

export type VcsImportCommit = z.input<typeof VcsImportCommitSchema>;

const VcsImportDocumentSchema = z.object({
    initialCommit: z.string(),
    currentCommit: z.string(),
    source: Text,
    target: Text,
    chats: z.array(SerializedChatSession),
    commits: z.array(VcsImportCommitSchema),
});

export type VcsImportDocument = z.input<typeof VcsImportDocumentSchema>;

export const VcsBackend = {
    async create(
        source: Text,
        target: Text,
        chats: SerializedChatSession[],
        path?: string,
    ) {
        const data = await invoke<z.input<typeof VcsSnapshotSchema>>('vcs_create', {
            path: path ?? null,
            source: z.encode(Text, source),
            target: z.encode(Text, target),
            chats,
        });
        return z.decode(VcsSnapshotSchema, data);
    },

    async open(path: string) {
        const data = await invoke<z.input<typeof VcsSnapshotSchema>>('vcs_open', {path});
        return z.decode(VcsSnapshotSchema, data);
    },

    async importLegacy(document: VcsImportDocument) {
        const decoded = z.decode(VcsImportDocumentSchema, document);
        const data = await invoke<z.input<typeof VcsSnapshotSchema>>('vcs_import', {
            document: {
                ...decoded,
                source: z.encode(Text, decoded.source),
                target: z.encode(Text, decoded.target),
            },
        });
        return z.decode(VcsSnapshotSchema, data);
    },

    async append(docId: string, commit: VcsNewCommit) {
        const data = await invoke<z.input<typeof VcsCommitSummarySchema>>('vcs_append', {docId, commit});
        return z.decode(VcsCommitSummarySchema, data);
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
        const data = await invoke<z.input<typeof VcsPathSegmentsSchema>>('vcs_plan_path', {docId, from, to});
        return z.decode(VcsPathSegmentsSchema, data);
    },

    async count(docId: string) {
        const data = await invoke<number>('vcs_count', {docId});
        return z.decode(z.number(), data);
    },

    async saveAs(docId: string, path: string) {
        const data = await invoke<z.input<typeof VcsSnapshotSchema>>('vcs_save_as', {docId, path});
        return z.decode(VcsSnapshotSchema, data);
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
